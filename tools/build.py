"""Construit index.html (version GitHub) à partir de src/app.html."""
from pathlib import Path
root = Path(__file__).resolve().parent.parent
app = (root / "src" / "app.html").read_text(encoding="utf-8")
head = """<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0E1411">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Carnet">
<meta name="robots" content="noindex">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<style>html{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style>
<script src="config.js"></script>
</head>
<body>
"""
(root / "index.html").write_text(head + app + "\n</body>\n</html>\n", encoding="utf-8")
print("index.html construit")
