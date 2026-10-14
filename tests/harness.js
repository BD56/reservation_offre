// Mini-émulateur Apps Script pour tester le code serveur (*.gs) + rendu des templates hors ligne.
const fs = require("fs"),
  vm = require("vm");
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function renderTemplate(src, vars) {
  // <?!= raw ?>, <?= escaped ?>  (pas de <? code ?> utilisé dans ce projet)
  return src.replace(/<\?(!=|=)([\s\S]*?)\?>/g, (m, kind, expr) => {
    const v = vm.runInNewContext(expr, Object.assign({}, vars));
    return kind === "!=" ? String(v) : esc(v);
  });
}
// Tous les .gs de la racine, dans l'ordre alphabétique (00_Constantes.gs en premier),
// exécutés dans UNE même portée globale, comme dans Apps Script.
function fichiersGs(repo) {
  return fs
    .readdirSync(repo)
    .filter((f) => f.endsWith(".gs"))
    .sort();
}
function loadCode(repo, ctx) {
  ctx.Date = Date;
  ctx.JSON = JSON;
  vm.createContext(ctx);
  for (const f of fichiersGs(repo))
    vm.runInContext(fs.readFileSync(repo + "/" + f, "utf8"), ctx, { filename: f });
  return ctx;
}
function makeProps(init) {
  const store = Object.assign({}, init || {});
  return {
    getProperties: () => Object.assign({}, store),
    getProperty: (k) => (k in store ? store[k] : null),
    setProperty: (k, v) => {
      store[k] = String(v);
    },
    setProperties: (o) => {
      for (const k in o) store[k] = String(o[k]);
    },
    deleteProperty: (k) => {
      delete store[k];
    },
    deleteAllProperties: () => {
      for (const k in store) delete store[k];
    },
    _store: store,
  };
}
// Page de la tablette telle que doGet la produit : Index.html + morceaux insérés par
// include_ (même règle que Application.gs::include_ : fichier .html inséré tel quel).
function rendrePage(repo, vars) {
  return renderTemplate(
    fs.readFileSync(repo + "/Index.html", "utf8"),
    Object.assign({ include_: (nom) => fs.readFileSync(repo + "/" + nom + ".html", "utf8") }, vars)
  );
}
// Valeur d'une constante du premier niveau (const / let ne sont pas des propriétés
// de l'objet global : on la lit par son nom dans la portée du code chargé).
function valeurGlobale(ctx, nom) {
  return vm.runInContext(nom, ctx);
}
module.exports = { valeurGlobale, renderTemplate, rendrePage, loadCode, fichiersGs, makeProps, esc };
