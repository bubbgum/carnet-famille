/**
 * Carnet de famille — service d'envoi des notifications (Cloudflare Worker)
 *
 * Rôle : garder la liste des rappels programmés par le téléphone et envoyer
 * chaque notification à l'heure prévue, même quand l'application est fermée.
 *
 * - Aucune dépendance : copier-coller ce fichier dans l'éditeur Cloudflare suffit.
 * - Clés VAPID générées automatiquement au premier appel et gardées dans KV.
 * - Liaison KV obligatoire, nommée CARNET_KV.
 * - Déclencheur Cron conseillé : "* /15 * * * *" (toutes les 15 min, sans l'espace) ou "0 * * * *".
 * - Variable facultative ALLOWED_ORIGIN : ex. "https://monpseudo.github.io".
 * - Variable facultative CONTACT : ex. "mailto:vous@exemple.fr" (demandé par Apple/Google).
 *
 * Données gardées pour chaque téléphone : l'adresse d'abonnement push et, pour
 * chaque rappel à venir, sa date d'envoi et son court texte (sujet + personne).
 * Rien d'autre : pas de notes, pas d'historique.
 */

const PUSH_HOSTS = [
  /(^|\.)push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
];
const MAX_REMINDERS = 400;
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    try {
      if (!env.CARNET_KV) return json({ error: "La liaison KV « CARNET_KV » manque dans les réglages du Worker." }, 500, cors);

      if (request.method === "GET" && url.pathname === "/") {
        return json({ ok: true, service: "carnet-famille-push" }, 200, cors);
      }
      if (request.method === "GET" && url.pathname === "/vapid") {
        const v = await getVapid(env, true);
        return json({ publicKey: v.publicKey }, 200, cors);
      }
      if (request.method === "POST" && url.pathname === "/sync") {
        const body = await readJson(request);
        const id = String(body.id || "");
        if (!ID_RE.test(id)) return json({ error: "Identifiant invalide." }, 400, cors);
        const sub = cleanSubscription(body.subscription);
        if (!sub) return json({ error: "Abonnement push invalide." }, 400, cors);
        const now = Date.now();
        const reminders = (Array.isArray(body.reminders) ? body.reminders : [])
          .map(cleanReminder)
          .filter((r) => r && Date.parse(r.at) > now - 3600e3)
          .sort((a, b) => a.at.localeCompare(b.at))
          .slice(0, MAX_REMINDERS);
        await env.CARNET_KV.put("sub:" + id, JSON.stringify({ subscription: sub, reminders, updatedAt: new Date().toISOString() }));
        return json({ ok: true, scheduled: reminders.length, next: reminders[0]?.at || null }, 200, cors);
      }
      if (request.method === "POST" && url.pathname === "/test") {
        const body = await readJson(request);
        const id = String(body.id || "");
        if (!ID_RE.test(id)) return json({ error: "Identifiant invalide." }, 400, cors);
        const rec = await env.CARNET_KV.get("sub:" + id, "json");
        if (!rec) return json({ error: "Ce téléphone n'est pas encore enregistré. Activez d'abord les notifications." }, 404, cors);
        const res = await sendPush(env, rec.subscription, {
          title: "Carnet de famille",
          body: "Les notifications fonctionnent. Vous serez prévenue avant chaque échéance.",
          tag: "test",
        });
        return json({ ok: res.ok, status: res.status }, res.ok ? 200 : 502, cors);
      }
      if (request.method === "POST" && url.pathname === "/unsubscribe") {
        const body = await readJson(request);
        const id = String(body.id || "");
        if (ID_RE.test(id)) await env.CARNET_KV.delete("sub:" + id);
        return json({ ok: true }, 200, cors);
      }
      return json({ error: "Adresse inconnue." }, 404, cors);
    } catch (e) {
      return json({ error: "Erreur du service : " + (e && e.message ? e.message : String(e)) }, 500, cors);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDue(env));
  },
};

/* ---------- Envoi des rappels arrivés à échéance ---------- */
export async function runDue(env, nowMs = Date.now()) {
  const report = { checked: 0, sent: 0, removed: 0 };
  let cursor;
  do {
    const page = await env.CARNET_KV.list({ prefix: "sub:", cursor });
    cursor = page.list_complete ? undefined : page.cursor;
    for (const k of page.keys) {
      report.checked++;
      const rec = await env.CARNET_KV.get(k.name, "json");
      if (!rec || !Array.isArray(rec.reminders)) continue;
      const due = rec.reminders.filter((r) => Date.parse(r.at) <= nowMs);
      if (!due.length) continue;
      const keep = rec.reminders.filter((r) => Date.parse(r.at) > nowMs);
      let gone = false;
      for (const r of due) {
        // Un rappel resté en attente plus d'un jour (service en panne…) n'est plus envoyé.
        if (nowMs - Date.parse(r.at) > 24 * 3600e3) continue;
        const res = await sendPush(env, rec.subscription, { title: r.title, body: r.body, tag: r.tag });
        if (res.status === 404 || res.status === 410) { gone = true; break; }
        if (res.ok) report.sent++;
        else if ((res.status === 429 || res.status >= 500) && (r.tries || 0) < 3) keep.push({ ...r, tries: (r.tries || 0) + 1 });
      }
      if (gone) { await env.CARNET_KV.delete(k.name); report.removed++; continue; }
      rec.reminders = keep.sort((a, b) => a.at.localeCompare(b.at));
      await env.CARNET_KV.put(k.name, JSON.stringify(rec));
    }
  } while (cursor);
  return report;
}

/* ---------- Validation ---------- */
function cleanSubscription(s) {
  if (!s || typeof s.endpoint !== "string" || !s.keys) return null;
  let u;
  try { u = new URL(s.endpoint); } catch { return null; }
  if (u.protocol !== "https:" || !PUSH_HOSTS.some((re) => re.test(u.hostname))) return null;
  const p256dh = String(s.keys.p256dh || ""), auth = String(s.keys.auth || "");
  if (!/^[A-Za-z0-9_=-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_=-]{16,32}$/.test(auth)) return null;
  return { endpoint: s.endpoint, keys: { p256dh, auth } };
}
function cleanReminder(r) {
  if (!r || typeof r.at !== "string" || isNaN(Date.parse(r.at))) return null;
  return {
    at: new Date(Date.parse(r.at)).toISOString(),
    title: String(r.title || "Carnet de famille").slice(0, 120),
    body: String(r.body || "").slice(0, 240),
    tag: String(r.tag || "").slice(0, 64),
  };
}

/* ---------- Web Push (RFC 8291 + VAPID RFC 8292) ---------- */
export async function sendPush(env, subscription, message) {
  const vapid = await getVapid(env, false);
  if (!vapid) return { ok: false, status: 500 };
  const payload = new TextEncoder().encode(JSON.stringify(message));
  const body = await encryptPayload(subscription, payload);
  const endpoint = new URL(subscription.endpoint);
  const jwt = await vapidJwt(vapid, endpoint.origin, env.CONTACT || "mailto:carnet-famille@example.com");
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
      Topic: (message.tag || "carnet").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "carnet",
    },
    body,
  });
  return { ok: res.status >= 200 && res.status < 300, status: res.status };
}

async function getVapid(env, create) {
  let v = await env.CARNET_KV.get("vapid", "json");
  if (!v && create) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
    v = { jwk, publicKey: b64u(raw) };
    await env.CARNET_KV.put("vapid", JSON.stringify(v));
  }
  return v;
}

export async function vapidJwt(vapid, audience, subject) {
  const enc = new TextEncoder();
  const header = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const jwk = { kty: vapid.jwk.kty, crv: vapid.jwk.crv, x: vapid.jwk.x, y: vapid.jwk.y, d: vapid.jwk.d };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(header + "." + claims)));
  return header + "." + claims + "." + b64u(sig);
}

export async function encryptPayload(subscription, plaintext) {
  const enc = new TextEncoder();
  const uaPublic = b64uDecode(subscription.keys.p256dh);
  const authSecret = b64uDecode(subscription.keys.auth);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));

  const prkKey = await hmac(authSecret, ecdhSecret);
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1]));
  const ikm = await hmac(prkKey, keyInfo);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const padded = concat(plaintext, new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

/* ---------- Outils ---------- */
async function hmac(keyBytes, data) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
}
function concat(...arrs) {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
function b64u(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uDecode(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function readJson(request) {
  const text = await request.text();
  if (text.length > 200000) throw new Error("Requête trop volumineuse.");
  try { return JSON.parse(text || "{}"); } catch { throw new Error("JSON invalide."); }
}
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGIN || "*").split(",").map((s) => s.trim()).filter(Boolean);
  const allow = allowed.includes("*") ? "*" : (allowed.includes(origin) ? origin : allowed[0]);
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
}
