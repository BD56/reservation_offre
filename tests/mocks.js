// Faux services Apps Script communs aux tests
const crypto = require("crypto");
const { loadCode, makeProps } = require("./harness");
const { FakeSheet, makeSpreadsheet } = require("./fakesheet");

// Classeur vide avec les en-têtes des trois onglets
function classeurVide() {
  return {
    Operations: new FakeSheet("Operations", [
      ["ID_Operation", "Nom", "Type", "Date_Debut", "Date_Fin", "Mode_Saisie", "Articles_Predefinis"],
    ]),
    Reservations: new FakeSheet("Reservations", [
      ["ID_Reservation", "ID_Operation", "Nom", "Prenom", "Contact", "Etat", "Date_Saisie"],
    ]),
    Articles: new FakeSheet("Articles", [
      ["ID_Article", "ID_Reservation", "Article", "Quantite", "Arrive", "Remis"],
    ]),
    Arrivages: new FakeSheet("Arrivages", [["Date", "ID_Operation", "Article", "Quantite"]]),
  };
}

function makeEnv(opts = {}) {
  const env = {
    sheets: opts.sheets || classeurVide(),
    verrous: 0, // verrous pris et pas encore rendus
    flushs: 0,
    menus: [], // éléments du menu du Google Sheets
    alertes: [], // fenêtres affichées dans le Google Sheets
  };
  env.props = makeProps(opts.props);
  const ss = makeSpreadsheet(env);
  env.ctx = loadCode(opts.repo, {
    LockService: {
      getScriptLock: () => ({
        tryLock() {
          if (opts.verrouOccupe) return false;
          env.verrous++;
          return true;
        },
        waitLock() {
          env.verrous++;
        },
        releaseLock() {
          env.verrous--;
        },
      }),
    },
    Logger: { log() {} },
    PropertiesService: { getDocumentProperties: () => env.props },
    Session: { getScriptTimeZone: () => "Europe/Paris" },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      flush() {
        env.flushs++;
      },
      getUi: () => ({
        createMenu: (titre) => {
          const menu = {
            addItem: (libelle, fonction) => {
              env.menus.push([titre, libelle, fonction]);
              return menu;
            },
            addToUi: () => menu,
          };
          return menu;
        },
        alert: (titre, texte) => env.alertes.push(titre + " | " + texte),
        ButtonSet: { OK: "OK" },
      }),
    },
    // Fichiers .html du dépôt, comme dans le projet Apps Script (fichier absent -> erreur)
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: "ALLOWALL" },
      createHtmlOutputFromFile: (nom) => {
        const chemin = require("path").join(opts.repo, nom + ".html");
        if (!require("fs").existsSync(chemin))
          throw new Error("Aucun fichier HTML nommé " + nom + " n'a été trouvé.");
        const contenu = require("fs").readFileSync(chemin, "utf8");
        return { getContent: () => contenu };
      },
      createHtmlOutput: (html) => ({
        contenu: html,
        titre: "",
        setTitle(t) {
          this.titre = t;
          return this;
        },
      }),
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: require("./fmt").fmt,
    },
  });
  return env;
}

// Contenu d'un onglet sans l'en-tête
function lignes(env, nom) {
  return env.sheets[nom].getDataRange().getValues().slice(1);
}

module.exports = { makeEnv, classeurVide, lignes };
