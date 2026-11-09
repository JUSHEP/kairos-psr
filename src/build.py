"""Arma index.html (un solo archivo) a partir de shell.html, engine.js, presets.js y app.js."""
from pathlib import Path
base = Path(__file__).resolve().parent
html = (base / "shell.html").read_text(encoding="utf-8")
for marca, archivo in (("/*__ENGINE__*/", "engine.js"), ("/*__PRESETS__*/", "presets.js"), ("/*__APP__*/", "app.js")):
    html = html.replace(marca, (base / archivo).read_text(encoding="utf-8"))
(base.parent / "index.html").write_text(html, encoding="utf-8")
print("index.html listo")
