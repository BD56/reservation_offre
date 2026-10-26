// Structure du Google Sheets et listes fixes. Lu en premier (ordre alphabétique) :
// une seule portée globale pour tous les .gs (un nom déclaré dans deux fichiers = erreur).

// Même numéro dans tous les fichiers : contrôle de l'installation (outils/version.js).
function version_00_Constantes_() {
  return "2026.10.26-1645";
}

// Onglets du classeur
const FEUILLE_OPERATIONS = "Operations";
const FEUILLE_RESERVATIONS = "Reservations";
const FEUILLE_ARTICLES = "Articles";
const FEUILLE_ARRIVAGES = "Arrivages";

// En-têtes écrits par l'installation (onglet créé, ou ligne 1 vide / incomplète)
const ENTETES = {
  Operations: ["ID_Operation", "Nom", "Type", "Date_Debut", "Date_Fin", "Mode_Saisie", "Articles_Predefinis"],
  Reservations: ["ID_Reservation", "ID_Operation", "Nom", "Prenom", "Contact", "Etat", "Date_Saisie"],
  Articles: ["ID_Article", "ID_Reservation", "Article", "Quantite", "Arrive", "Remis"],
  Arrivages: ["Date", "ID_Operation", "Article", "Quantite"],
};
// Format des colonnes de dates (colonne A = 1)
const FORMATS_DATES = {
  Operations: [
    [4, "dd/MM/yyyy"],
    [5, "dd/MM/yyyy"],
  ],
  Reservations: [[7, "dd/MM/yyyy HH:mm"]],
  Articles: [],
  Arrivages: [[1, "dd/MM/yyyy HH:mm"]],
};
// À changer quand des onglets ou des colonnes s'ajoutent : doGet complète alors
// l'installation tout seul (sinon un seul petit contrôle à chaque ouverture).
const SCHEMA = "2";

// Colonnes (index des tableaux de getValues : A = 0)
// Operations : ID, Nom, Type, Date début, Date fin, Mode de saisie, Articles prédéfinis
const OP = { ID: 0, NOM: 1, TYPE: 2, DEBUT: 3, FIN: 4, MODE: 5, ARTICLES: 6 };
// Reservations : ID, ID opération, Nom, Prénom, Contact, État, Date de saisie
const RES = { ID: 0, OP: 1, NOM: 2, PRENOM: 3, CONTACT: 4, ETAT: 5, DATE: 6 };
// Articles : ID, ID réservation, Nom de l'article, Quantité commandée, Quantité arrivée
// pour ce client, Quantité remise au client. Arrivé / Remis vides = ligne d'avant le suivi
// des arrivages (une réservation « Retrait » d'avant compte comme entièrement remise).
const ART = { ID: 0, RES: 1, NOM: 2, QTE: 3, ARR: 4, REM: 5 };
// Arrivages : date, ID opération, article, quantité reçue (une ligne par livraison)
const ARV = { DATE: 0, OP: 1, ART: 2, QTE: 3 };

const ETATS_VALIDES = ["Réservé", "Contacté", "Retrait", "Annulé"];
const ETAT_ANNULE = "Annulé";
const ETAT_RETIRE = "Retrait";

// Identifiant de réservation créé par la page (nouvelId_ côté page) : un réessai après une
// réponse perdue renvoie le même identifiant et ne crée pas de double.
const FORMAT_ID_RES = /^RES-\d{10,}-[0-9a-f]{4}$/;

// Fichiers de l'application (contrôle de l'installation : tous présents, même version)
const FICHIERS_SERVEUR = [
  "00_Constantes",
  "Application",
  "Arrivages",
  "Copie",
  "Installation",
  "Operations",
  "Reglages",
  "Reservations",
];
const FICHIERS_PAGE = [
  "Index",
  "Style",
  "Icones",
  "ScriptCommun",
  "ScriptCopie",
  "ScriptImpression",
  "ScriptOffres",
  "ScriptSaisie",
];
