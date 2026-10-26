// Assistant d'installation (côté serveur) : modèle préparé (onglet « Démarrer » et bouton),
// copie du modèle installée écran par écran, autorisations vérifiées, accès réservé aux
// personnes qui ont le Google Sheets, adresse de l'application, fin de l'assistant.
const assert = require("assert");
const { makeEnv, lignes } = require("./mocks");
const { FakeSheet } = require("./fakesheet");
const repo = process.argv[2];
const J = (x) => JSON.parse(JSON.stringify(x));
const ADRESSE = "https://script.google.com/a/macros/carrefour.com/s/AKfycbTEST_magasin-X/exec";

try {
  // --- Le modèle (Bryan) : preparerModele ---
  const modele = makeEnv({ repo, sheets: { "Feuille 1": new FakeSheet("Feuille 1") }, idClasseur: "MODELE" });
  modele.nomClasseur = "MODÈLE — Réservations des offres (ne pas utiliser)";
  assert.match(modele.ctx.preparerModele(), /^Modèle prêt \(version [\d.-]+\)/);
  assert.deepStrictEqual(Object.keys(modele.sheets), [
    "Démarrer",
    "Operations",
    "Reservations",
    "Articles",
    "Arrivages",
  ]);
  const images = modele.sheets["Démarrer"].getImages();
  assert.strictEqual(images.length, 1, "bouton vert posé");
  assert.strictEqual(images[0].script, "ouvrirAssistant");
  assert.strictEqual(images[0].blob.type, "image/png");
  assert.strictEqual(
    modele.props.getProperty("ID_CLASSEUR"),
    "MODELE",
    "modèle marqué : ses copies se reconnaissent"
  );
  assert.strictEqual(modele.props.getProperty("SCHEMA"), "2");
  assert.strictEqual(modele.props.getProperty("CFG_NOM_MAGASIN"), null, "modèle vierge");
  // Pas sur le modèle de quelqu'un d'autre
  const intrus = makeEnv({ repo, activeEmail: "intrus@example.com" });
  assert.throws(() => intrus.ctx.preparerModele(), /Réservé aux personnes ayant accès au Google Sheets/);

  // --- Une copie du modèle (le magasin) ---
  const env = makeEnv({
    repo,
    sheets: modele.sheets, // la copie emporte les onglets du modèle
    props: modele.props._store, // et peut-être ses propriétés (gérées dans les deux cas)
    idClasseur: "COPIE",
    activeEmail: "accueil.magasin@carrefour.com",
    owner: "accueil.magasin@carrefour.com",
  });
  env.nomClasseur = "Copie de MODÈLE — Réservations des offres (ne pas utiliser)";
  env.ctx.onOpen();
  assert.match(env.toasts[0], /onglet « Démarrer », bouton vert/, "copie pas encore installée : rappel");

  // Bouton vert : la fenêtre de l'assistant s'ouvre (comme Apps Script la montre)
  env.ctx.ouvrirAssistant();
  const fenetre = env.dialogues[0];
  assert.strictEqual(fenetre.titre, "▶ Installation de l'application");
  assert.deepStrictEqual([fenetre.largeur, fenetre.hauteur], [660, 720]);
  assert.match(fenetre.contenu, /Tous les utilisateurs du domaine\s+Carrefour/);
  assert.ok(!/<\?/.test(fenetre.contenu), "aucune balise de modèle restante");

  // 1. Préparation
  const prep = J(env.ctx.preparerInstallation());
  assert.strictEqual(prep.incomplet, false);
  assert.strictEqual(prep.compte, "accueil.magasin@carrefour.com");
  assert.match(prep.rapport, /^Copie d'un autre classeur : réglages hérités effacés/);
  assert.strictEqual(env.props.getProperty("ID_CLASSEUR"), "COPIE");
  assert.strictEqual(env.ctx.estCopieNonInstallee_(), false);

  // 2. Votre magasin : nom vide tant qu'il n'a jamais été réglé, titre prérempli
  assert.deepStrictEqual(J(env.ctx.lireReglagesAssistant()), {
    NOM_MAGASIN: "",
    TITRE_APP: "Application de Réservations",
  });
  assert.throws(
    () => env.ctx.enregistrerReglagesAssistant({ NOM_MAGASIN: " " }),
    /Écrivez le nom du magasin/
  );
  const mag = J(
    env.ctx.enregistrerReglagesAssistant({
      NOM_MAGASIN: "l'Hypermarché Carrefour Lorient",
      TITRE_APP: "Réservations",
    })
  );
  assert.strictEqual(mag.nomSheet, "Réservations des offres — l'Hypermarché Carrefour Lorient");
  assert.strictEqual(env.nomClasseur, mag.nomSheet, "copie renommée d'après le magasin");
  assert.strictEqual(mag.reglages.TITRE_APP, "Réservations");
  assert.strictEqual(env.ctx.lireReglagesAssistant().NOM_MAGASIN, "l'Hypermarché Carrefour Lorient");
  // Un nom choisi n'est jamais remplacé
  env.nomClasseur = "Résas Lorient";
  assert.strictEqual(env.ctx.enregistrerReglagesAssistant({ NOM_MAGASIN: "le magasin" }).nomSheet, "");
  assert.strictEqual(env.nomClasseur, "Résas Lorient");

  // 3. Mise en ligne
  const enLigne = J(env.ctx.etatMiseEnLigne());
  assert.deepStrictEqual(enLigne, {
    adresse: "",
    lienEditeur: "https://script.google.com/d/ID-DU-SCRIPT/edit",
  });
  assert.throws(
    () => env.ctx.enregistrerAdresseApplication("https://script.google.com/macros/s/AKfy/dev"),
    /Ce n'est pas l'adresse de l'application/
  );
  assert.strictEqual(env.ctx.enregistrerAdresseApplication("  " + ADRESSE + " "), ADRESSE);
  assert.strictEqual(env.ctx.etatMiseEnLigne().adresse, ADRESSE);
  // Un PC qui ouvre l'application note son adresse (doGet)
  const env2 = makeEnv({ repo, urlService: "https://script.google.com/macros/s/AUTRE/exec" });
  env2.ctx.doGet({});
  assert.strictEqual(env2.props.getProperty("ADRESSE_APP"), "https://script.google.com/macros/s/AUTRE/exec");
  const env3 = makeEnv({ repo, urlService: "https://script.google.com/macros/s/AUTRE/dev" });
  env3.ctx.doGet({});
  assert.strictEqual(env3.props.getProperty("ADRESSE_APP"), null, "jamais l'adresse /dev");

  // 4. Le PC de l'accueil
  assert.deepStrictEqual(J(env.ctx.etatApplication()), { adresse: ADRESSE, magasin: "le magasin" });

  // Fin : « Démarrer » retiré, onglet Operations affiché
  env.sheets["Feuille 1"] = new FakeSheet("Feuille 1");
  assert.strictEqual(env.ctx.terminerAssistant(), true);
  assert.ok(!env.sheets["Démarrer"] && !env.sheets["Feuille 1"]);
  assert.strictEqual(env.feuilleActive, "Operations");
  assert.strictEqual(lignes(env, "Operations").length, 0, "données intactes");

  // --- Fenêtre « Gestion de l'application » ---
  env.ctx.ouvrirGestion();
  const gestion = env.dialogues[env.dialogues.length - 1];
  assert.strictEqual(gestion.titre, "⚙️ Gestion de l'application");
  assert.match(gestion.contenu, /comptes Google\s+Carrefour/);
  assert.match(env.ctx.installerDepuisGestion(), /Rien à faire/);

  // --- Autorisations : une case oubliée ---
  const sansMail = makeEnv({
    repo,
    activeEmail: "", // sans l'adresse e-mail, le propriétaire n'est plus reconnu
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/script.container.ui",
    ],
  });
  assert.deepStrictEqual(J(sansMail.ctx.etatAutorisations()), {
    manquantes: 1,
    lien: "https://accounts.google.com/autoriser",
  });
  assert.throws(() => sansMail.ctx.ouvrirAssistant(), /Autorisation Google incomplète/);
  assert.strictEqual(sansMail.redemandees, 1, "Google redemande la case");
  assert.throws(() => sansMail.ctx.preparerInstallation(), /Autorisation Google incomplète/);
  assert.deepStrictEqual(J(env.ctx.etatAutorisations()), { manquantes: 0, lien: "" });
  // Un visiteur de l'application (pas dans le Google Sheets) : refusé partout
  const visiteur = makeEnv({ repo, activeEmail: "hotesse@carrefour.com" });
  for (const f of [
    "preparerInstallation",
    "lireReglagesAssistant",
    "etatMiseEnLigne",
    "etatApplication",
    "terminerAssistant",
    "installerDepuisGestion",
    "ouvrirGestion",
  ])
    assert.throws(() => visiteur.ctx[f](), /Réservé aux personnes ayant accès au Google Sheets/, f);
  assert.throws(() => visiteur.ctx.enregistrerAdresseApplication(ADRESSE), /Réservé/);
  // Un éditeur du Google Sheets : accepté
  const editeur = makeEnv({
    repo,
    activeEmail: "direction@carrefour.com",
    editors: ["direction@carrefour.com"],
  });
  assert.strictEqual(editeur.ctx.etatApplication().adresse, "");
  console.log("test_assistant : OK");
} catch (e) {
  console.log("test_assistant : ÉCHEC " + ((e && e.stack) || e));
  process.exit(1);
}
