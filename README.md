# Carnet de famille

Application web installable (PWA) pour suivre les échéances de la famille : santé, véhicule, maison et entretien, activités. Les fiches restent sur le téléphone. Un petit service Cloudflare envoie les notifications, même quand l'app est fermée.

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `index.html` | L'application (généré depuis `src/app.html`) |
| `config.js` | **À modifier** : adresse du service d'envoi |
| `sw.js` | Service worker : hors ligne + réception des notifications |
| `manifest.webmanifest`, `icons/` | Installation sur l'écran d'accueil |
| `worker/worker.js` | Service d'envoi à copier dans Cloudflare |
| `src/`, `tools/` | Source et scripts (`python3 tools/build.py` régénère `index.html`) |

---

## Étape 1 — Mettre l'app sur GitHub Pages

1. Sur github.com : **New repository**, nom `carnet-famille`, **Public** (GitHub Pages gratuit exige un dépôt public ; le code ne contient aucune donnée personnelle).
2. **Add file › Upload files** : glisser tout le contenu du dossier (pas le dossier lui-même), puis **Commit changes**.
3. **Settings › Pages** : Source = *Deploy from a branch*, Branch = `main`, dossier `/ (root)`, **Save**.
4. Après 1 à 2 minutes, l'app est en ligne sur `https://VOTRE-PSEUDO.github.io/carnet-famille/`.

## Étape 2 — Créer le service d'envoi sur Cloudflare (gratuit)

1. Créer un compte sur dash.cloudflare.com.
2. **Storage & Databases › KV** › **Create** : nom `carnet-kv`.
3. **Compute (Workers) › Create › Worker** › nom `carnet-push` › **Deploy**.
4. **Edit code** : remplacer tout le code par le contenu de `worker/worker.js` › **Deploy**.
5. Dans le Worker, onglet **Settings** :
   - **Bindings › Add › KV namespace** : nom de variable `CARNET_KV`, espace `carnet-kv`.
   - **Variables and Secrets** : `ALLOWED_ORIGIN` = `https://VOTRE-PSEUDO.github.io` ; `CONTACT` = `mailto:votre@email.fr`.
   - **Trigger Events › Add › Cron Triggers** : `*/15 * * * *` (vérifie toutes les 15 minutes).
6. Copier l'adresse du Worker (ex. `https://carnet-push.votre-pseudo.workers.dev`). En l'ouvrant dans un navigateur, vous devez voir `{"ok":true,...}`.

## Étape 3 — Relier les deux

Sur GitHub, ouvrir `config.js` › crayon (Edit) › coller l'adresse du Worker dans `workerUrl` › **Commit changes**.

## Étape 4 — Installer sur l'iPhone (iOS 16.4 ou plus récent)

1. Ouvrir `https://VOTRE-PSEUDO.github.io/carnet-famille/` dans **Safari**.
2. **Partager** › **Sur l'écran d'accueil** › **Ajouter**.
3. Ouvrir **Carnet** depuis l'écran d'accueil, touchez la cloche › **Activer les notifications** › **Autoriser**.
4. **Envoyer un test** : une notification doit arriver en quelques secondes.

> Les fiches saisies dans Safari ne sont pas reprises dans l'app installée : commencez la saisie après l'installation. Pour récupérer les fiches de l'aperçu Claude : **Membres › Exporter une copie** dans l'aperçu, puis **Importer une copie** dans l'app installée.

## Confidentialité

- Les fiches et les notes sont enregistrées uniquement sur le téléphone.
- Le service Cloudflare ne reçoit, pour chaque rappel à venir, que la date d'envoi et le texte « sujet — personne ». Les rappels envoyés sont effacés.
- Pensez à **Exporter une copie** de temps en temps (changement de téléphone, suppression de l'app).

## Mettre à jour l'app

Modifier `src/app.html`, lancer `python3 tools/build.py`, puis envoyer `index.html` sur GitHub. En cas de changement de `sw.js`, augmenter `VERSION` en haut du fichier.
