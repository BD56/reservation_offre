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
    dialogues: [], // fenêtres HTML ouvertes dans le Google Sheets ({ titre, contenu, largeur, hauteur })
    toasts: [],
    owner: opts.owner || "proprio@example.com",
    editors: opts.editors || [],
    activeEmail: opts.activeEmail === undefined ? "proprio@example.com" : opts.activeEmail,
    // Autorisations accordées (défaut : toutes) ; urlService = adresse de l'application
    scopes: opts.scopes || null,
    urlService: opts.urlService || "",
  };
  env.props = makeProps(opts.props);
  env.idClasseur = opts.idClasseur || "CLASSEUR-TEST";
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
    ScriptApp: {
      AuthMode: { FULL: "FULL" },
      AuthorizationStatus: { REQUIRED: "REQUIRED", NOT_REQUIRED: "NOT_REQUIRED" },
      getAuthorizationInfo: (mode, demandees) => {
        const accordees = env.scopes || demandees;
        const manque = demandees.some((d) => !accordees.includes(d));
        return {
          getAuthorizationStatus: () => (manque ? "REQUIRED" : "NOT_REQUIRED"),
          getAuthorizedScopes: () => accordees.slice(),
          getAuthorizationUrl: () => (manque ? "https://accounts.google.com/autoriser" : null),
        };
      },
      requireScopes: () => {
        env.redemandees = (env.redemandees || 0) + 1;
      },
      getScriptId: () => "ID-DU-SCRIPT",
      getService: () => ({ getUrl: () => env.urlService }),
    },
    Session: {
      getScriptTimeZone: () => "Europe/Paris",
      getActiveUser: () => ({ getEmail: () => env.activeEmail }),
    },
    PropertiesService: { getDocumentProperties: () => env.props },
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
        showModalDialog: (sortie, titre) => env.dialogues.push(Object.assign({ titre }, sortie)),
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
      // Modèle de page (fenêtres du Sheet) : variables posées puis evaluate(), comme Apps Script
      createTemplateFromFile: (nom) => {
        const chemin = require("path").join(opts.repo, nom + ".html");
        const modele = {
          evaluate() {
            const contenu = require("./harness").renderTemplate(
              require("fs").readFileSync(chemin, "utf8"),
              // les fonctions du script sont appelables dans le modèle (include_…)
              Object.assign({ include_: (n) => env.ctx.include_(n) }, modele)
            );
            return {
              contenu,
              setWidth(l) {
                this.largeur = l;
                return this;
              },
              setHeight(h) {
                this.hauteur = h;
                return this;
              },
              setTitle(t) {
                this.titre = t;
                return this;
              },
              addMetaTag() {
                return this;
              },
              setXFrameOptionsMode() {
                return this;
              },
            };
          },
        };
        return modele;
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
      base64Decode: (b) => Array.from(Buffer.from(b, "base64")),
      newBlob: (octets, type, nom) => ({ octets, type, nom }),
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
