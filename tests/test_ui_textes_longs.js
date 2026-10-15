// Noms très longs (mots sans espace, comme ceux tapés par Bryan) : aucun texte ne sort de
// sa case ni ne passe sous un bouton, sur PC et sur téléphone, dans tous les écrans.
const assert = require("assert");
const { ouvrir, attendre } = require("./navigateur");
const repo = process.argv[2];

const LONG = "omjilhugkyftjkuglihmojpùk^lùpimo=ul:iu;ytdrfguhijokkhoinlkkhjlmkoijopioiij";
const TRES_LONG = LONG + LONG + "." + LONG;

function preparer(env) {
  const c = env.ctx;
  c.saveOperation({
    nom: "Offre " + TRES_LONG,
    type: "Produit",
    modeSaisie: "Predefini",
    dateDebut: "",
    dateFin: "",
    articlesPredefinis: ["oiuyftdrdwfgh", LONG, TRES_LONG, "rtytvulyiumoijùpKPmojlihkgjfhd"].join(", "),
  });
  const idOp = env.sheets.Operations.getDataRange().getValues()[1][0];
  env.ids = { op: idOp };
  c.saveReservation({
    operationId: idOp,
    nom: "NOM" + LONG,
    prenom: "Prénom" + LONG,
    telephone: "0987654321",
    email: LONG + "@exemple.fr",
    articles: [
      { nom: "oiuyftdrdwfgh", quantite: 3 },
      { nom: LONG, quantite: 1 },
      { nom: TRES_LONG, quantite: 1 },
    ],
  });
  env.ids.res = env.sheets.Reservations.getDataRange().getValues()[1][0];
}

// Éléments dont un descendant sort (à droite) de la boîte, hors zones défilantes prévues
async function debordements(page, selecteur) {
  return page.$$eval(selecteur, (boites) => {
    const fautes = [];
    for (const boite of boites) {
      if (!boite.offsetParent && getComputedStyle(boite).position !== "fixed") continue; // masquée
      const droite = boite.getBoundingClientRect().right + 1;
      for (const el of boite.querySelectorAll("*")) {
        if (el.closest(".defile, .tableau, select")) continue; // défilement horizontal voulu
        const r = el.getBoundingClientRect();
        if (r.width && r.right > droite)
          fautes.push(
            `${boite.id || boite.className} > ${el.tagName}.${el.className} (${Math.round(r.right - droite)} px)`
          );
      }
    }
    return fautes;
  });
}

// Texte des cartes d'offre qui passe sous les boutons
async function chevauchements(page) {
  return page.$$eval(".offre", (cartes) =>
    cartes
      .map((carte) => {
        const texte = carte.firstElementChild.getBoundingClientRect();
        const boutons = carte.querySelector(".boutons-offre").getBoundingClientRect();
        const memeLigne = texte.bottom > boutons.top && texte.top < boutons.bottom;
        return memeLigne && texte.right > boutons.left + 1 ? carte.dataset.offre : null;
      })
      .filter(Boolean)
  );
}

(async () => {
  const navigateurs = [];
  try {
    for (const [largeur, hauteur] of [
      [1366, 820],
      [400, 860],
    ]) {
      const o = await ouvrir(repo, { preparer, page: { viewport: { width: largeur, height: hauteur } } });
      navigateurs.push(o.browser);
      const { page, env } = o;
      const fautes = [];
      const verifier = async (nom, selecteur) => {
        for (const f of await debordements(page, selecteur)) fautes.push(`${largeur}px ${nom} : ${f}`);
      };

      // Saisie : offre choisie, articles de la liste
      await page.selectOption("#operationSelect", env.ids.op);
      await verifier("saisie", "#formReservation");
      // Liste des offres
      await page.click("#ongletOffres");
      await verifier("offres", ".offre");
      for (const id of await chevauchements(page))
        fautes.push(`${largeur}px offres : texte sous les boutons (${id})`);
      // Réservations de l'offre
      await page.click('[data-act="voir"]');
      await verifier("détail", ".titre-ecran, #preparer, .ligne");
      // Fiche
      await page.click(`.ligne[data-res="${env.ids.res}"] .qui`);
      await verifier("fiche", "#voileFiche .fenetre-form");
      await page.keyboard.press("Escape");
      // Feuille de préparation
      await page.click("#detailFeuille");
      await verifier("feuille", "#feuille");
      await page.click('#voileFeuille [data-fermer="voileFeuille"]');
      // Éditeur d'offre (articles en étiquettes)
      await page.click("#detailModifier");
      await verifier("éditeur", "#voileOffre .fenetre-form");
      await page.keyboard.press("Escape");
      // Alerte doublon
      await page.click("#ongletSaisie");
      await page.fill("#nomClient", "NOM" + LONG);
      await page.fill("#prenomClient", "Prénom" + LONG);
      await page.fill("#telClient", "0987654321");
      await page.click(".ligne-produit .plus");
      await page.click("#btnValiderReservation");
      await attendre(page, 150);
      assert.ok(await page.isVisible("#voileDoublon"));
      await verifier("doublon", "#voileDoublon .fenetre");
      assert.strictEqual(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
        false,
        largeur + "px : pas de défilement horizontal de la page"
      );
      assert.deepStrictEqual(fautes, [], "textes qui débordent");
      assert.deepStrictEqual(o.erreursPage, []);
    }
    console.log("test_ui_textes_longs : OK");
  } catch (e) {
    console.log("test_ui_textes_longs : ÉCHEC " + ((e && e.stack) || e));
    process.exitCode = 1;
  } finally {
    for (const b of navigateurs) await b.close();
  }
})();
