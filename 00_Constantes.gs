// Structure du Google Sheets et listes fixes. Lu en premier (ordre alphabétique) :
// une seule portée globale pour tous les .gs (un nom déclaré dans deux fichiers = erreur).

// Même numéro dans tous les fichiers : contrôle de l'installation (outils/version.js).
function version_00_Constantes_() {
  return "2026.10.14-1959";
}

// Onglets du classeur
const FEUILLE_OPERATIONS = "Operations";
const FEUILLE_RESERVATIONS = "Reservations";
const FEUILLE_ARTICLES = "Articles";

// Colonnes (index des tableaux de getValues : A = 0)
// Operations : ID, Nom, Type, Date début, Date fin, Mode de saisie, Articles prédéfinis
const OP = { ID: 0, NOM: 1, TYPE: 2, DEBUT: 3, FIN: 4, MODE: 5, ARTICLES: 6 };
// Reservations : ID, ID opération, Nom, Prénom, Contact, État, Date de saisie
const RES = { ID: 0, OP: 1, NOM: 2, PRENOM: 3, CONTACT: 4, ETAT: 5, DATE: 6 };
// Articles : ID, ID réservation, Nom de l'article, Quantité
const ART = { ID: 0, RES: 1, NOM: 2, QTE: 3 };

const ETATS_VALIDES = ["Réservé", "Contacté", "Retrait", "Annulé"];
const ETAT_ANNULE = "Annulé";

// Fichiers de l'application (contrôle de l'installation : tous présents, même version)
const FICHIERS_SERVEUR = ["00_Constantes", "Application", "Installation", "Operations", "Reservations"];
const FICHIERS_PAGE = ["Index", "Style", "ScriptCommun", "ScriptImpression", "ScriptOffres", "ScriptSaisie"];
