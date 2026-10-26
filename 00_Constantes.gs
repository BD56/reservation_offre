// Structure du Google Sheets et listes fixes. Lu en premier (ordre alphabétique) :
// une seule portée globale pour tous les .gs (un nom déclaré dans deux fichiers = erreur).

// Même numéro dans tous les fichiers : contrôle de l'installation (outils/version.js).
function version_00_Constantes_() {
  return "2026.10.26-1833";
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

// Assistant d'installation (voir Assistant.gs) : onglet d'accueil du modèle, retiré à la fin.
const FEUILLE_DEMARRER = "Démarrer";
// Nom du Google Sheets donné par l'assistant (« Réservations des offres — l'Hypermarché X »),
// seulement s'il porte encore le nom donné par Google à la copie (jamais le modèle, jamais
// un nom choisi par le manager).
const NOM_APPLICATION = "Réservations des offres";
const NOM_COPIE_GOOGLE = /^(Copie de|Copy of) /;
// Qui peut ouvrir l'application (déploiement « Application Web », appsscript.json :
// access DOMAIN) : les comptes Google de l'entreprise. Nom cité dans les fenêtres.
const ORGANISATION = "Carrefour";
// Autorisations Google vérifiées (consentement case par case : une case peut rester
// décochée, ou sauter lors d'une nouvelle autorisation, par ex. au déploiement). Sans
// Google Sheets, rien ne marche ; sans l'adresse e-mail, le propriétaire n'est plus
// reconnu ; sans les fenêtres, ni assistant ni « Gestion de l'application ». Mêmes
// valeurs que « oauthScopes » dans appsscript.json (test_fichiers).
const AUTORISATIONS_VERIFIEES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/script.container.ui",
];
// Menu du Sheet (cf. Sheet.gs) : chemin cité dans les messages
const MENU_GESTION = "menu 🚀 APPLICATION → ⚙️ Gestion de l'application";
const MESSAGE_AUTORISATION_INCOMPLETE =
  "Autorisation Google incomplète (une case n'a pas été cochée) : " +
  MENU_GESTION +
  ", puis cochez « Tout sélectionner » sur l'écran de Google.";

// Fichiers de l'application (contrôle de l'installation : tous présents, même version)
const FICHIERS_SERVEUR = [
  "00_Constantes",
  "Application",
  "Arrivages",
  "Assistant",
  "Copie",
  "Installation",
  "Operations",
  "Reglages",
  "Reservations",
  "Sheet",
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
  "FenetreAssistant",
  "FenetreGestion",
];
