// Page : gestion des offres (liste, détail, état des réservations, modification,
// création, suppression) et impression du résumé.
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
    const badges = () => page.$$eval("#tableOperationsBody .badge", (x) => x.map((e) => e.textContent));

    // --- Liste des offres ---
    await page.click("text=Gérer les Opérations");
    await attendre(page);
    assert.deepStrictEqual(
      await page.$$eval("#tableOperationsBody tr td:first-child .fw-bold", (x) =>
        x.map((e) => e.textContent)
      ),
      ['Foie <b>gras</b> "Noël"', "Chocolats", "Atelier"]
    );
    assert.deepStrictEqual(await badges(), ["2", "0", "0"]);

    // --- Détail ---
    await page.click("#tableOperationsBody tr:first-child td:first-child");
    await attendre(page, 700);
    assert.ok(await page.isVisible("#modalDetailOffre"));
    assert.strictEqual(await page.$$eval(".modal-backdrop", (x) => x.length), 1, "un seul fond gris");
    assert.match(await page.textContent("#detailModalTitle"), /Foie <b>gras<\/b> "Noël"/);
    const cellules = await page.$$eval("#tableInscritsBody tr", (trs) =>
      trs.map((tr) => [...tr.querySelectorAll("td")].slice(0, 3).map((td) => td.innerText.trim()))
    );
    assert.match(
      cellules[0][0],
      /^O'Brien<img src=x onerror=window.__xss=1> Jo\nSaisi le \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/
    );
    assert.deepStrictEqual(cellules[0].slice(1), ["0612345678", "2x Bloc 200g"]);
    assert.deepStrictEqual(cellules[1].slice(1), ["al@exemple.fr", "5x Bloc 200g, 1x L'entier"]);
    assert.strictEqual(await page.inputValue("#editOpDateDebut"), "2026-12-01");
    assert.strictEqual(await page.inputValue("#editOpArticles"), "Bloc 200g, L'entier");

    // --- Impression : totaux de toutes les réservations actives ---
    await page.click("text=IMPRIMER LE RÉSUMÉ");
    let imprime = await page.evaluate(() => window.__imprime);
    assert.match(imprime, /Du 01\/12\/2026 au 24\/12\/2026/);
    assert.match(imprime, /<td>Bloc 200g<\/td><td[^>]*>7<\/td>/);
    assert.match(imprime, /<td>L'entier<\/td><td[^>]*>1<\/td>/);
    assert.ok(!imprime.includes("<img"), "noms échappés à l'impression");
    assert.strictEqual(
      await page.$eval("#zoneImpression", (z) => z.classList.contains("d-none")),
      true,
      "zone d'impression vidée après l'impression"
    );

    // --- État d'une réservation ---
    await page.selectOption("#tableInscritsBody tr:nth-child(2) select", "Annulé");
    await attendre(page);
    assert.match(await toast(), /Statut mis à jour/);
    assert.strictEqual(lignes(env, "Reservations")[1][5], "Annulé");
    // L'impression suit le changement sans recharger : la réservation annulée sort des totaux
    await page.click("text=IMPRIMER LE RÉSUMÉ");
    imprime = await page.evaluate(() => window.__imprime);
    assert.match(imprime, /<td>Bloc 200g<\/td><td[^>]*>2<\/td>/);
    assert.ok(!/<td>L'entier<\/td>/.test(imprime), "article de la réservation annulée retiré");
    assert.match(imprime, /Liste des Commandes \(2\)/, "la commande annulée reste listée");
    // Échec : l'ancien état revient à l'écran
    env.pannes.updateReservationStatus = "Réseau coupé";
    await page.selectOption("#tableInscritsBody tr:nth-child(1) select", "Retrait");
    await attendre(page);
    assert.match(await toast(), /Réseau coupé/);
    assert.strictEqual(await page.inputValue("#tableInscritsBody tr:nth-child(1) select"), "Réservé");
    assert.strictEqual(lignes(env, "Reservations")[0][5], "Réservé");
    delete env.pannes.updateReservationStatus;

    // --- Modification de l'offre ---
    await page.click("#parametres-tab");
    await page.fill("#editOpNom", "Foie gras 2026");
    await page.fill("#editOpDateFin", "2026-11-01");
    await page.click("#btnUpdateOffre");
    await attendre(page, 150);
    assert.match(await toast(), /date de fin/, "dates incohérentes refusées");
    await page.fill("#editOpDateFin", "2026-12-31");
    await page.fill("#editOpArticles", " , ");
    await page.click("#btnUpdateOffre");
    await attendre(page, 150);
    assert.match(await toast(), /au moins un article/);
    await page.fill("#editOpArticles", "Bloc 200g, L'entier, Médaillon");
    await page.click("#btnUpdateOffre");
    await attendre(page);
    assert.match(await toast(), /Offre mise à jour/);
    assert.strictEqual(await page.textContent("#detailModalTitle"), " Foie gras 2026");
    let op = lignes(env, "Operations")[0];
    assert.strictEqual(op[1], "Foie gras 2026");
    assert.strictEqual(op[6], "Bloc 200g, L'entier, Médaillon");
    // Le formulaire de saisie connaît le nouvel article
    await page.click("#modalDetailOffre .btn-close");
    await attendre(page);
    await page.selectOption("#operationSelect", env.ids.foie);
    assert.deepStrictEqual(await page.$$eval(".nom-article", (x) => x.map((e) => e.value)), [
      "Bloc 200g",
      "L'entier",
      "Médaillon",
    ]);

    // --- Création ---
    await page.click("text=Gérer les Opérations");
    await attendre(page);
    await page.click("text=CRÉER UNE NOUVELLE OFFRE");
    await attendre(page);
    await page.click("#btnSauvegarderOffre");
    assert.strictEqual(lignes(env, "Operations").length, 3, "nom obligatoire");
    await page.fill("#newOpNom", "Galettes");
    await page.selectOption("#newOpMode", "Predefini");
    await page.click("#btnSauvegarderOffre");
    await attendre(page, 150);
    assert.match(await toast(), /au moins un article/);
    await page.fill("#newOpArticles", "Frangipane, Pomme");
    env.pannes.saveOperation = "Quota dépassé";
    await page.click("#btnSauvegarderOffre");
    await attendre(page);
    assert.match(await toast(), /Quota dépassé/);
    assert.strictEqual(await page.isEnabled("#btnSauvegarderOffre"), true, "bouton rendu après un échec");
    delete env.pannes.saveOperation;
    await page.click("#btnSauvegarderOffre");
    await attendre(page, 800);
    assert.match(await toast(), /Nouvelle offre créée/);
    op = lignes(env, "Operations")[3];
    assert.deepStrictEqual(op.slice(1, 3).concat(op.slice(5)), [
      "Galettes",
      "Produit",
      "Predefini",
      "Frangipane, Pomme",
    ]);
    assert.ok(await page.isVisible("#modalOperations"), "retour à la liste des offres");
    assert.deepStrictEqual(await badges(), ["1", "0", "0", "0"], "réservation annulée non comptée");

    // --- Suppression ---
    await page.click("#tableOperationsBody tr:first-child button");
    await attendre(page);
    assert.ok(await page.isVisible("#modalConfirmDelete"));
    await page.click("#btnConfirmerSuppression");
    await attendre(page);
    assert.match(await toast(), /Opération supprimée/);
    assert.strictEqual(lignes(env, "Operations").length, 3);
    assert.deepStrictEqual(lignes(env, "Reservations"), [], "réservations supprimées avec l'offre");
    assert.deepStrictEqual(lignes(env, "Articles"), [], "articles supprimés avec l'offre");
    // Échec de la suppression : message affiché
    assert.ok(await page.isVisible("#modalOperations"), "la liste des offres reste ouverte");
    assert.deepStrictEqual(await badges(), ["0", "0", "0"]);
    env.pannes.deleteOperation = "Feuille protégée";
    await page.click("#tableOperationsBody tr:first-child button");
    await attendre(page);
    await page.click("#btnConfirmerSuppression");
    await attendre(page);
    assert.match(await toast(), /Feuille protégée/);
    assert.strictEqual(lignes(env, "Operations").length, 3);

    assert.strictEqual(await page.evaluate(() => window.__xss || 0), 0, "aucun code injecté");
    assert.deepStrictEqual(o.erreursPage, [], "aucune erreur dans la page");
    console.log("test_ui_offres : OK");
  } catch (e) {
    console.log("test_ui_offres : ÉCHEC " + ((e && e.stack) || e));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
