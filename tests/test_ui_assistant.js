// Fenêtres du Google Sheets dans Chromium (rendues comme par Apps Script, google.script.run
// branché sur le vrai code serveur) : assistant d'installation écran par écran, autorisation
// manquante, adresse trouvée seule, fin ; fenêtre « Gestion de l'application ».
const assert = require("assert");
const { chromium } = require("playwright");
const { makeEnv } = require("./mocks");
const { FakeSheet } = require("./fakesheet");
const repo = process.argv[2];
const captures = process.argv[3]; // dossier des captures (facultatif)
const J = (x) => (x === undefined ? null : JSON.parse(JSON.stringify(x)));
const ADRESSE = "https://script.google.com/a/macros/carrefour.com/s/AKfycbTEST_magasin-X/exec";
const SANS_MAIL = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/script.container.ui",
];

const RUNNER = `<script>
  (function () {
    function runner(ok, ko) {
      return new Proxy({}, { get: function (_, nom) {
        if (nom === 'withSuccessHandler') return function (h) { return runner(h, ko); };
        if (nom === 'withFailureHandler') return function (h) { return runner(ok, h); };
        return function () {
          window.__serveur(nom, JSON.stringify([].slice.call(arguments))).then(function (r) {
            var o = JSON.parse(r);
            if (o.err) { if (ko) ko(new Error(o.err)); } else if (ok) ok(o.val);
          });
        };
      }});
    }
    window.google = { script: { run: runner(null, null), host: { close: function () { window.__ferme = true; } } } };
  })();</script>`;

function copie() {
  const env = makeEnv({
    repo,
    idClasseur: "COPIE",
    activeEmail: "accueil.magasin@carrefour.com",
    owner: "accueil.magasin@carrefour.com",
    props: { ID_CLASSEUR: "MODELE" },
    sheets: { Démarrer: new FakeSheet("Démarrer"), "Feuille 1": new FakeSheet("Feuille 1") },
  });
  env.nomClasseur = "Copie de MODÈLE — Réservations des offres (ne pas utiliser)";
  return env;
}
// Ouvre la fenêtre telle que la fonction serveur la montre ; avant(env) : juste avant le chargement
async function fenetre(browser, env, fonction, erreurs, avant) {
  env.ctx[fonction]();
  const contenu = env.dialogues[env.dialogues.length - 1].contenu;
  const page = await browser.newPage({ viewport: { width: 660, height: 680 } });
  page.on("pageerror", (e) => erreurs.push(e.message));
  await page.exposeFunction("__serveur", (nom, args) => {
    try {
      if (typeof env.ctx[nom] !== "function" || /_$/.test(nom)) throw new Error("fonction inconnue : " + nom);
      return JSON.stringify({ val: J(env.ctx[nom].apply(null, JSON.parse(args))) });
    } catch (e) {
      return JSON.stringify({ err: e.message });
    }
  });
  if (avant) avant(env);
  await page.setContent(contenu.replace("<head>", "<head>" + RUNNER), { waitUntil: "load" });
  await page.waitForTimeout(300);
  return page;
}
const visible = (page, sel) => page.isVisible(sel);
const texte = (page, sel) => page.textContent(sel);

(async () => {
  const browser = await chromium.launch();
  const erreurs = [];
  try {
    // ================= Assistant, de bout en bout =================
    const env = copie();
    const page = await fenetre(browser, env, "ouvrirAssistant", erreurs);
    // 1. Préparation
    assert.ok(await visible(page, "#prepResultat"));
    assert.match(await texte(page, "#prepCompte"), /accueil\.magasin@carrefour\.com/);
    assert.match(await texte(page, "#prepRapport"), /Copie d'un autre classeur/);
    assert.ok(env.sheets.Operations && env.sheets.Arrivages, "onglets créés");
    assert.match(await texte(page, ".etapes li.encours"), /Préparation/);
    if (captures) await page.screenshot({ path: captures + "/assistant-1.png", fullPage: true });
    await page.click("#btnSuite0");
    // 2. Votre magasin
    await page.waitForTimeout(200);
    assert.strictEqual(await page.inputValue("#nomMagasin"), "", "jamais réglé : vide");
    assert.strictEqual(await page.inputValue("#titreOnglet"), "Application de Réservations");
    await page.click("#btnMagasin");
    assert.match(await texte(page, "#msgMagasin"), /Écrivez le nom du magasin/);
    await page.fill("#nomMagasin", "l'Hypermarché Carrefour Lorient");
    assert.match(await texte(page, "#apercuMentions"), /concède à l'Hypermarché Carrefour Lorient/);
    await page.press("#nomMagasin", "Enter");
    await page.waitForTimeout(300);
    assert.strictEqual(env.nomClasseur, "Réservations des offres — l'Hypermarché Carrefour Lorient");
    assert.strictEqual(env.props.getProperty("CFG_NOM_MAGASIN"), "l'Hypermarché Carrefour Lorient");
    // 3. Mise en ligne : guide, lien vers l'éditeur, « Continuer » bloqué sans adresse
    assert.ok(await visible(page, "#enLigneGuide"));
    assert.match(await texte(page, "#enLigneGuide"), /Tous les utilisateurs du domaine\s+Carrefour/);
    assert.strictEqual(
      await page.getAttribute("#lienDeploiement", "href"),
      "https://script.google.com/d/ID-DU-SCRIPT/edit"
    );
    assert.ok(await page.isDisabled("#btnSuite2"));
    if (captures) await page.screenshot({ path: captures + "/assistant-3.png", fullPage: true });
    await page.click("#btnAdresse");
    assert.match(await texte(page, "#msgAdresse"), /Collez l'adresse/);
    await page.fill("#adresseCollee", "https://script.google.com/macros/s/AKfy/dev");
    await page.click("#btnAdresse");
    await page.waitForTimeout(200);
    assert.match(await texte(page, "#msgAdresse"), /Ce n'est pas l'adresse de l'application/);
    // Le déploiement a retiré l'adresse e-mail : encadré « Autoriser de nouveau »
    env.scopes = SANS_MAIL;
    env.activeEmail = "";
    await page.fill("#adresseCollee", ADRESSE);
    await page.press("#adresseCollee", "Enter");
    await page.waitForTimeout(300);
    assert.ok(await visible(page, "#autoEnLigne"), "autorisation à redonner");
    assert.strictEqual(
      await page.getAttribute("#autoEnLigne a", "href"),
      "https://accounts.google.com/autoriser"
    );
    assert.ok(!(await visible(page, "#enLigneGuide")));
    assert.ok(await page.isDisabled("#btnSuite2"));
    env.scopes = null;
    env.activeEmail = "accueil.magasin@carrefour.com";
    await page.click("#autoEnLigne [data-verifier]");
    await page.waitForTimeout(400);
    assert.ok(!(await visible(page, "#autoEnLigne")));
    // L'adresse avait été refusée (propriétaire pas reconnu) : rien d'enregistré, on la recolle
    assert.ok(await visible(page, "#enLigneGuide"));
    assert.strictEqual(env.props.getProperty("ADRESSE_APP"), null);
    await page.fill("#adresseCollee", ADRESSE);
    await page.click("#btnAdresse");
    await page.waitForTimeout(300);
    assert.ok(await visible(page, "#enLigneOk"));
    assert.strictEqual(await texte(page, "#enLigneAdresse"), ADRESSE);
    assert.ok(await page.isEnabled("#btnSuite2"));
    // Changer l'adresse puis la retrouver seule : un PC a ouvert l'application (doGet)
    await page.click("#btnChangerAdresse");
    assert.ok(await visible(page, "#enLigneGuide"));
    await page.click("[data-ecran='2'] [data-retour]");
    await page.waitForTimeout(300);
    env.props.deleteProperty("ADRESSE_APP");
    await page.click("#btnMagasin");
    await page.waitForTimeout(300);
    assert.ok(await visible(page, "#enLigneGuide"));
    env.urlService = ADRESSE;
    env.ctx.doGet({});
    await page.waitForTimeout(4600);
    assert.ok(await visible(page, "#enLigneOk"), "adresse trouvée seule");
    await page.click("#btnSuite2");
    // 4. Le PC de l'accueil
    await page.waitForTimeout(300);
    assert.strictEqual(await texte(page, "#pcLien"), ADRESSE);
    assert.strictEqual(await page.getAttribute("#pcOuvrir", "href"), ADRESSE);
    assert.strictEqual(await page.getAttribute("#pcOuvrir", "target"), "_blank");
    assert.match(await texte(page, "#pcZone"), /compte Google\s+Carrefour/);
    if (captures) await page.screenshot({ path: captures + "/assistant-4.png", fullPage: true });
    assert.strictEqual(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      false,
      "pas de défilement horizontal (adresse longue)"
    );
    await page.click("#btnSuite3");
    await page.waitForTimeout(300);
    // Fin
    assert.ok(await visible(page, "[data-ecran='4']"));
    assert.ok(!env.sheets["Démarrer"] && !env.sheets["Feuille 1"], "onglets d'installation retirés");
    assert.match(
      await texte(page, "#finNomSheet"),
      /s'appelle maintenant « Réservations des offres — l'Hypermarché Carrefour Lorient »/
    );
    await page.click("#btnFin");
    assert.strictEqual(await page.evaluate(() => window.__ferme), true);
    await page.close();

    // ================= Une case oubliée au premier clic =================
    const env2 = copie();
    const page2 = await fenetre(browser, env2, "ouvrirAssistant", erreurs, (e) => {
      e.scopes = SANS_MAIL;
      e.activeEmail = "";
    });
    assert.ok(await visible(page2, "#autoPrep"));
    assert.ok(await page2.isDisabled("#btnSuite0"));
    env2.scopes = null;
    env2.activeEmail = "accueil.magasin@carrefour.com";
    await page2.click("#autoPrep [data-verifier]");
    await page2.waitForTimeout(300);
    assert.ok(await visible(page2, "#prepResultat"));
    assert.ok(await page2.isEnabled("#btnSuite0"));
    await page2.close();

    // ================= Fenêtre « Gestion de l'application » =================
    const page3 = await fenetre(browser, env, "ouvrirGestion", erreurs);
    assert.ok(await visible(page3, "#gesEnLigne"));
    assert.strictEqual(await texte(page3, "#gesLien"), ADRESSE);
    assert.strictEqual(await texte(page3, "#gesMagasin"), "l'Hypermarché Carrefour Lorient");
    await page3.click('[data-rubrique-lien="installation"]');
    await page3.click("#gesVerifier");
    await page3.waitForTimeout(200);
    assert.match(await texte(page3, "#gesRapport"), /Rien à faire[\s\S]*Version/);
    if (captures) await page3.screenshot({ path: captures + "/gestion.png" });
    const avant = env.dialogues.length;
    await page3.click("#gesAssistant");
    await page3.waitForTimeout(200);
    assert.strictEqual(env.dialogues.length, avant + 1, "l'assistant s'ouvre");
    await page3.close();
    // Pas encore en ligne
    const env4 = copie();
    env4.ctx.preparerInstallation();
    const page4 = await fenetre(browser, env4, "ouvrirGestion", erreurs);
    assert.ok(await visible(page4, "#gesPasEnLigne"));
    await page4.close();

    assert.deepStrictEqual(erreurs, [], "aucune erreur dans les fenêtres");
    console.log("test_ui_assistant : OK");
  } catch (e) {
    console.log("test_ui_assistant : ÉCHEC " + ((e && e.stack) || e));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
