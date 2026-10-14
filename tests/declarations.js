// Noms déclarés au premier niveau des fichiers de l'application (une seule portée
// globale par côté) : serveur = tous les .gs ; page = les <script> classiques des
// morceaux Script*.html (un <script type="module"> a sa propre portée).
// Utilisé par eslint.config.mjs et tests/test_fichiers.js.
const fs = require("fs"),
  path = require("path");
const espree = require("espree");

function nomsDeclares(js) {
  const ast = espree.parse(js, { ecmaVersion: 2022, sourceType: "script" });
  const noms = [];
  for (const n of ast.body) {
    if (n.type === "FunctionDeclaration") noms.push(n.id.name);
    else if (n.type === "VariableDeclaration")
      n.declarations.forEach((d) => d.id.type === "Identifier" && noms.push(d.id.name));
  }
  return noms;
}
function scriptsClassiques(html) {
  return [...html.matchAll(/<script(?![^>]*type="module")[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}
function fichiersGs(repo) {
  return fs
    .readdirSync(repo)
    .filter((f) => f.endsWith(".gs"))
    .sort();
}
function morceauxPage(repo) {
  return fs
    .readdirSync(repo)
    .filter((f) => /^(Script\w*|Style|Icones)\.html$/.test(f))
    .sort();
}
// { fichier: [noms] } pour un côté
function declarationsServeur(repo) {
  const r = {};
  for (const f of fichiersGs(repo)) r[f] = nomsDeclares(fs.readFileSync(path.join(repo, f), "utf8"));
  return r;
}
function declarationsPage(repo) {
  const r = {};
  for (const f of morceauxPage(repo))
    r[f] = scriptsClassiques(fs.readFileSync(path.join(repo, f), "utf8")).flatMap(nomsDeclares);
  return r;
}
module.exports = { nomsDeclares, fichiersGs, morceauxPage, declarationsServeur, declarationsPage };
