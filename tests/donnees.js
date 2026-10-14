// Jeu de données commun aux tests de la page : trois offres actives, une terminée, et
// quelques réservations.
function preparer(env) {
  const c = env.ctx;
  c.saveOperation({
    nom: 'Foie <b>gras</b> "Noël"',
    type: "Produit",
    modeSaisie: "Predefini",
    dateDebut: "2026-12-01",
    dateFin: "2026-12-24",
    articlesPredefinis: "Bloc 200g, L'entier",
  });
  c.saveOperation({
    nom: "Chocolats",
    type: "Produit",
    modeSaisie: "Libre",
    dateDebut: "",
    dateFin: "",
    articlesPredefinis: "",
  });
  c.saveOperation({
    nom: "Atelier",
    type: "Evenement",
    modeSaisie: "",
    dateDebut: "2026-12-10",
    dateFin: "2026-12-10",
    articlesPredefinis: "",
  });
  c.saveOperation({
    nom: "Galettes 2025",
    type: "Produit",
    modeSaisie: "Libre",
    dateDebut: "2025-01-02",
    dateFin: "2025-01-31",
    articlesPredefinis: "",
  });
  const ops = env.sheets.Operations.getDataRange().getValues().slice(1);
  env.ids = { foie: ops[0][0], choco: ops[1][0], atelier: ops[2][0], galettes: ops[3][0] };

  c.saveReservation({
    operationId: env.ids.foie,
    nom: "O'Brien<img src=x onerror=window.__xss=1>",
    prenom: "Jo",
    telephone: "0612345678",
    email: "",
    articles: [{ nom: "Bloc 200g", quantite: 2 }],
  });
  c.saveReservation({
    operationId: env.ids.foie,
    nom: "Dupont",
    prenom: "Al",
    telephone: "",
    email: "al@exemple.fr",
    articles: [
      { nom: "Bloc 200g", quantite: 5 },
      { nom: "L'entier", quantite: 1 },
    ],
  });
  const res = env.sheets.Reservations.getDataRange().getValues().slice(1);
  env.ids.resObrien = res[0][0];
  env.ids.resDupont = res[1][0];
  // Offre terminée (Galettes 2025) avec une réservation
  c.saveReservation({
    operationId: env.ids.galettes,
    nom: "Ancien",
    prenom: "Client",
    telephone: "0699999999",
    email: "",
    articles: [{ nom: "Frangipane", quantite: 1 }],
  });
}
module.exports = { preparer };
