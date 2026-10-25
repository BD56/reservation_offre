// Rapidité : copie glissée dans la page (aucun appel au démarrage), réservations d'une offre
// active sans attente, enregistrement instantané + écriture en arrière-plan (indicateur,
// échec, Réessayer sans double), saisies de l'autre poste, offre terminée chargée à la
// demande, alerte doublon (comparaison, « Modifier l'existante »).
const assert = require("assert");
const { ouvrir, attendre } = require("./navigateur");
const { lignes } = require("./mocks");
const { preparer } = require("./donnees");
const repo = process.argv[2];

async function remplir(page, idOp, nom, prenom, tel, email, article) {
  if ((await page.inputValue("#operationSelect")) !== idOp) await page.selectOption("#operationSelect", idOp);
  await page.fill("#nomClient", nom);
  await page.fill("#prenomClient", prenom);
  await page.fill("#telClient", tel || "");
  await page.fill("#emailClient", email || "");
  if (article) await page.click(`.ligne-produit[data-article="${article}"] .plus`);
  else if (await page.$(".ligne-produit.libre input"))
    await page.fill(".ligne-produit.libre input", "Frangipane");
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

    // --- Avec la copie : aucun appel pour afficher le menu, les offres et les réservations ---
    o = await ouvrir(repo, { preparer });
    navigateurs.push(o.browser);
    const { page, env } = o;
    const appels = () => page.evaluate(() => window.__appels || []);
    const nb = () => lignes(env, "Reservations").length;
    const dialogues = () => page.$$eval(".voile:not([hidden])", (x) => x.map((v) => v.id));
    assert.strictEqual(await page.$$eval("#operationSelect option", (x) => x.length), 5);
    await page.click("#ongletOffres");
    await page.click(`.offre[data-offre="${env.ids.foie}"] [data-act="voir"]`);
    assert.strictEqual(await page.$$eval("#lignes .ligne", (x) => x.length), 2);
    assert.deepStrictEqual(await appels(), [], "démarrage + réservations d'une offre active : 0 appel");

    // --- Enregistrement instantané, écriture en arrière-plan ---
    env.retards.saveReservation = 1500;
    await page.click("#ongletSaisie");
    await remplir(page, env.ids.foie, "Lent", "Léo", "0611111111", "", "Bloc 200g");
    await page.click("#btnValiderReservation");
    await attendre(page, 150);
    assert.match(
      await page.textContent("#toastTxt"),
      /LENT Léo : réservation enregistrée/,
      "confirmé tout de suite"
    );
    assert.strictEqual(await page.inputValue("#nomClient"), "", "formulaire vidé tout de suite");
    assert.strictEqual(await page.textContent("#txtEnvoi"), "1 en cours d'envoi");
    assert.strictEqual(nb(), 3, "pas encore écrite par le serveur");
    assert.match(await page.textContent("#infosOffre"), /3 réservations/, "déjà comptée");
    // Un rechargement de la copie pendant l'envoi ne la fait pas disparaître
    await page.evaluate(() => rechargerCopie());
    await attendre(page, 200);
    assert.match(await page.textContent("#infosOffre"), /3 réservations/);
    await page.click("#voirListe");
    const premiere = "#lignes .ligne:first-child";
    assert.match(await page.textContent(premiere), /LENT Léo[\s\S]*envoi…/);
    await page.click(premiere + " .qui");
    assert.deepStrictEqual(await dialogues(), [], "pas de fiche pendant l'envoi");
    // Le serveur répond : plus d'indicateur, ligne modifiable
    await attendre(page, 1600);
    assert.strictEqual(nb(), 4);
    assert.ok(!(await page.isVisible("#indicateurEnvoi")));
    assert.match(await page.textContent(premiere), /En attente/);
    delete env.retards.saveReservation;

    // --- Réponse perdue (le serveur a écrit) puis Réessayer : pas de double ---
    env.pannesApres.saveReservation = "Connexion perdue";
    await page.click("#ongletSaisie");
    await remplir(page, env.ids.foie, "Perdu", "Paul", "0622222222", "", "L'entier");
    await page.click("#btnValiderReservation");
    await attendre(page, 500);
    assert.deepStrictEqual(await dialogues(), ["voileEchec"]);
    assert.strictEqual(await page.textContent("#echecMessage"), "Connexion perdue");
    assert.match(await page.textContent("#echecResume"), /PERDU Paul[\s\S]*1 × L'entier/);
    assert.strictEqual(nb(), 5, "écrite malgré la réponse perdue");
    delete env.pannesApres.saveReservation;
    await page.click("#echecReessayer");
    await attendre(page);
    assert.strictEqual(nb(), 5, "Réessayer n'écrit pas une 2e fois");
    const idPerdu = lignes(env, "Reservations").find((r) => r[2] === "PERDU")[0];
    assert.strictEqual(
      lignes(env, "Articles").filter((a) => a[1] === idPerdu).length,
      1,
      "articles pas en double"
    );
    assert.deepStrictEqual(await dialogues(), []);
    // Refus définitif : Abandonner
    env.pannes.saveReservation = "Cette offre n'existe plus. Rechargez la page.";
    await remplir(page, env.ids.foie, "Refus", "R", "0633333333", "", "L'entier");
    await page.click("#btnValiderReservation");
    await attendre(page, 500);
    assert.match(await page.textContent("#echecMessage"), /n'existe plus/);
    await page.click("#echecAbandon");
    assert.match(await page.textContent("#toastTxt"), /Réservation abandonnée/);
    assert.match(await page.textContent("#infosOffre"), /4 réservations/, "retirée de l'écran");
    delete env.pannes.saveReservation;

    // --- Saisie faite sur l'autre poste : visible au retour sur la fenêtre ---
    env.ctx.saveReservation({
      operationId: env.ids.atelier,
      nom: "Autre",
      prenom: "Poste",
      telephone: "0633333333",
      email: "",
      articles: [],
    });
    await page.selectOption("#operationSelect", env.ids.atelier);
    assert.match(await page.textContent("#infosOffre"), /0 réservation/);
    await page.evaluate(() => {
      copieRecueA = 0; // copie ancienne
      window.dispatchEvent(new Event("focus"));
    });
    await attendre(page);
    assert.match(await page.textContent("#infosOffre"), /1 réservation/);

    // --- Alerte doublon : même nom/prénom (accents, casse) + même email ---
    await remplir(page, env.ids.foie, "dupont", "AL", "", "AL@exemple.fr", "Bloc 200g");
    await page.click("#btnValiderReservation");
    assert.deepStrictEqual(await dialogues(), ["voileDoublon"]);
    const tableau = await page.textContent("#tableauDoublon");
    assert.match(tableau, /NomDUPONTDupontIDENTIQUE/);
    assert.match(tableau, /EmailAL@exemple\.fral@exemple\.frIDENTIQUE/);
    assert.match(tableau, /Articles1 × Bloc 200g5 × Bloc 200g, 1 × L'entier/);
    const avant = nb();
    await page.click("#doublonStop");
    assert.strictEqual(nb(), avant, "« Ne pas enregistrer » : rien d'écrit");
    assert.strictEqual(await page.inputValue("#nomClient"), "dupont", "saisie gardée");
    // Enregistrer quand même (confirmation dans la fenêtre)
    await page.click("#btnValiderReservation");
    await page.click("#doublonQuandMeme");
    assert.ok(await page.isVisible("#doublonConfirmer"));
    await page.click("#doublonForcer");
    await attendre(page);
    assert.strictEqual(nb(), avant + 1, "2e réservation confirmée");
    // Modifier l'existante : la fiche s'ouvre sur la réservation déjà faite
    await remplir(page, env.ids.foie, "Lént", "LEO", "+33 6 11 11 11 11", "", "Bloc 200g");
    await page.click("#btnValiderReservation");
    assert.deepStrictEqual(await dialogues(), ["voileDoublon"], "+33 6 11… = 0611…, Lént = Lent");
    await page.click("#doublonOuvrir");
    assert.deepStrictEqual(await dialogues(), ["voileFiche"]);
    assert.match(await page.textContent("#ficheTitre"), /LENT Léo/);
    assert.strictEqual(await page.inputValue("#nomClient"), "", "saisie abandonnée");
    await page.keyboard.press("Escape");
    // Même nom, autre téléphone : homonyme, pas d'alerte
    await remplir(page, env.ids.foie, "Lent", "Léo", "0699999998", "", "Bloc 200g");
    await page.click("#btnValiderReservation");
    await attendre(page);
    assert.deepStrictEqual(await dialogues(), [], "homonyme : pas d'alerte");
    // Réservation annulée : pas d'alerte
    env.ctx.updateReservationStatus(env.ids.resObrien, "Annulé");
    await page.evaluate(() => rechargerCopie());
    await attendre(page);
    await remplir(
      page,
      env.ids.foie,
      "O'Brien<img src=x onerror=window.__xss=1>",
      "Jo",
      "0612345678",
      "",
      "Bloc 200g"
    );
    await page.click("#btnValiderReservation");
    await attendre(page);
    assert.deepStrictEqual(await dialogues(), [], "réservation annulée : pas d'alerte");

    // --- Offre terminée : réservations chargées une fois, à la sélection ---
    const nDetails = async () => (await appels()).filter((a) => a === "getOperationDetails").length;
    const n0 = await nDetails();
    await page.selectOption("#operationSelect", env.ids.galettes);
    await attendre(page);
    assert.strictEqual(await nDetails(), n0 + 1);
    await remplir(page, env.ids.galettes, "Ancien", "Client", "06 99 99 99 99", "");
    await page.click("#btnValiderReservation");
    assert.deepStrictEqual(
      await dialogues(),
      ["voileDoublon"],
      "doublon détecté aussi sur une offre terminée"
    );
    await page.click("#doublonStop");
    await page.click("#voirListe");
    assert.match(await page.textContent("#lignes"), /Ancien Client/);
    assert.strictEqual(await nDetails(), n0 + 1, "pas rechargée à l'ouverture des réservations");

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
