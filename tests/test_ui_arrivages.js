// Page : arrivages par lot (répartition de la plus ancienne réservation à la plus récente),
// « Retiré » partiel + Annuler, fiche (commandé / arrivé / remis, limité par le stock),
// annulation qui rend le stock, feuille de préparation ; offre d'évènement inchangée.
const assert = require("assert");
const { ouvrir, attendre } = require("./navigateur");
const { lignes } = require("./mocks");
const repo = process.argv[2];

function preparer(env) {
  const c = env.ctx;
  c.saveOperation({
    nom: "Plateaux",
    type: "Produit",
    modeSaisie: "Predefini",
    dateDebut: "",
    dateFin: "",
    articlesPredefinis: "Océan, Prestige",
  });
  c.saveOperation({
    nom: "Atelier",
    type: "Evenement",
    modeSaisie: "",
    dateDebut: "",
    dateFin: "",
    articlesPredefinis: "",
  });
  const ops = env.sheets.Operations.getDataRange().getValues().slice(1);
  env.ids = { op: ops[0][0], atelier: ops[1][0] };
  const client = (nom, articles, op) =>
    c.saveReservation({
      operationId: op || env.ids.op,
      nom: nom,
      prenom: "X",
      telephone: "06000000" + String(nom.length).padStart(2, "0"),
      email: "",
      articles: articles,
    }).idRes;
  env.ids.a = client("ANNE", [{ nom: "Océan", quantite: 1 }]);
  env.ids.b = client("BERNARD", [
    { nom: "Océan", quantite: 3 },
    { nom: "Prestige", quantite: 1 },
  ]);
  env.ids.c = client("CLAIRE", [{ nom: "Océan", quantite: 2 }]);
  env.ids.e = client("ÉMILE", [], env.ids.atelier);
  c.updateReservationStatus(env.ids.a, "Contacté");
  c.updateReservationStatus(env.ids.b, "Contacté");
}

(async () => {
  let browser;
  try {
    const o = await ouvrir(repo, { preparer });
    browser = o.browser;
    const { page, env } = o;
    const toast = () => page.textContent("#toastTxt");
    const etat = (id) => lignes(env, "Reservations").find((r) => r[0] === id)[5];
    const arts = (id) =>
      lignes(env, "Articles")
        .filter((a) => a[1] === id)
        .map((a) => [a[2], a[3], a[4], a[5]]);
    const ligne = (id) => `.ligne[data-res="${id}"]`;
    const articlesLigne = (id) =>
      page.$$eval(`${ligne(id)} .liste-articles li`, (x) => x.map((e) => e.textContent));
    const jauge = (i) => page.textContent(`#arrivages .art:nth-child(${i}) .jauge span`);
    const champOcean = "#arrivages .art:nth-child(1) input";

    await page.click("#ongletOffres");
    await page.click(`.offre[data-offre="${env.ids.op}"] [data-act="voir"]`);
    assert.ok(await page.isVisible("#blocArrivages"));
    assert.deepStrictEqual(await page.$$eval("#arrivages .art > b", (x) => x.map((e) => e.textContent)), [
      "Océan",
      "Prestige",
    ]);
    assert.strictEqual(await jauge(1), "0 arrivé sur 6 commandés · 0 remis · reçus : 0");

    // --- Quantité absente ou invalide : rien n'est envoyé ---
    await page.click("#arrivages .art:nth-child(1) button");
    assert.match(await toast(), /Indiquez la quantité reçue/);
    await page.fill(champOcean, "-2");
    await page.press(champOcean, "Enter");
    assert.match(await toast(), /Indiquez la quantité reçue/);
    assert.strictEqual(lignes(env, "Arrivages").length, 0);

    // --- 3 Océan reçus : Anne (1) puis Bernard (2 sur 3), Claire attend ---
    await page.fill(champOcean, "3");
    await page.press(champOcean, "Enter");
    await attendre(page);
    assert.match(await toast(), /3 reçus · Océan : 2 clients servis/);
    assert.strictEqual(lignes(env, "Arrivages")[0][2], "Océan");
    assert.strictEqual(await jauge(1), "3 arrivés sur 6 commandés · 0 remis · reçus : 3");
    assert.deepStrictEqual(await articlesLigne(env.ids.a), ["1/1Océan · 1 à remettre"]);
    assert.deepStrictEqual(await articlesLigne(env.ids.b), ["2/3Océan · 2 à remettre", "0/1Prestige"]);
    assert.match(
      await page.textContent(`${ligne(env.ids.a)} .actions-ligne`),
      /Contacté\s*Tout est là\s*Retiré/
    );
    assert.match(await page.textContent(`${ligne(env.ids.b)} .actions-ligne`), /2 à remettre/);
    assert.match(await page.textContent(`${ligne(env.ids.c)} .actions-ligne`), /En attente/);
    assert.strictEqual(await page.$$eval(`${ligne(env.ids.c)} .retire-btn`, (x) => x.length), 0);

    // --- Retrait partiel : Bernard emporte ses 2 Océan, le reste suivra ---
    await page.click(`${ligne(env.ids.b)} .retire-btn`);
    assert.match(await toast(), /BERNARD X : 2 articles remis · reste 2 à venir/);
    await attendre(page);
    assert.deepStrictEqual(arts(env.ids.b), [
      ["Océan", 3, 2, 2],
      ["Prestige", 1, 0, 0],
    ]);
    assert.strictEqual(etat(env.ids.b), "Contacté", "incomplet : l'état ne change pas");
    assert.deepStrictEqual(await articlesLigne(env.ids.b), ["2/3Océan · 2 déjà remis", "0/1Prestige"]);
    assert.match(await page.textContent(`${ligne(env.ids.b)} .actions-ligne`), /En attente/);
    await page.click("#toastAnnuler");
    await attendre(page);
    assert.deepStrictEqual(arts(env.ids.b)[0], ["Océan", 3, 2, 0], "Annuler : rien de remis");

    // --- Anne emporte tout : Terminée ; Annuler lui rend « Contacté » ---
    // Annuler avant même la réponse du retrait (lent) : l'annulation passe après lui
    let appels = 0;
    env.retards.remettre = () => (appels++ === 0 ? 600 : 0);
    await page.click(`${ligne(env.ids.a)} .retire-btn`);
    await page.click("#toastAnnuler");
    await attendre(page, 1200);
    delete env.retards.remettre;
    assert.deepStrictEqual(arts(env.ids.a), [["Océan", 1, 1, 0]]);
    assert.strictEqual(etat(env.ids.a), "Contacté");
    await page.click(`${ligne(env.ids.a)} .retire-btn`);
    await attendre(page);
    assert.strictEqual(etat(env.ids.a), "Retrait");
    assert.match(await page.textContent(`${ligne(env.ids.a)} .actions-ligne`), /Terminée/);
    assert.match(await page.textContent('.filtre[data-filtre="terminee"]'), /Terminées\s*1/);
    assert.match(await page.textContent('.filtre[data-filtre="Contacté"]'), /Contactés\s*1/);

    // --- Fiche de Claire : plus rien en stock, « + » d'Arrivé bloqué ---
    await page.click(`${ligne(env.ids.c)} .qui`);
    assert.deepStrictEqual(
      await page.$$eval("#ficheEtat button", (x) => x.map((e) => e.textContent)),
      ["Réservé", "Contacté", "Annulé"],
      "« Terminée » est calculé"
    );
    const ficheArt = '#ficheArticles [data-article="Océan"]';
    assert.match(await page.textContent(ficheArt), /plus rien en stock/);
    assert.ok(await page.isDisabled(`${ficheArt} [data-champ="arrive"] [data-d="1"]`));
    await page.keyboard.press("Escape");

    // --- Bernard annule : ses 2 Océan arrivés retournent en stock ---
    await page.click(`${ligne(env.ids.b)} .qui`);
    await page.click('#ficheEtat [data-etat="Annulé"]');
    await page.click("#ficheEnregistrer");
    await attendre(page);
    assert.deepStrictEqual(arts(env.ids.b)[0], ["Océan", 3, 0, 0]);
    assert.match(await jauge(1), /reçus : 3 · 2 en stock$/);

    // --- Fiche de Claire : on lui donne le stock, elle en emporte 1 ---
    await page.click(`${ligne(env.ids.c)} .qui`);
    assert.match(await page.textContent(ficheArt), /2 en stock/);
    await page.click(`${ficheArt} [data-champ="arrive"] [data-d="1"]`);
    await page.click(`${ficheArt} [data-champ="arrive"] [data-d="1"]`);
    assert.ok(await page.isDisabled(`${ficheArt} [data-champ="arrive"] [data-d="1"]`), "au plus le commandé");
    await page.click(`${ficheArt} [data-champ="remis"] [data-d="1"]`);
    assert.ok(!(await page.isVisible("#ficheTerminee")));
    await page.click("#ficheEnregistrer");
    await attendre(page);
    assert.deepStrictEqual(arts(env.ids.c), [["Océan", 2, 2, 1]]);
    assert.deepStrictEqual(await articlesLigne(env.ids.c), ["2/2Océan · 1 à remettre (1 déjà remis)"]);
    assert.strictEqual(await jauge(1), "3 arrivés sur 3 commandés · 2 remis · reçus : 3");
    // Le 2e remis : la fiche annonce « Terminée »
    await page.click(`${ligne(env.ids.c)} .qui`);
    await page.click(`${ficheArt} [data-champ="remis"] [data-d="1"]`);
    assert.ok(await page.isVisible("#ficheTerminee"));
    await page.click("#ficheEnregistrer");
    await attendre(page);
    assert.strictEqual(etat(env.ids.c), "Retrait");
    // Commandé réduit sous l'arrivé : le surplus retourne en stock
    await page.click(`${ligne(env.ids.a)} .qui`);
    await page.click('#ficheArticles [data-article="Prestige"] .plus');
    await page.click('#ficheArticles [data-article="Océan"] .moins');
    await page.click("#ficheEnregistrer");
    await attendre(page);
    assert.deepStrictEqual(arts(env.ids.a), [["Prestige", 1, 0, 0]]);
    assert.strictEqual(etat(env.ids.a), "Réservé", "plus tout remis : n'est plus Terminée");
    assert.match(await jauge(1), /reçus : 3 · 1 en stock$/);

    // --- « Répartir » sans quantité : le stock va à qui en manque (personne ici) ---
    await page.click("#arrivages .art:nth-child(1) button");
    await attendre(page);
    assert.match(await toast(), /Stock redistribué · Océan : personne à servir · 1 en stock/);
    // Refus du serveur : bouton rendu, message affiché
    env.pannes.enregistrerArrivage = "Réseau coupé";
    await page.fill("#arrivages .art:nth-child(2) input", "1");
    await page.click("#arrivages .art:nth-child(2) button");
    await attendre(page);
    assert.match(await toast(), /Erreur : Réseau coupé/);
    assert.ok(await page.isEnabled("#arrivages .art:nth-child(2) button"));
    assert.strictEqual(await page.inputValue("#arrivages .art:nth-child(2) input"), "1", "saisie gardée");
    delete env.pannes.enregistrerArrivage;
    // Un rechargement de la copie garde la saisie en cours
    await page.evaluate(() => rechargerCopie());
    await attendre(page);
    assert.strictEqual(await page.inputValue("#arrivages .art:nth-child(2) input"), "1");
    await page.click("#arrivages .art:nth-child(2) button");
    await attendre(page);
    assert.match(await toast(), /1 reçu · Prestige : 1 client servi/);
    assert.deepStrictEqual(arts(env.ids.a), [["Prestige", 1, 1, 0]]);

    // --- Feuille de préparation : totaux par article ---
    await page.click("#detailFeuille");
    const feuille = await page.innerHTML("#feuille");
    assert.match(
      feuille,
      /<td>Océan<\/td><td class="qte">2<\/td><td class="qte">2<\/td><td class="qte">2<\/td><td class="qte">0<\/td><td class="qte">1<\/td>/
    );
    assert.match(
      feuille,
      /<td>Prestige<\/td><td class="qte">1<\/td><td class="qte">1<\/td><td class="qte">0<\/td><td class="qte">1<\/td><td class="qte">0<\/td>/
    );
    await page.keyboard.press("Escape");

    // --- Offre d'évènement : ni arrivages ni « Retiré », 4 états dans la fiche ---
    await page.click("#retourOffres");
    await page.click(`.offre[data-offre="${env.ids.atelier}"] [data-act="voir"]`);
    assert.ok(!(await page.isVisible("#blocArrivages")));
    assert.match(await page.textContent('.filtre[data-filtre="Retrait"]'), /Retirées\s*0/);
    await page.click(`${ligne(env.ids.e)} .qui`);
    assert.strictEqual(await page.$$eval("#ficheEtat button", (x) => x.length), 4);
    await page.click('#ficheEtat [data-etat="Retrait"]');
    await page.click("#ficheEnregistrer");
    await attendre(page);
    assert.strictEqual(etat(env.ids.e), "Retrait");

    assert.deepStrictEqual(o.erreursPage, [], "aucune erreur dans la page");
    console.log("test_ui_arrivages : OK");
  } catch (e) {
    console.log("test_ui_arrivages : ÉCHEC " + ((e && e.stack) || e));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
