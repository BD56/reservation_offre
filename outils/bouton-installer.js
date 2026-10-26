// Dessine l'image du bouton vert « ▶ Installer l'application » (onglet « Démarrer » du
// modèle) et l'inscrit dans Assistant.gs (constante BOUTON_INSTALLER_PNG, en base64).
// Usage : node outils/bouton-installer.js   (à relancer seulement pour changer le bouton)
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const fichier = path.join(__dirname, "..", "Assistant.gs");
const html = `<!doctype html><html><body style="margin:0;background:transparent">
<div id="b" style="width:320px;height:64px;box-sizing:border-box;border-radius:12px;background:#15803d;
  box-shadow:inset 0 -3px 0 rgba(0,0,0,.18);color:#fff;display:flex;align-items:center;justify-content:center;
  gap:10px;font:700 20px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <svg width="18" height="20" viewBox="0 0 18 20"><path d="M2 1.5v17l14.5-8.5z" fill="#fff"/></svg>
  Installer l'application</div></body></html>`;

(async () => {
  const navigateur = await chromium.launch();
  const page = await navigateur.newPage({ deviceScaleFactor: 2 });
  await page.setContent(html);
  const png = await (await page.$("#b")).screenshot({ omitBackground: true });
  await navigateur.close();
  const src = fs.readFileSync(fichier, "utf8");
  const re = /const BOUTON_INSTALLER_PNG = "[^"]*";/;
  if (!re.test(src)) throw new Error("constante BOUTON_INSTALLER_PNG introuvable dans Assistant.gs");
  fs.writeFileSync(
    fichier,
    src.replace(re, 'const BOUTON_INSTALLER_PNG = "' + png.toString("base64") + '";')
  );
  console.log("Bouton : " + png.length + " octets (PNG) inscrits dans Assistant.gs");
})();
