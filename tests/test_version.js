// Contrôle de l'installation : tous les fichiers présents et au même numéro de version,
// sinon « Installation incomplète » au lieu d'une application à moitié à jour.
const assert = require("assert");
const fs = require("fs");
const { execFileSync } = require("child_process");
const { makeEnv } = require("./mocks");
const { valeurGlobale } = require("./harness");
const repo = process.argv[2];
try {
  // 1) Dépôt : même numéro partout, listes de fichiers à jour
  execFileSync("node", [repo + "/outils/version.js", "--verifier"], { encoding: "utf8" });
  const env0 = makeEnv({ repo });
  const disque = (ext) =>
    fs
      .readdirSync(repo)
      .filter((f) => f.endsWith(ext))
      .map((f) => f.slice(0, -ext.length))
      .sort();
  assert.deepStrictEqual(
    [...valeurGlobale(env0.ctx, "FICHIERS_SERVEUR")].sort(),
    disque(".gs"),
    "FICHIERS_SERVEUR"
  );
  assert.deepStrictEqual(
    [...valeurGlobale(env0.ctx, "FICHIERS_PAGE")].sort(),
    disque(".html"),
    "FICHIERS_PAGE"
  );
  assert.deepStrictEqual([...env0.ctx.verifierInstallation_()], [], "installation complète");

  // doGet : page normale si tout va bien
  function env1() {
    const env = makeEnv({ repo });
    env.ctx.HtmlService.createTemplateFromFile = () => ({
      evaluate: () => ({
        normale: true,
        setTitle() {
          return this;
        },
        addMetaTag() {
          return this;
        },
        setXFrameOptionsMode() {
          return this;
        },
      }),
    });
    return env;
  }
  let e = env1();
  assert.ok(e.ctx.doGet({}).normale, "application ouverte");

  // 2) Un .gs resté à l'ancienne version -> page « Installation incomplète »
  e = env1();
  e.ctx.version_Operations_ = () => "2020.01.01-0000";
  let p = e.ctx.doGet({});
  assert.strictEqual(p.titre, "Installation incomplète");
  assert.match(p.contenu, /Operations\.gs : version 2020\.01\.01-0000 au lieu de/);

  // 3) Un .gs absent (fonction de version inexistante)
  e = env1();
  e.ctx.version_Reservations_ = undefined;
  assert.match(e.ctx.doGet({}).contenu, /Reservations\.gs : absent/);

  // 4) Morceau de page absent, ou ancien (sans numéro)
  e = env1();
  const lire = e.ctx.HtmlService.createHtmlOutputFromFile;
  e.ctx.HtmlService.createHtmlOutputFromFile = (nom) => {
    if (nom === "ScriptOffres") throw new Error("Aucun fichier HTML nommé ScriptOffres");
    if (nom === "Style") return { getContent: () => "<style></style>" };
    return lire(nom);
  };
  p = e.ctx.doGet({});
  assert.match(p.contenu, /ScriptOffres\.html : absent/);
  assert.match(p.contenu, /Style\.html : sans numéro de version/);
  assert.doesNotMatch(p.contenu, /Index\.html/, "les autres fichiers sont bons");

  // 5) Panne du contrôle lui-même : l'accueil n'est pas bloqué (application ouverte)
  e = env1();
  e.ctx.version_Installation_ = undefined;
  assert.ok(e.ctx.doGet({}).normale, "contrôle en panne : application quand même ouverte");
  e = env1();
  e.ctx.HtmlService.createHtmlOutputFromFile = () => {
    throw new Error("Service indisponible");
  };
  assert.ok(e.ctx.doGet({}).normale, "lecture impossible : application quand même ouverte");

  // 6) Comme sur un vrai Sheet : Apps Script retire les commentaires <!-- --> en relisant
  //    un fichier -> la marque (attribut data-version) doit rester lisible
  e = env1();
  const lire3 = e.ctx.HtmlService.createHtmlOutputFromFile;
  e.ctx.HtmlService.createHtmlOutputFromFile = (nom) => {
    const c = lire3(nom)
      .getContent()
      .replace(/<!--[\s\S]*?-->/g, "");
    return { getContent: () => c };
  };
  assert.deepStrictEqual([...e.ctx.verifierInstallation_()], [], "marques lisibles sans les commentaires");
  console.log("test_version : OK");
} catch (err) {
  console.log("test_version : ÉCHEC " + ((err && err.stack) || err));
  process.exit(1);
}
