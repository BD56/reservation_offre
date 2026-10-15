// Page : saisie d'une réservation (menu des offres, liste fixe avec + / −, saisie libre,
// évènement), contrôles, Entrée, offre gardée pour le client suivant, échappement.
const assert = require("assert");
const { ouvrir, attendre } = require("./navigateur");
const { lignes } = require("./mocks");
const { preparer } = require("./donnees");
const repo = process.argv[2];

async function plus(page, article, fois = 1) {
  for (let i = 0; i < fois; i++) await page.click(`.ligne-produit[data-article="${article}"] .plus`);
}

(async () => {
  let browser;
  try {
    const o = await ouvrir(repo, { preparer });
    browser = o.browser;
    const { page, env } = o;
    const message = () => page.textContent("#message");
    const toast = () => page.textContent("#toastTxt");
    const nb = () => lignes(env, "Reservations").length;

    // --- Menu des offres : en cours / terminées, textes affichés tels quels ---
    const groupes = await page.$$eval("#operationSelect optgroup", (gs) =>
      gs.map((g) => [g.label, [...g.querySelectorAll("option")].map((o) => o.textContent)])
    );
    assert.deepStrictEqual(groupes, [
      [
        "En cours et à venir",
        ['Foie <b>gras</b> "Noël" · 01/12 → 24/12', "Chocolats · sans date", "Atelier · le 10/12"],
      ],
      ["Terminées", ["Galettes 2025 · 02/01 → 31/01"]],
    ]);
    assert.match(await page.textContent("#listeProduits"), /Choisissez d'abord l'offre/);
    await page.click("#btnValiderReservation");
    assert.match(await message(), /Choisissez l'offre/);

    // --- Offre à liste fixe : boutons + / − ---
    await page.selectOption("#operationSelect", env.ids.foie);
    assert.match(await page.textContent("#infosOffre"), /2 réservations[\s\S]*Voir la liste/);
    assert.deepStrictEqual(
      await page.$$eval(".ligne-produit", (x) => x.map((e) => e.dataset.article)),
      ["Bloc 200g", "L'entier"],
      "articles de la liste (apostrophe comprise)"
    );
    await page.fill("#nomClient", "Martin");
    await page.fill("#prenomClient", "Léa");
    await page.click("#btnValiderReservation");
    assert.match(await message(), /téléphone ou un email/);
    await page.fill("#telClient", "12");
    await page.click("#btnValiderReservation");
    assert.match(await message(), /Téléphone incomplet/);
    assert.ok(await page.$eval("#telClient", (e) => e.classList.contains("erreur")));
    await page.fill("#telClient", "06 12 34 56 78");
    await page.click("#btnValiderReservation");
    assert.match(await message(), /au moins un article/);
    assert.strictEqual(nb(), 3, "rien d'envoyé");
    await plus(page, "L'entier", 4);
    await page.click(`.ligne-produit[data-article="L'entier"] .moins`);
    assert.strictEqual(await page.textContent(`.ligne-produit[data-article="L'entier"] output`), "3");
    assert.ok(
      await page.$eval(`.ligne-produit[data-article="L'entier"]`, (e) => e.classList.contains("choisi"))
    );
    assert.ok(await page.$eval("#n3", (e) => e.classList.contains("fait")), "étape 3 remplie");
    await page.click("#btnValiderReservation");
    assert.strictEqual(await toast(), "MARTIN Léa : réservation enregistrée", "confirmé tout de suite");
    await attendre(page);
    let r = lignes(env, "Reservations");
    assert.deepStrictEqual(r[3].slice(1, 6), [env.ids.foie, "MARTIN", "Léa", "06 12 34 56 78", "Réservé"]);
    assert.deepStrictEqual(
      lignes(env, "Articles")
        .filter((a) => a[1] === r[3][0])
        .map((a) => [a[2], a[3]]),
      [["L'entier", 3]],
      "seuls les articles choisis"
    );
    // Formulaire vidé, offre gardée pour le client suivant
    assert.strictEqual(await page.inputValue("#nomClient"), "");
    assert.strictEqual(await page.inputValue("#operationSelect"), env.ids.foie);
    assert.deepStrictEqual(await page.$$eval(".ligne-produit output", (x) => x.map((e) => e.textContent)), [
      "0",
      "0",
    ]);
    assert.match(await page.textContent("#infosOffre"), /3 réservations/, "compteur à jour");

    // --- Entrée valide le formulaire ---
    await page.fill("#nomClient", "Bernard");
    await page.fill("#prenomClient", "Ana");
    await page.fill("#emailClient", "ana@exemple.fr");
    await plus(page, "Bloc 200g");
    await page.press("#prenomClient", "Enter");
    await attendre(page);
    assert.strictEqual(nb(), 5);
    assert.strictEqual(lignes(env, "Reservations")[4][4], "ana@exemple.fr");

    // --- Offre en saisie libre ---
    await page.selectOption("#operationSelect", env.ids.choco);
    assert.strictEqual(await page.$$eval(".ligne-produit.libre", (x) => x.length), 1);
    await page.fill("#nomClient", "Petit");
    await page.fill("#prenomClient", "Paul");
    await page.fill("#telClient", "+33 6 11 22 33 44");
    await page.fill(".ligne-produit.libre input", "Ballotin 500g");
    await page.click(".ligne-produit.libre .plus");
    await page.click("#btnAjouterLigne");
    await page.click("#btnAjouterLigne");
    assert.strictEqual(await page.$$eval(".ligne-produit.libre", (x) => x.length), 3);
    await page.click(".ligne-produit.libre >> nth=2 >> .retirer");
    await page.fill(".ligne-produit.libre >> nth=1 >> input", "Truffes");
    await page.click("#btnAjouterLigne"); // ligne laissée vide : ignorée
    await page.click("#btnValiderReservation");
    await attendre(page);
    r = lignes(env, "Reservations");
    assert.strictEqual(r[5][4], "+33 6 11 22 33 44");
    assert.deepStrictEqual(
      lignes(env, "Articles")
        .filter((a) => a[1] === r[5][0])
        .map((a) => [a[2], a[3]]),
      [
        ["Ballotin 500g", 2],
        ["Truffes", 1],
      ]
    );
    // Saisie libre sans article tapé : refusé
    await page.fill("#nomClient", "Vide");
    await page.fill("#prenomClient", "V");
    await page.fill("#telClient", "0600000000");
    await page.click("#btnValiderReservation");
    assert.match(await message(), /Tapez au moins un article/);

    // --- Évènement : pas d'articles ---
    await page.selectOption("#operationSelect", env.ids.atelier);
    assert.strictEqual(await page.textContent("#titreEtape3"), "Inscription");
    await page.fill("#nomClient", "Durand");
    await page.fill("#prenomClient", "Zoé");
    await page.fill("#telClient", "0612121212");
    await page.click("#btnValiderReservation");
    await attendre(page);
    assert.strictEqual(nb(), 7);
    assert.match(await toast(), /DURAND Zoé : réservation enregistrée/);

    // --- « Voir la liste » ouvre les réservations de l'offre ---
    await page.click("#voirListe");
    await attendre(page, 200);
    assert.ok(await page.isVisible("#ecranDetail"));
    assert.strictEqual(await page.textContent("#titreDetail"), "Atelier");

    assert.strictEqual(await page.evaluate(() => window.__xss || 0), 0, "aucun code injecté");
    assert.deepStrictEqual(o.erreursPage, [], "aucune erreur dans la page");
    console.log("test_ui_saisie : OK");
  } catch (e) {
    console.log("test_ui_saisie : ÉCHEC " + ((e && e.stack) || e));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
