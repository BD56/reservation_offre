// Page : offres et réservations — liste des offres, réservations d'une offre (recherche,
// filtres, reste à préparer, « Retiré » + Annuler), fiche (modifier, supprimer), feuille de
// préparation, création / modification / suppression d'une offre.
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
    const toast = () => page.textContent("#toastTxt");
    const lignesEcran = () =>
      page.$$eval("#lignes .ligne", (x) => x.map((l) => l.querySelector(".qui b").textContent));
    const resa = (id) => lignes(env, "Reservations").find((r) => r[0] === id);

    // --- Liste des offres ---
    await page.click("#ongletOffres");
    assert.deepStrictEqual(
      await page.$$eval("#listeOffres .groupe-titre", (x) => x.map((e) => e.textContent)),
      ["En cours et à venir", "Terminées"]
    );
    const cartes = await page.$$eval("#listeOffres .offre", (x) =>
      x.map((c) => [
        c.querySelector("h3").firstChild.textContent.trim(),
        c.querySelector(".infos").textContent,
      ])
    );
    assert.deepStrictEqual(
      cartes.map((c) => c[0]),
      ['Foie <b>gras</b> "Noël"', "Chocolats", "Atelier", "Galettes 2025"]
    );
    assert.match(
      cartes[0][1],
      /Du 01\/12\/2026 au 24\/12\/2026[\s\S]*2 réservations · 0 retirée[\s\S]*Bloc 200g, L'entier/
    );

    // --- Réservations d'une offre ---
    await page.click('.offre[data-offre="' + env.ids.foie + '"] [data-act="voir"]');
    assert.ok(await page.isVisible("#ecranDetail"));
    assert.strictEqual(await page.textContent("#titreDetail"), 'Foie <b>gras</b> "Noël"');
    assert.deepStrictEqual(await lignesEcran(), [
      "Dupont Al",
      "O'Brien<img src=x onerror=window.__xss=1> Jo",
    ]);
    assert.match(await page.textContent("#preparer"), /Reste à préparer\s*7 Bloc 200g\s*1 L'entier/);
    assert.deepStrictEqual(
      await page.$$eval(`.ligne[data-res="${env.ids.resDupont}"] .liste-articles li`, (x) =>
        x.map((e) => e.textContent)
      ),
      ["5 × Bloc 200g", "1 × L'entier"],
      "un article par ligne"
    );
    // Recherche : nom, téléphone, email
    await page.fill("#recherche", "brien");
    assert.deepStrictEqual(await lignesEcran(), ["O'Brien<img src=x onerror=window.__xss=1> Jo"]);
    await page.fill("#recherche", "06 12 34");
    assert.strictEqual((await lignesEcran()).length, 1, "téléphone avec espaces");
    await page.fill("#recherche", "AL@EXEMPLE");
    assert.deepStrictEqual(await lignesEcran(), ["Dupont Al"]);
    await page.fill("#recherche", "personne");
    assert.match(await page.textContent("#lignes"), /Aucune réservation ne correspond à « personne »/);
    await page.fill("#recherche", "");

    // --- « Retiré » sans confirmation, « Annuler » dans le message ---
    await page.click(`.ligne[data-res="${env.ids.resObrien}"] .retire-btn`);
    assert.match(await toast(), /O'Brien.* : retrait noté/);
    await attendre(page);
    assert.strictEqual(resa(env.ids.resObrien)[5], "Retrait");
    assert.match(await page.textContent("#preparer"), /5 Bloc 200g/, "retirée : plus à préparer");
    await page.click("#toastAnnuler");
    await attendre(page);
    assert.strictEqual(resa(env.ids.resObrien)[5], "Réservé", "Annuler remet l'ancien état");
    assert.match(await toast(), /Retrait annulé/);
    // Refus du serveur : l'écran revient comme avant
    env.pannes.updateReservationStatus = "Réseau coupé";
    await page.click(`.ligne[data-res="${env.ids.resObrien}"] .retire-btn`);
    await attendre(page);
    assert.match(await toast(), /Erreur : Réseau coupé/);
    assert.match(await page.textContent(`.ligne[data-res="${env.ids.resObrien}"]`), /Réservé[\s\S]*Retiré/);
    delete env.pannes.updateReservationStatus;
    // Filtres par état
    await page.click(`.ligne[data-res="${env.ids.resObrien}"] .retire-btn`);
    await attendre(page);
    await page.click('.filtre[data-filtre="Retrait"]');
    assert.deepStrictEqual(await lignesEcran(), ["O'Brien<img src=x onerror=window.__xss=1> Jo"]);
    assert.match(await page.textContent('.filtre[data-filtre="Réservé"]'), /À retirer\s*1/);
    await page.click('.filtre[data-filtre="Toutes"]');

    // --- Fiche : modifier une réservation ---
    await page.click(`.ligne[data-res="${env.ids.resDupont}"] .qui`);
    assert.ok(await page.isVisible("#voileFiche"));
    assert.strictEqual(await page.inputValue("#fEmail"), "al@exemple.fr");
    assert.strictEqual(await page.inputValue("#fTel"), "");
    assert.ok(await page.isDisabled("#ficheEnregistrer"), "rien à enregistrer tant que rien ne change");
    await page.fill("#fEmail", "");
    await page.click("#ficheEnregistrer");
    assert.match(await page.textContent("#ficheErreur"), /téléphone ou un email/);
    await page.fill("#fTel", "07 00 00 00 01");
    for (let i = 0; i < 5; i++) await page.click('#ficheArticles [data-article="Bloc 200g"] .moins');
    await page.click('#ficheArticles [data-article="L\'entier"] .moins');
    await page.click("#ficheEnregistrer");
    assert.match(await page.textContent("#ficheErreur"), /Au moins un article/);
    await page.click('#ficheArticles [data-article="Bloc 200g"] .plus');
    await page.click('#ficheArticles [data-article="Bloc 200g"] .plus');
    await page.click('#ficheEtat [data-etat="Contacté"]');
    env.pannes.updateReservation = "Feuille protégée";
    await page.click("#ficheEnregistrer");
    await attendre(page);
    assert.match(await page.textContent("#ficheErreur"), /Feuille protégée/);
    assert.ok(await page.isVisible("#voileFiche"), "fiche gardée ouverte après un échec");
    delete env.pannes.updateReservation;
    await page.click("#ficheEnregistrer");
    await attendre(page);
    assert.ok(!(await page.isVisible("#voileFiche")));
    assert.match(await toast(), /DUPONT Al : modifications enregistrées/);
    assert.deepStrictEqual(resa(env.ids.resDupont).slice(2, 6), [
      "DUPONT",
      "Al",
      "07 00 00 00 01",
      "Contacté",
    ]);
    assert.deepStrictEqual(
      lignes(env, "Articles")
        .filter((a) => a[1] === env.ids.resDupont)
        .map((a) => [a[2], a[3]]),
      [["Bloc 200g", 2]]
    );
    assert.deepStrictEqual(
      await page.$$eval(`.ligne[data-res="${env.ids.resDupont}"] .liste-articles li`, (x) =>
        x.map((e) => e.textContent)
      ),
      ["2 × Bloc 200g"]
    );
    assert.match(
      await page.textContent(`.ligne[data-res="${env.ids.resDupont}"] .actions-ligne`),
      /Contacté/
    );

    // --- Feuille de préparation ---
    await page.click(`.ligne[data-res="${env.ids.resDupont}"] .qui`);
    await page.click('#ficheEtat [data-etat="Annulé"]');
    await page.click("#ficheEnregistrer");
    await attendre(page);
    await page.click("#detailFeuille");
    assert.ok(await page.isVisible("#voileFeuille"));
    let feuille = await page.innerHTML("#feuille");
    assert.match(
      feuille,
      /Total à préparer[\s\S]*<td>Bloc 200g<\/td><td class="qte">2<\/td>/,
      "annulée hors total"
    );
    assert.doesNotMatch(feuille, /DUPONT/, "annulée pas listée par défaut");
    assert.ok(!feuille.includes("<img"), "noms échappés");
    await page.check("#feuilleAnnulees");
    feuille = await page.innerHTML("#feuille");
    assert.match(feuille, /<tr class="barre">[\s\S]*DUPONT/, "annulée listée, barrée, sur demande");
    await page.click("#feuilleImprimer");
    const imprime = await page.evaluate(() => window.__imprime);
    assert.match(imprime, /Commandes à pointer \(2\)/);
    assert.match(imprime, /<li><b>2 ×<\/b> <span>Bloc 200g<\/span><\/li>/, "feuille : un article par ligne");
    assert.strictEqual(await page.innerHTML("#zoneImpression"), "", "zone d'impression vidée après");
    await page.click('#voileFeuille [data-fermer="voileFeuille"]');

    // --- Fiche : supprimer une réservation ---
    await page.click(`.ligne[data-res="${env.ids.resDupont}"] .qui`);
    await page.click("#ficheSupprimer");
    assert.ok(await page.isVisible("#ficheConfirme"));
    await page.click("#ficheSupprimerOui");
    await attendre(page);
    assert.ok(!resa(env.ids.resDupont), "réservation supprimée");
    assert.ok(!lignes(env, "Articles").some((a) => a[1] === env.ids.resDupont), "et ses articles");
    assert.deepStrictEqual(await lignesEcran(), ["O'Brien<img src=x onerror=window.__xss=1> Jo"]);

    // --- Modifier l'offre ---
    await page.click("#detailModifier");
    assert.deepStrictEqual(
      await page.$$eval("#oArticles .puce-article", (x) => x.map((e) => e.textContent.trim())),
      ["Bloc 200g", "L'entier"]
    );
    await page.click('#oArticles [aria-label="Retirer L\'entier"]');
    await page.fill("#oNouvelArticle", "Médaillon");
    await page.press("#oNouvelArticle", "Enter");
    await page.fill("#oNom", "Foie gras 2026");
    await page.fill("#oFin", "2026-11-01");
    await page.click("#oEnregistrer");
    assert.match(await page.textContent("#oErreur"), /date de fin est avant/);
    await page.fill("#oFin", "2026-12-31");
    await page.click("#oEnregistrer");
    await attendre(page);
    assert.match(await toast(), /Offre « Foie gras 2026 » mise à jour/);
    const opFoie = lignes(env, "Operations").find((x) => x[0] === env.ids.foie);
    assert.strictEqual(opFoie[1], "Foie gras 2026");
    assert.strictEqual(opFoie[6], "Bloc 200g, Médaillon");
    assert.strictEqual(await page.textContent("#titreDetail"), "Foie gras 2026", "page à jour");

    // --- Nouvelle offre ---
    await page.click("#retourOffres");
    await page.click("#nouvelleOffre");
    await page.click("#oEnregistrer");
    assert.match(await page.textContent("#oErreur"), /Donnez un nom/);
    await page.fill("#oNom", "Galettes 2027");
    await page.click("#oEnregistrer");
    assert.match(await page.textContent("#oErreur"), /au moins un article/, "liste fixe vide");
    await page.fill("#oNouvelArticle", "Frangipane, Pomme");
    await page.click("#oAjouter");
    assert.strictEqual(
      await page.$$eval("#oArticles .puce-article", (x) => x.length),
      2,
      "virgule = 2 articles"
    );
    env.pannes.saveOperation = "Quota dépassé";
    await page.click("#oEnregistrer");
    await attendre(page);
    assert.match(await page.textContent("#oErreur"), /Quota dépassé/);
    assert.ok(await page.isEnabled("#oEnregistrer"));
    delete env.pannes.saveOperation;
    await page.click("#oEnregistrer");
    await attendre(page);
    let op = lignes(env, "Operations").slice(-1)[0];
    assert.deepStrictEqual(
      [op[1], op[2], op[5], op[6]],
      ["Galettes 2027", "Produit", "Predefini", "Frangipane, Pomme"]
    );
    await page.click("#nouvelleOffre");
    await page.fill("#oNom", "Dégustation");
    await page.click('#oType [data-val="Evenement"]');
    assert.ok(!(await page.isVisible("#oBlocMode")), "évènement : pas d'articles");
    await page.click("#oEnregistrer");
    await attendre(page);
    op = lignes(env, "Operations").slice(-1)[0];
    assert.deepStrictEqual([op[1], op[2], op[5], op[6]], ["Dégustation", "Evenement", "", ""]);
    assert.ok((await page.textContent("#listeOffres")).includes("Dégustation"));

    // --- Supprimer une offre (confirmé dans la carte) ---
    const carte = `.offre[data-offre="${env.ids.foie}"]`;
    await page.click(`${carte} [data-act="supprimer"]`);
    assert.match(
      await page.textContent(`${carte} .confirme`),
      /Supprimer « Foie gras 2026 » et sa réservation \?/
    );
    await page.click(`${carte} [data-non]`);
    assert.strictEqual(await page.$$eval(`${carte} .confirme`, (x) => x.length), 0);
    env.pannes.deleteOperation = "Feuille protégée";
    await page.click(`${carte} [data-act="supprimer"]`);
    await page.click(`${carte} [data-oui]`);
    await attendre(page);
    assert.match(await toast(), /Feuille protégée/);
    assert.ok(lignes(env, "Operations").some((x) => x[0] === env.ids.foie));
    delete env.pannes.deleteOperation;
    await page.click(`${carte} [data-act="supprimer"]`);
    await page.click(`${carte} [data-oui]`);
    await attendre(page);
    assert.ok(!lignes(env, "Operations").some((x) => x[0] === env.ids.foie));
    assert.ok(!lignes(env, "Reservations").some((x) => x[1] === env.ids.foie), "ses réservations aussi");
    assert.match(await toast(), /Offre « Foie gras 2026 » supprimée/);
    assert.strictEqual(await page.$$eval(carte, (x) => x.length), 0);

    // --- Mentions légales et aide ---
    await page.click("#ongletSaisie");
    await page.click("#lienMentions");
    assert.match(await page.textContent("#voileMentions"), /Hypermarché Carrefour Vannes/);
    await page.keyboard.press("Escape");
    assert.ok(!(await page.isVisible("#voileMentions")));
    // Aide en fenêtre centrée : fermée par la croix ou par un clic à côté
    await page.click("#btnAide");
    assert.ok(await page.isVisible("#aide .fenetre-form"));
    await page.mouse.click(5, 300);
    assert.ok(!(await page.isVisible("#aide")), "clic à côté : fermée");
    await page.click("#btnAide");
    await page.click("#fermerAide");
    assert.ok(!(await page.isVisible("#aide")));

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
