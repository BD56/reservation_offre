// Installation : onglets et colonnes créés par le code (classeur vide, en-tête vide ou
// incomplet), rien n'est jamais écrasé, idempotente ; création à la 1re ouverture de
// l'application ; menu du Google Sheets et compte rendu.
const assert = require("assert");
const { makeEnv, classeurVide, lignes } = require("./mocks");
const { FakeSheet } = require("./fakesheet");
const repo = process.argv[2];
const J = (x) => JSON.parse(JSON.stringify(x));
try {
  // --- Classeur vide : les 3 onglets sont créés avec leurs en-têtes ---
  const env = makeEnv({ repo, sheets: {} });
  const rapport = env.ctx.installer_();
  assert.match(
    rapport,
    /Onglet « Operations » créé[\s\S]*Onglet « Reservations » créé[\s\S]*Onglet « Articles » créé/
  );
  assert.match(rapport, /Version \d{4}\.\d{2}\.\d{2}/);
  const attendus = J(classeurVide());
  for (const nom of ["Operations", "Reservations", "Articles"]) {
    assert.deepStrictEqual(
      env.sheets[nom].getDataRange().getValues()[0],
      attendus[nom].cells[0],
      nom + " : en-têtes"
    );
  }
  // L'application fonctionne aussitôt
  env.ctx.saveOperation({
    nom: "Test",
    type: "Evenement",
    modeSaisie: "",
    dateDebut: "",
    dateFin: "",
    articlesPredefinis: "",
  });
  assert.strictEqual(J(env.ctx.chargerCopie()).operations.length, 1);
  // 2e passage : rien à faire, rien d'écrasé
  assert.match(env.ctx.installer_(), /Rien à faire : tout est déjà en place/);
  assert.strictEqual(lignes(env, "Operations").length, 1);

  // --- Onglet présent mais en-tête vide ou incomplet : seules les cases vides sont remplies ---
  const sheets = classeurVide();
  sheets.Operations = new FakeSheet("Operations", [["ID", "Nom de l'offre", "", "", "", "", ""]]);
  sheets.Operations.appendRow(["OP-1", "Ancienne", "Produit", "", "", "Libre", ""]);
  sheets.Articles = new FakeSheet("Articles", []);
  const env2 = makeEnv({ repo, sheets });
  const rapport2 = env2.ctx.installer_();
  assert.match(
    rapport2,
    /Operations » : colonnes ajoutées \(Type, Date_Debut, Date_Fin, Mode_Saisie, Articles_Predefinis\)/
  );
  assert.match(rapport2, /Articles » : colonnes ajoutées \(ID_Article, ID_Reservation, Article, Quantite\)/);
  assert.doesNotMatch(rapport2, /Reservations/, "onglet complet : rien");
  assert.deepStrictEqual(env2.sheets.Operations.getDataRange().getValues()[0], [
    "ID",
    "Nom de l'offre",
    "Type",
    "Date_Debut",
    "Date_Fin",
    "Mode_Saisie",
    "Articles_Predefinis",
  ]);
  assert.deepStrictEqual(
    lignes(env2, "Operations")[0].slice(0, 3),
    ["OP-1", "Ancienne", "Produit"],
    "données intactes"
  );

  // --- 1re ouverture de l'application : onglets créés tout seuls ---
  const env3 = makeEnv({ repo, sheets: {} });
  let modele = null;
  env3.ctx.HtmlService.createTemplateFromFile = () => {
    modele = {
      evaluate: () => ({
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
    };
    return modele;
  };
  env3.ctx.doGet({});
  assert.deepStrictEqual(Object.keys(env3.sheets).sort(), ["Articles", "Operations", "Reservations"]);
  assert.strictEqual(JSON.parse(modele.copieJson).operations.length, 0, "copie vide mais valide");
  assert.strictEqual(env3.verrous, 0);
  // Création impossible (droits, quota…) : la page s'ouvre quand même
  const env4 = makeEnv({ repo, sheets: {} });
  env4.ctx.HtmlService.createTemplateFromFile = env3.ctx.HtmlService.createTemplateFromFile;
  env4.ctx.SpreadsheetApp.getActiveSpreadsheet().insertSheet = () => {
    throw new Error("Accès refusé");
  };
  env4.ctx.doGet({});

  // --- Menu du Google Sheets et compte rendu ---
  env.ctx.onOpen();
  assert.deepStrictEqual(env.menus, [
    ["🚀 APPLICATION", "🧰 Installer / vérifier l'installation", "installerDepuisMenu"],
  ]);
  env.ctx.installerDepuisMenu();
  assert.match(env.alertes[0], /^🧰 Installation \| Rien à faire[\s\S]*Version[\s\S]*Nouveau déploiement/);
  console.log("test_installation : OK");
} catch (e) {
  console.log("test_installation : ÉCHEC " + ((e && e.stack) || e));
  process.exit(1);
}
