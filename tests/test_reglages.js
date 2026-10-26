// Réglages du magasin : valeurs par défaut (Vannes), enregistrement et refus, et copie du
// classeur (modèle vierge → nouveau magasin) qui repart sans les réglages hérités.
const assert = require("assert");
const { makeEnv, lignes } = require("./mocks");
const repo = process.argv[2];
const J = (x) => JSON.parse(JSON.stringify(x));

// doGet sans le vrai HtmlService : renvoie le modèle rempli et le titre de l'onglet
function ouvrirApplication(env) {
  const rendu = {};
  env.ctx.HtmlService.createTemplateFromFile = () => {
    const modele = {
      evaluate: () => ({
        setTitle(t) {
          rendu.titre = t;
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
    rendu.modele = modele;
    return modele;
  };
  env.ctx.doGet({});
  rendu.reglages = JSON.parse(rendu.modele.reglagesJson);
  return rendu;
}

try {
  // --- Valeurs par défaut : l'existant (Carrefour Vannes) ---
  const env = makeEnv({ repo });
  assert.deepStrictEqual(J(env.ctx.reglages_()), {
    NOM_MAGASIN: "l'Hypermarché Carrefour Vannes",
    TITRE_APP: "Application de Réservations",
  });
  let rendu = ouvrirApplication(env);
  assert.strictEqual(rendu.titre, "Application de Réservations");
  assert.strictEqual(env.props.getProperty("ID_CLASSEUR"), "CLASSEUR-TEST", "classeur marqué");

  // --- Enregistrement (sans code) ---
  const r = env.ctx.enregistrerReglages({
    NOM_MAGASIN: "  le   Super U  de Lorient ",
    TITRE_APP: "Réservations Lorient",
    INCONNU: "ignoré",
  });
  assert.deepStrictEqual(J(r), { NOM_MAGASIN: "le Super U de Lorient", TITRE_APP: "Réservations Lorient" });
  assert.strictEqual(env.props.getProperty("CFG_INCONNU"), null, "clé inconnue ignorée");
  assert.strictEqual(env.verrous, 0);
  rendu = ouvrirApplication(env);
  assert.strictEqual(rendu.titre, "Réservations Lorient");
  assert.strictEqual(rendu.reglages.NOM_MAGASIN, "le Super U de Lorient");
  // Une seule clé envoyée : l'autre ne change pas
  env.ctx.enregistrerReglages({ TITRE_APP: "Résas" });
  assert.strictEqual(env.ctx.reglages_().NOM_MAGASIN, "le Super U de Lorient");
  // Refus : vide, trop long
  assert.throws(() => env.ctx.enregistrerReglages({ NOM_MAGASIN: "   " }), /ne peuvent pas être vides/);
  assert.throws(() => env.ctx.enregistrerReglages({ TITRE_APP: "x".repeat(81) }), /80 caractères/);
  assert.strictEqual(env.ctx.reglages_().TITRE_APP, "Résas", "rien d'écrit après un refus");

  // --- Copie du classeur : réglages hérités effacés à la 1re ouverture, données intactes ---
  env.ctx.saveOperation({
    nom: "Offre copiée",
    type: "Evenement",
    modeSaisie: "",
    dateDebut: "",
    dateFin: "",
    articlesPredefinis: "",
  });
  const copie = makeEnv({ repo, sheets: env.sheets, props: env.props._store, idClasseur: "COPIE-1" });
  rendu = ouvrirApplication(copie);
  assert.strictEqual(rendu.titre, "Application de Réservations", "copie : valeurs par défaut");
  assert.strictEqual(rendu.reglages.NOM_MAGASIN, "l'Hypermarché Carrefour Vannes");
  assert.strictEqual(copie.props.getProperty("ID_CLASSEUR"), "COPIE-1", "copie marquée à son tour");
  assert.strictEqual(copie.props.getProperty("SCHEMA"), "2", "installation refaite");
  assert.strictEqual(lignes(copie, "Operations").length, 1, "données jamais effacées");
  // Les réglages de la copie restent ensuite à elle
  copie.ctx.enregistrerReglages({ NOM_MAGASIN: "le Leclerc de Brest" });
  ouvrirApplication(copie);
  assert.strictEqual(copie.ctx.reglages_().NOM_MAGASIN, "le Leclerc de Brest");

  // --- Copie installée par le menu : le compte rendu le dit ---
  const copie2 = makeEnv({ repo, props: { ID_CLASSEUR: "MODELE", CFG_NOM_MAGASIN: "le modèle" } });
  assert.match(copie2.ctx.installer_(), /^Copie d'un autre classeur : réglages hérités effacés/);
  assert.strictEqual(copie2.ctx.reglages_().NOM_MAGASIN, "l'Hypermarché Carrefour Vannes");
  assert.doesNotMatch(copie2.ctx.installer_(), /Copie d'un autre classeur/, "une seule fois");
  // Réglage enregistré sur une copie pas encore ouverte : nettoyée d'abord, réglage gardé
  const copie3 = makeEnv({ repo, props: { ID_CLASSEUR: "MODELE", CFG_TITRE_APP: "Titre du modèle" } });
  copie3.ctx.enregistrerReglages({ NOM_MAGASIN: "le Carrefour Market de Pontivy" });
  assert.deepStrictEqual(J(copie3.ctx.reglages_()), {
    NOM_MAGASIN: "le Carrefour Market de Pontivy",
    TITRE_APP: "Application de Réservations",
  });

  // --- Lecture impossible : la page s'ouvre avec les valeurs par défaut ---
  const env4 = makeEnv({ repo });
  ouvrirApplication(env4);
  env4.ctx.PropertiesService.getDocumentProperties = () => {
    throw new Error("Service indisponible");
  };
  rendu = ouvrirApplication(env4);
  assert.strictEqual(rendu.titre, "Application de Réservations");
  console.log("test_reglages : OK");
} catch (e) {
  console.log("test_reglages : ÉCHEC " + ((e && e.stack) || e));
  process.exit(1);
}
