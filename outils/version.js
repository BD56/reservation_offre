// Numéro de version de l'application, le même dans TOUS les fichiers envoyés à Apps Script.
// Au démarrage (doGet) et dans « Installer », le serveur vérifie que chaque fichier est
// présent et porte ce numéro ; sinon : « Installation incomplète » (cf. Installation.gs).
//
//   node outils/version.js              nouveau numéro (date et heure de Paris) partout
//   node outils/version.js 2026.10.13-1 numéro choisi
//   node outils/version.js --verifier   contrôle seulement (erreur si numéros différents)
//
// Marques : dans un .gs, `function version_<Nom>_() { return "…"; }` ;
//           dans un .html, attribut `data-version="…"` sur <html> (pages complètes) ou
//           sur la 1re balise <script> / <style> (morceaux). Pas de commentaire <!-- --> :
//           Apps Script les retire quand il relit le fichier (constaté sur un vrai Sheet).
const fs = require("fs");
const path = require("path");
const racine = path.join(__dirname, "..");

const fichiers = () =>
  fs
    .readdirSync(racine)
    .filter((f) => f.endsWith(".gs") || f.endsWith(".html"))
    .sort();
const nomGs = (f) => f.replace(/\.gs$/, "");
const RE_GS = /function version_(\w+)_\(\) \{\s*return "([^"]*)";\s*\}/;
const RE_HTML = /data-version="([^"]*)"/;

function lire(f) {
  const src = fs.readFileSync(path.join(racine, f), "utf8");
  const m = f.endsWith(".gs") ? RE_GS.exec(src) : RE_HTML.exec(src);
  if (!m) return null;
  if (f.endsWith(".gs") && m[1] !== nomGs(f)) return "mauvais nom : version_" + m[1] + "_";
  return f.endsWith(".gs") ? m[2] : m[1];
}

function marquer(f, version) {
  const chemin = path.join(racine, f);
  let src = fs.readFileSync(chemin, "utf8");
  if (f.endsWith(".gs")) {
    const ligne =
      "// Même numéro dans tous les fichiers : contrôle de l'installation (outils/version.js).\n" +
      "function version_" +
      nomGs(f) +
      '_() {\n  return "' +
      version +
      '";\n}\n';
    if (RE_GS.test(src)) src = src.replace(RE_GS, ligne.split("\n").slice(1).join("\n").trimEnd());
    else {
      // après le commentaire d'en-tête du fichier
      const i = src.indexOf("\n\n");
      src = src.slice(0, i + 2) + ligne + "\n" + src.slice(i + 2);
    }
  } else {
    const marque = 'data-version="' + version + '"';
    if (RE_HTML.test(src)) src = src.replace(RE_HTML, marque);
    else if (/<html[\s>]/.test(src)) src = src.replace(/<html([^>]*)>/, "<html$1 " + marque + ">");
    else src = src.replace(/<(script|style|svg)([^>]*)>/, "<$1$2 " + marque + ">");
  }
  fs.writeFileSync(chemin, src);
}

function nouveauNumero() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value])
  );
  return p.year + "." + p.month + "." + p.day + "-" + p.hour + p.minute;
}

const arg = process.argv[2];
if (arg === "--verifier") {
  const v = Object.fromEntries(fichiers().map((f) => [f, lire(f)]));
  const numeros = [...new Set(Object.values(v))];
  if (numeros.length === 1 && numeros[0] && !numeros[0].startsWith("mauvais")) {
    console.log("Version " + numeros[0] + " dans les " + fichiers().length + " fichiers.");
  } else {
    console.log("⚠️ Versions différentes ou absentes :");
    for (const [f, n] of Object.entries(v)) console.log("  " + f + " : " + (n || "aucune"));
    process.exit(1);
  }
} else {
  const version = arg || nouveauNumero();
  if (!/^[\w.-]+$/.test(version)) throw new Error("Numéro invalide : " + version);
  fichiers().forEach((f) => marquer(f, version));
  console.log("Version " + version + " écrite dans " + fichiers().length + " fichiers.");
}
