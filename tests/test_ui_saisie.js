// Page : saisie d'une réservation (offre prédéfinie, libre, évènement), contrôles du
// formulaire, échec du serveur, échappement des textes.
const assert = require("assert");
const { ouvrir, attendre } = require("./navigateur");
const { lignes } = require("./mocks");
const { preparer } = require("./donnees");
const repo = process.argv[2];
(async () => {
  let browser;
  try {
    const o = await ouvrir(repo, { preparer });
    browser = o.browser;
    const { page, env } = o;
    const toast = () => page.textContent("#toastMessage");

    // Offres chargées dans la liste, textes affichés tels quels (pas interprétés en HTML)
    const options = await page.$$eval("#operationSelect option", (x) => x.map((e) => e.textContent));
    assert.deepStrictEqual(options, [
      "Sélectionnez l'offre en cours...",
      '[Produit] Foie <b>gras</b> "Noël"',
      "[Produit] Chocolats",
      "[Evenement] Atelier",
      "[Produit] Galettes 2025",
    ]);

    // --- Offre prédéfinie ---
    await page.selectOption("#operationSelect", env.ids.foie);
    assert.deepStrictEqual(
      await page.$$eval(".nom-article", (x) => x.map((e) => e.value)),
      ["Bloc 200g", "L'entier"],
      "articles prédéfinis (apostrophe comprise)"
    );
    assert.ok(!(await page.isVisible("#btnAjouterLigne")), "pas d'ajout de ligne en prédéfini");
    await page.fill("#nomClient", "Martin");
    await page.fill("#prenomClient", "Léa");
    // Ni téléphone ni email
    await page.click("#btnValiderReservation");
    assert.ok(await page.isVisible("#alerteContact"), "téléphone ou email demandé");
    // Téléphone invalide
    await page.fill("#telClient", "12");
    assert.ok(await page.$eval("#telClient", (e) => e.classList.contains("is-invalid")));
    await page.fill("#telClient", "06 12 34 56 78");
    assert.ok(await page.$eval("#telClient", (e) => e.classList.contains("is-valid")));
    // Aucune quantité : refusé
    await page.click("#btnValiderReservation");
    await attendre(page, 150);
    assert.match(await toast(), /au moins un article/);
    assert.strictEqual(lignes(env, "Reservations").length, 3, "rien d'envoyé");
    // Quantité saisie : enregistré
    await page.fill(".quantite-article >> nth=1", "3");
    await page.click("#btnValiderReservation");
    await attendre(page);
    assert.match(await toast(), /Réservation enregistrée/);
    let r = lignes(env, "Reservations");
    assert.strictEqual(r.length, 4);
    assert.deepStrictEqual(r[3].slice(2, 6), ["Martin", "Léa", "06 12 34 56 78", "Réservé"]);
    assert.deepStrictEqual(
      lignes(env, "Articles")
        .slice(-1)
        .map((a) => [a[1], a[2], a[3]]),
      [[r[3][0], "L'entier", 3]],
      "seule la ligne avec une quantité est enregistrée"
    );
    // Formulaire vidé, offre à resélectionner, compteur à jour
    assert.strictEqual(await page.inputValue("#nomClient"), "");
    assert.ok(!(await page.isVisible("#sectionProduits")));
    assert.strictEqual(await page.isEnabled("#btnValiderReservation"), true);
    assert.strictEqual(
      await page.textContent("#tableOperationsBody tr:first-child .badge"),
      "3",
      "compteur de l'offre mis à jour"
    );

    // --- Offre libre ---
    await page.selectOption("#operationSelect", env.ids.choco);
    assert.strictEqual(await page.$$eval(".ligne-produit", (x) => x.length), 1, "une ligne vide");
    await page.fill("#nomClient", "Petit");
    await page.fill("#prenomClient", "Paul");
    await page.fill("#emailClient", "paul@exemple.fr");
    await page.fill(".nom-article", "Ballotin 500g");
    await page.click("#btnValiderReservation");
    await attendre(page, 150);
    assert.match(await toast(), /Article incomplet[\s\S]*Ballotin 500g/, "quantité oubliée signalée");
    await page.fill(".quantite-article", "2");
    await page.click("#btnAjouterLigne");
    await page.click("#btnAjouterLigne");
    assert.strictEqual(await page.$$eval(".ligne-produit", (x) => x.length), 3);
    await page.click(".ligne-produit >> nth=2 >> button");
    await page.fill(".nom-article >> nth=1", "Truffes");
    await page.fill(".quantite-article >> nth=1", "1");
    // Échec du serveur : fenêtre « NON enregistrée » avec le détail, puis RÉESSAYER
    env.pannes.saveReservation = "Service <indisponible>";
    await page.click("#btnValiderReservation");
    await attendre(page, 700);
    assert.ok(await page.isVisible("#modalEchecEnvoi"), "fenêtre d'échec");
    const texteEchec = await page.textContent("#texteEchecEnvoi");
    assert.match(texteEchec, /Service <indisponible>/, "message du serveur affiché en texte");
    assert.match(texteEchec, /Petit Paul[\s\S]*Chocolats[\s\S]*2x Ballotin 500g, 1x Truffes/);
    delete env.pannes.saveReservation;
    await page.click("#btnReessayerEnvoi");
    await attendre(page, 700);
    assert.ok(!(await page.isVisible("#modalEchecEnvoi")));
    r = lignes(env, "Reservations");
    assert.strictEqual(r[4][4], "paul@exemple.fr");
    assert.deepStrictEqual(
      lignes(env, "Articles")
        .slice(-2)
        .map((a) => [a[2], a[3]]),
      [
        ["Ballotin 500g", 2],
        ["Truffes", 1],
      ]
    );

    // --- Évènement : pas d'articles ---
    await page.selectOption("#operationSelect", env.ids.atelier);
    assert.ok(!(await page.isVisible("#sectionProduits")));
    await page.fill("#nomClient", "Durand");
    await page.fill("#prenomClient", "Zoé");
    await page.fill("#telClient", "+33 6 12 34 56 78");
    await page.click("#btnValiderReservation");
    await attendre(page);
    assert.match(await toast(), /Réservation enregistrée/);
    assert.strictEqual(lignes(env, "Reservations").length, 6);

    // --- Offre supprimée par un autre poste entre-temps ---
    env.ctx.deleteOperation(env.ids.choco);
    const nbAvant = lignes(env, "Reservations").length;
    await page.selectOption("#operationSelect", env.ids.choco);
    await page.fill("#nomClient", "Tard");
    await page.fill("#prenomClient", "Ive");
    await page.fill("#telClient", "0600000000");
    await page.fill(".nom-article", "Ballotin");
    await page.fill(".quantite-article", "1");
    await page.click("#btnValiderReservation");
    await attendre(page, 700);
    assert.match(await page.textContent("#texteEchecEnvoi"), /n'existe plus/);
    await page.click("#btnAbandonnerEnvoi");
    await attendre(page, 700);
    assert.ok(!(await page.isVisible("#modalEchecEnvoi")));
    assert.strictEqual(lignes(env, "Reservations").length, nbAvant, "rien d'écrit");

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
