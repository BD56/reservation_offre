// Rapidité (étape 2) : copie glissée dans la page (aucun appel au démarrage), détail
// immédiat, enregistrement instantané + écriture en arrière-plan (indicateur, échec,
// RÉESSAYER sans double), saisies de l'autre poste, offre terminée chargée à la demande,
// alerte doublon.
const assert = require("assert");
const { ouvrir, attendre } = require("./navigateur");
const { lignes } = require("./mocks");
const { preparer } = require("./donnees");
const repo = process.argv[2];

async function remplir(page, idOp, nom, prenom, tel, email, qte) {
  await page.selectOption("#operationSelect", idOp);
  await page.fill("#nomClient", nom);
  await page.fill("#prenomClient", prenom);
  if (tel) await page.fill("#telClient", tel);
  if (email) await page.fill("#emailClient", email);
  if (qte) await page.fill(".quantite-article >> nth=0", String(qte));
}

(async () => {
  const navigateurs = [];
  try {
    // --- Sans copie dans la page (lecture échouée dans doGet) : la page la demande ---
    let o = await ouvrir(repo, { preparer, sansCopie: true });
    navigateurs.push(o.browser);
    await attendre(o.page);
    assert.deepStrictEqual(await o.page.evaluate(() => window.__appels), ["chargerCopie"]);
    assert.strictEqual(await o.page.$$eval("#operationSelect option", (x) => x.length), 5);

    // --- Avec la copie : aucun appel au serveur pour afficher listes et détail ---
    o = await ouvrir(repo, { preparer });
    navigateurs.push(o.browser);
    const { page, env } = o;
    const appels = () => page.evaluate(() => window.__appels || []);
    const nb = (nom) => lignes(env, nom).length;
    assert.strictEqual(await page.$$eval("#operationSelect option", (x) => x.length), 5);
    await page.click("text=Gérer les Opérations");
    await attendre(page);
    await page.click("#tableOperationsBody tr:first-child td:first-child");
    await attendre(page);
    assert.ok(await page.isVisible("#modalDetailOffre"));
    assert.strictEqual(await page.$$eval("#tableInscritsBody tr", (x) => x.length), 2);
    assert.deepStrictEqual(await appels(), [], "démarrage + détail d'une offre active : 0 appel");
    await page.click("#modalDetailOffre .btn-close");
    await attendre(page);

    // --- Enregistrement instantané, écriture en arrière-plan ---
    env.retards.saveReservation = 1500;
    await remplir(page, env.ids.foie, "Lent", "Léo", "0611111111", "", 1);
    await page.click("#btnValiderReservation");
    await attendre(page, 150);
    assert.match(
      await page.textContent("#toastMessage"),
      /Réservation enregistrée/,
      "confirmé tout de suite"
    );
    assert.strictEqual(await page.inputValue("#nomClient"), "", "formulaire vidé tout de suite");
    assert.match(await page.textContent("#indicateurEnvoi"), /1 réservation en cours d'envoi/);
    assert.strictEqual(nb("Reservations"), 3, "pas encore écrite par le serveur");
    // Déjà dans les compteurs et dans le détail (menu « État » bloqué pendant l'envoi)
    await page.click("text=Gérer les Opérations");
    await attendre(page);
    assert.strictEqual(await page.textContent("#tableOperationsBody tr:first-child .badge"), "3");
    // Un rechargement de la copie pendant l'envoi ne la fait pas disparaître
    await page.evaluate(() => rechargerCopie());
    await attendre(page, 200);
    assert.strictEqual(await page.textContent("#tableOperationsBody tr:first-child .badge"), "3");
    await page.click("#tableOperationsBody tr:first-child td:first-child");
    await attendre(page);
    const derniere = "#tableInscritsBody tr:last-child";
    assert.match(await page.textContent(derniere), /Lent Léo[\s\S]*envoi en cours/);
    assert.ok(await page.isDisabled(derniere + " select"));
    // Le serveur répond : plus d'indicateur, état modifiable
    await attendre(page, 1600);
    assert.strictEqual(nb("Reservations"), 4);
    assert.ok(!(await page.isVisible("#indicateurEnvoi")));
    assert.ok(await page.isEnabled(derniere + " select"));
    assert.doesNotMatch(await page.textContent(derniere), /envoi en cours/);
    delete env.retards.saveReservation;
    await page.click("#modalDetailOffre .btn-close");
    await attendre(page);

    // --- Réponse perdue (le serveur a écrit) puis RÉESSAYER : pas de double ---
    env.pannesApres.saveReservation = "Connexion perdue";
    await remplir(page, env.ids.foie, "Perdu", "Paul", "0622222222", "", 2);
    await page.click("#btnValiderReservation");
    await attendre(page, 700);
    assert.ok(await page.isVisible("#modalEchecEnvoi"));
    assert.match(await page.textContent("#texteEchecEnvoi"), /Connexion perdue[\s\S]*Perdu Paul/);
    assert.strictEqual(nb("Reservations"), 5, "écrite malgré la réponse perdue");
    delete env.pannesApres.saveReservation;
    await page.click("#btnReessayerEnvoi");
    await attendre(page, 700);
    assert.strictEqual(nb("Reservations"), 5, "RÉESSAYER n'écrit pas une 2e fois");
    const idPerdu = lignes(env, "Reservations").find((r) => r[2] === "Perdu")[0];
    assert.strictEqual(
      lignes(env, "Articles").filter((a) => a[1] === idPerdu).length,
      1,
      "articles pas en double"
    );
    assert.ok(!(await page.isVisible("#modalEchecEnvoi")));

    // --- Saisie faite sur l'autre poste : visible au retour sur la fenêtre ---
    env.ctx.saveReservation({
      operationId: env.ids.atelier,
      nom: "Autre",
      prenom: "Poste",
      telephone: "0633333333",
      email: "",
      articles: [],
    });
    await page.click("text=Gérer les Opérations");
    await attendre(page);
    assert.strictEqual(await page.textContent("#tableOperationsBody tr:nth-child(3) .badge"), "0");
    await page.evaluate(() => {
      copieRecueA = 0; // copie ancienne
      window.dispatchEvent(new Event("focus"));
    });
    await attendre(page);
    assert.strictEqual(await page.textContent("#tableOperationsBody tr:nth-child(3) .badge"), "1");
    await page.click("#modalOperations .btn-close");
    await attendre(page);

    // --- Alerte doublon : même nom/prénom (accents, casse) + même téléphone (autre format) ---
    await remplir(page, env.ids.foie, "DUPONT", "Al", "", "AL@exemple.fr", 1);
    await page.click("#btnValiderReservation");
    await attendre(page);
    assert.ok(await page.isVisible("#modalDoublon"), "même nom + même email");
    assert.match(await page.textContent("#texteDoublon"), /Dupont Al[\s\S]*5x Bloc 200g, 1x L'entier/);
    const avant = nb("Reservations");
    await page.click("#modalDoublon >> text=Ne pas enregistrer");
    await attendre(page);
    assert.strictEqual(nb("Reservations"), avant, "« Ne pas enregistrer » : rien d'écrit");
    assert.strictEqual(await page.inputValue("#nomClient"), "DUPONT", "saisie gardée pour corriger");
    await page.click("#btnValiderReservation");
    await attendre(page);
    await page.click("#btnForcerDoublon");
    await attendre(page);
    assert.strictEqual(nb("Reservations"), avant + 1, "« Enregistrer quand même »");
    // Téléphone écrit autrement (+33, espaces) et nom avec accent : doublon aussi
    await remplir(page, env.ids.foie, "Lént", "LEO", "+33 6 11 11 11 11", "", 1);
    await page.click("#btnValiderReservation");
    await attendre(page);
    assert.ok(await page.isVisible("#modalDoublon"), "+33 6 11… = 0611…, Lént = Lent");
    await page.click("#modalDoublon >> text=Ne pas enregistrer");
    await attendre(page);
    // Même nom, autre téléphone : pas d'alerte (homonyme)
    await page.fill("#telClient", "0699999998");
    await page.click("#btnValiderReservation");
    await attendre(page);
    assert.ok(!(await page.isVisible("#modalDoublon")), "homonyme : pas d'alerte");
    assert.strictEqual(nb("Reservations"), avant + 2);
    // Réservation annulée : pas d'alerte
    env.ctx.updateReservationStatus(env.ids.resObrien, "Annulé");
    await page.evaluate(() => rechargerCopie());
    await attendre(page);
    await remplir(page, env.ids.foie, "O'Brien<img src=x onerror=window.__xss=1>", "Jo", "0612345678", "", 1);
    await page.click("#btnValiderReservation");
    await attendre(page);
    assert.ok(!(await page.isVisible("#modalDoublon")), "réservation annulée : pas d'alerte");

    // --- Offre terminée : réservations chargées une fois, à la sélection ---
    const n0 = (await appels()).filter((a) => a === "getOperationDetails").length;
    await remplir(page, env.ids.galettes, "Ancien", "Client", "06 99 99 99 99", "", 0);
    await attendre(page);
    assert.strictEqual((await appels()).filter((a) => a === "getOperationDetails").length, n0 + 1);
    await page.fill(".nom-article", "Frangipane");
    await page.fill(".quantite-article", "1");
    await page.click("#btnValiderReservation");
    await attendre(page);
    assert.ok(await page.isVisible("#modalDoublon"), "doublon détecté aussi sur une offre terminée");
    await page.click("#modalDoublon >> text=Ne pas enregistrer");
    await attendre(page);
    await page.click("text=Gérer les Opérations");
    await attendre(page);
    await page.click("#tableOperationsBody tr:nth-child(4) td:first-child");
    await attendre(page);
    assert.match(await page.textContent("#tableInscritsBody"), /Ancien Client/);
    assert.strictEqual(
      (await appels()).filter((a) => a === "getOperationDetails").length,
      n0 + 1,
      "pas rechargée à l'ouverture du détail"
    );

    assert.strictEqual(await page.evaluate(() => window.__xss || 0), 0, "aucun code injecté");
    assert.deepStrictEqual(o.erreursPage, [], "aucune erreur dans la page");
    console.log("test_ui_copie : OK");
  } catch (e) {
    console.log("test_ui_copie : ÉCHEC " + ((e && e.stack) || e));
    process.exitCode = 1;
  } finally {
    for (const b of navigateurs) await b.close();
  }
})();
