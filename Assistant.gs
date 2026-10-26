// Assistant d'installation (repris de l'app chèques, sans la sécurité) : un bouton vert dans
// le Google Sheets copié (onglet « Démarrer ») ouvre une fenêtre qui guide le manager en 4
// écrans (préparation, nom du magasin, mise en ligne, PC de l'accueil). Ce que Google impose
// reste manuel (écrans d'autorisation, clics de « Déployer ») : l'assistant le guide et le
// vérifie.

// Même numéro dans tous les fichiers : contrôle de l'installation (outils/version.js).
function version_Assistant_() {
  return "2026.10.26-1833";
}

// Adresse de l'application en ligne (déploiement « Application Web »), compte Google
// ordinaire ou de l'entreprise (…/a/macros/<domaine>/s/…). Jamais l'adresse /dev.
const RE_ADRESSE_APP = /^https:\/\/script\.google\.com\/(a\/macros\/[^/\s]+\/s|macros\/s)\/[\w-]+\/exec$/;

// =================================================================
// --- AUTORISATIONS GOOGLE ---
//     Google présente les autorisations case par case : une case peut rester décochée et
//     le programme tourne quand même, à moitié (vu dans l'app chèques : sans l'adresse
//     e-mail, le propriétaire n'était plus reconnu). On vérifie celles dont tout dépend.
// =================================================================
// Autorisations de AUTORISATIONS_VERIFIEES non accordées (liste vide : tout va bien, ou
// vérification impossible sur cette plateforme).
function autorisationsManquantes_() {
  try {
    const info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL, AUTORISATIONS_VERIFIEES);
    if (info.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.NOT_REQUIRED) return [];
    const accordees = info.getAuthorizedScopes() || [];
    return AUTORISATIONS_VERIFIEES.filter(function (s) {
      return accordees.indexOf(s) === -1;
    });
  } catch (e) {
    return [];
  }
}

// Depuis un menu ou le bouton : Google réaffiche son écran pour les cases manquantes et
// l'exécution s'arrête (il suffit de recliquer ensuite). Sans cet écran : message clair.
function exigerAutorisations_() {
  const manquantes = autorisationsManquantes_();
  if (!manquantes.length) return;
  if (typeof ScriptApp.requireScopes === "function")
    ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, manquantes);
  if (autorisationsManquantes_().length) throw new Error(MESSAGE_AUTORISATION_INCOMPLETE);
}

// Depuis la fenêtre : combien d'autorisations manquent, et le lien de Google qui les
// redemande (une case peut sauter en cours de route, au déploiement). Sans contrôle
// d'accès : il faut répondre justement quand le propriétaire n'est plus reconnu ; rien de
// privé n'en sort.
function etatAutorisations() {
  const manquantes = autorisationsManquantes_();
  let lien = "";
  if (manquantes.length)
    try {
      lien =
        ScriptApp.getAuthorizationInfo(
          ScriptApp.AuthMode.FULL,
          AUTORISATIONS_VERIFIEES
        ).getAuthorizationUrl() || "";
    } catch (e) {
      lien = "";
    }
  return { manquantes: manquantes.length, lien: lien };
}

// Les fenêtres du Sheet et l'assistant sont réservés aux personnes qui ont accès au Google
// Sheets (propriétaire, éditeurs) : un visiteur de l'application ne peut pas les appeler.
function estEditeurDuClasseur_() {
  try {
    const email = Session.getActiveUser().getEmail();
    if (!email) return false;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const proprio = ss.getOwner();
    if (proprio && proprio.getEmail() === email) return true;
    return ss.getEditors().some(function (u) {
      return u.getEmail() === email;
    });
  } catch (e) {
    return false;
  }
}
function exigerEditeur_() {
  if (estEditeurDuClasseur_()) return;
  // Propriétaire non reconnu faute d'autorisation (case « adresse e-mail » décochée) : le dire
  if (autorisationsManquantes_().length) throw new Error(MESSAGE_AUTORISATION_INCOMPLETE);
  throw new Error("Réservé aux personnes ayant accès au Google Sheets.");
}

// =================================================================
// --- OUVERTURE (bouton de l'onglet « Démarrer », fenêtre « Gestion ») ---
// =================================================================
function ouvrirAssistant() {
  exigerAutorisations_();
  exigerEditeur_();
  const page = HtmlService.createTemplateFromFile("FenetreAssistant");
  page.organisation = ORGANISATION;
  SpreadsheetApp.getUi().showModalDialog(
    page.evaluate().setWidth(660).setHeight(720),
    "▶ Installation de l'application"
  );
}

// =================================================================
// --- ÉCRANS DE LA FENÊTRE (google.script.run) ---
// =================================================================
// 1. Préparation : ce que fait « Installer » (onglets, contrôle des fichiers ; une copie
//    repart sans les réglages hérités). Le compte Google utilisé est affiché.
function preparerInstallation() {
  exigerEditeur_();
  const rapport = installer_();
  let compte = "";
  try {
    compte = Session.getActiveUser().getEmail();
  } catch (e) {
    compte = "";
  }
  return {
    incomplet: rapport.indexOf("INSTALLATION INCOMPLÈTE") !== -1,
    rapport: rapport,
    version: version_Installation_(),
    compte: compte,
  };
}

// 2. Votre magasin : nom du magasin (obligatoire, vide tant qu'il n'a jamais été réglé)
//    et titre de l'onglet (prérempli). Mêmes règles que le bouton ⚙️ de l'application.
function lireReglagesAssistant() {
  exigerEditeur_();
  const r = reglages_();
  const regle = !!PropertiesService.getDocumentProperties().getProperty("CFG_NOM_MAGASIN");
  return { NOM_MAGASIN: regle ? r.NOM_MAGASIN : "", TITRE_APP: r.TITRE_APP };
}
function enregistrerReglagesAssistant(r) {
  exigerEditeur_();
  r = r || {};
  if (!String(r.NOM_MAGASIN || "").trim()) throw new Error("Écrivez le nom du magasin.");
  const reglages = enregistrerReglages(r);
  return { reglages: reglages, nomSheet: renommerCopie_(reglages.NOM_MAGASIN) };
}

// La copie s'appelle « Copie de MODÈLE — … (ne pas utiliser) » : renommée d'après le magasin
// (voir NOM_COPIE_GOOGLE). Renvoie le nouveau nom, "" si rien n'est changé ; un refus de
// Google n'arrête pas l'assistant.
function renommerCopie_(nomMagasin) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!NOM_COPIE_GOOGLE.test(ss.getName())) return "";
    const nom = NOM_APPLICATION + " — " + nomMagasin;
    ss.rename(nom);
    return nom;
  } catch (e) {
    return "";
  }
}

// 3. Mise en ligne : le lien ouvre le projet Apps Script (bouton « Déployer ») ; l'adresse
//    /exec est celle que le manager colle (ou qu'un PC a déjà ouverte).
function etatMiseEnLigne() {
  exigerEditeur_();
  return {
    adresse: adresseApplication_(),
    lienEditeur: "https://script.google.com/d/" + ScriptApp.getScriptId() + "/edit",
  };
}
// Adresse collée par le manager (bouton « Copier » de Google à la fin du déploiement).
function enregistrerAdresseApplication(url) {
  exigerEditeur_();
  url = String(url || "").trim();
  if (!RE_ADRESSE_APP.test(url))
    throw new Error(
      "Ce n'est pas l'adresse de l'application : elle commence par https://script.google.com/ et finit par /exec."
    );
  PropertiesService.getDocumentProperties().setProperty("ADRESSE_APP", url);
  return url;
}

// 4. PC de l'accueil (et fenêtre Gestion) : adresse de l'application et magasin réglé.
function etatApplication() {
  exigerEditeur_();
  return { adresse: adresseApplication_(), magasin: reglages_().NOM_MAGASIN };
}

// Fin : l'onglet « Démarrer » et l'onglet vide de Google sont retirés.
function terminerAssistant() {
  exigerEditeur_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const demarrer = ss.getSheetByName(FEUILLE_DEMARRER);
  if (demarrer && ss.getNumSheets() > 1) ss.deleteSheet(demarrer);
  supprimerFeuillesVides_();
  const operations = ss.getSheetByName(FEUILLE_OPERATIONS);
  if (operations) ss.setActiveSheet(operations);
  return true;
}

// =================================================================
// --- ADRESSE DE L'APPLICATION ---
// =================================================================
// Collée par le manager ou notée par doGet (un PC l'a vraiment ouverte). JAMAIS celle que
// donne ScriptApp.getService().getUrl() hors de l'application : sur une copie pas encore
// déployée, elle renvoyait une adresse qui ne menait nulle part (app chèques, 17/10).
function adresseApplication_() {
  const notee = PropertiesService.getDocumentProperties().getProperty("ADRESSE_APP") || "";
  return RE_ADRESSE_APP.test(notee) ? notee : "";
}
// Appelée par doGet avec sa propre adresse.
function noterAdresseApplication_(url) {
  try {
    if (!RE_ADRESSE_APP.test(url)) return;
    const props = PropertiesService.getDocumentProperties();
    if (props.getProperty("ADRESSE_APP") !== url) props.setProperty("ADRESSE_APP", url);
  } catch (e) {}
}

// =================================================================
// --- MODÈLE (pour l'auteur) ---
//     Sur le MODÈLE, après chaque mise à jour : éditeur Apps Script → choisir
//     preparerModele → Exécuter. Contrôle des fichiers, onglets, marque du classeur (ses
//     copies se reconnaissent), onglet « Démarrer » et son bouton. Le modèle reste vierge.
// =================================================================
function preparerModele() {
  exigerEditeur_();
  const problemes = verifierInstallation_();
  if (problemes.length) throw new Error("INSTALLATION INCOMPLÈTE :\n- " + problemes.join("\n- "));
  nettoyerSiCopie_();
  installerFeuilles_();
  PropertiesService.getDocumentProperties().setProperty("SCHEMA", SCHEMA);
  creerOngletDemarrer_();
  supprimerFeuillesVides_();
  const rapport =
    "Modèle prêt (version " + version_Installation_() + ") : onglet « Démarrer » et son bouton.";
  Logger.log(rapport);
  return rapport;
}

// Onglet d'accueil : quelques lignes et une image-bouton reliée à ouvrirAssistant. Le voir
// ne demande aucune autorisation ; c'est le clic qui en demande une.
function creerOngletDemarrer_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ancien = ss.getSheetByName(FEUILLE_DEMARRER);
  if (ancien) ss.deleteSheet(ancien);
  const f = ss.insertSheet(FEUILLE_DEMARRER, 0);
  f.setHiddenGridlines(true);
  f.setColumnWidth(1, 30);
  f.setColumnWidth(2, 640);
  const lignes = [
    [2, "Bienvenue", 20, "bold"],
    [
      3,
      "Cette copie est la vôtre. Pour mettre l'application en service, cliquez sur le bouton vert " +
        "et laissez-vous guider (environ 10 minutes).",
      11,
      "normal",
    ],
    [9, "Au premier clic, Google demande votre autorisation.", 11, "bold"],
    [
      10,
      "Il affiche « Google n'a pas validé cette application » : c'est normal. Cliquez sur « Paramètres " +
        "avancés », puis sur « Accéder… », et cochez « Tout sélectionner ».",
      11,
      "normal",
    ],
    [
      11,
      "Si rien ne s'ouvre ensuite, cliquez une seconde fois sur le bouton vert. Google vous enverra un " +
        "e-mail « Alerte de sécurité » : c'est normal.",
      11,
      "normal",
    ],
    [13, "Le même assistant se trouve dans le " + MENU_GESTION + " → Installation.", 10, "normal"],
  ];
  lignes.forEach(function (l) {
    f.getRange(l[0], 2).setValue(l[1]).setFontSize(l[2]).setFontWeight(l[3]).setWrap(true);
  });
  f.setRowHeights(5, 3, 30); // place du bouton (lignes 5 à 7)
  const image = f.insertImage(
    Utilities.newBlob(Utilities.base64Decode(BOUTON_INSTALLER_PNG), "image/png", "installer.png"),
    2,
    5
  );
  image.setWidth(320).setHeight(64);
  image.setAltTextTitle("Installer l'application");
  image.assignScript("ouvrirAssistant");
  ss.setActiveSheet(f);
  ss.moveActiveSheet(1);
}

// Onglet vide créé d'office par Google (« Feuille 1 », « Sheet1 »…) : retiré.
function supprimerFeuillesVides_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheets().forEach(function (f) {
    if (
      /^(Feuille|Sheet) ?\d+$/.test(f.getName()) &&
      f.getLastRow() === 0 &&
      f.getLastColumn() === 0 &&
      ss.getNumSheets() > 1
    )
      ss.deleteSheet(f);
  });
}

// Image du bouton vert (PNG 640 × 128, affichée en 320 × 64), dessinée par
// outils/bouton-installer.js.
const BOUTON_INSTALLER_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAoAAAACACAYAAACbUtgKAAAQAElEQVR4nOzdB3xT5RoG8DdpC0XZQzaIIiKCggiIKAKKiIuhXsEJihvHhYsTtQ5EUVDZIIioyBBkiQzZewrIFNkbCqXMtrTNud/zQUuanJMmHWnG8/cXaU+Sps1JTp7zjfeLlJwQ0yS6uC31DrshjWxiVDbEVl7EqGDT/0pBISIiIiJfnDHE2C9iO6Cy1QGVrfY4bLIkzohYIDHzEyWbbJJFxT9tXNGe4nhEhbwW6tvG6hItRERERJSbEP4WGDaZaUSkjDvefdkByQKfA2ChmCYl80nK++qOL6rwl0+IiIiIKA8YCep/fRPy2XqfeXdRrC/39DoAloppUtCQ5G42sXcRdusSERERBQTVVXxa/dNHChi9j7215LQ39/EqAJaIaVjdJhETVYtfdSEiIiKigKOC4OZkkQdOxizemdltMw2AJWJuu0vdaIIKf4WFiIiIiALZMTEcbWI/WrLY043snq4sGXM7xvnNYPgjIiIiCgolDZttjmrAe8rTjSIs763DnwyyZRISiYiIiChwqIa7CHVpc1mTykfOzd+72vw2Jop9fHujCIcxT905SoiIiIgo6BhiJNsMo5lZd7BbAER9v4gUxxp1VSkhIiIioiBmxKZG2uvGdV+4z3lrhu7d4jENCqvwN4Xhj4iIiCgU2ErZU4zJ0qdhAeet9ozfRHVRN6wtRERERBQSVHdvnZKnIt5y2XZBqZh6ZQwjeqvNJkWEiIiIiEKGIRKfIhFV4mPmx+P79BZAh+R/m+GPiIiIKPSoFr+iUZLyttP3F1r/RKJ3qS+jhYiIiIhCkJFgRNmuPvbeokO6BdCQ6NbC8EdEREQUwmwFJFla4SsdAFUzYGshIiIiopCWlvlsKP1il6hYm9jyCRERERGFLEOM88ckrlCkXfLdq9Igwx8RERFRiEODX3Ep3kx1ARvVhYiIiIjCggp/t0SqJHilEBEREVFYQPazq77gK4WIiIiIwgKyX6T6t4wQERERUbgoYxfDxgBIREREFC5U9ovk8m9ERERE4QPZL1KIiIiIKKwwABIRERGFGQZAIiIiojDDAEhEREQUZhgAiYiIiMIMAyARERFRmGEAJCIiIgozDIBEREREYYYBkIiIiCjMMAASERERhRkGQCIiIqIwwwBIREREFGYYAImIiIjCDAMgERERUZhhACQiIiIKMwyARERERGGGAZCIiIgozDAAEhEREYUZBkAiIiKiMMMASERERBRmGACJiIiIwgwDIBEREVGYYQD0szGPfylvTesje+IPCRERmatcrKy8ftuTUqV4edl8ZIf0mv+9nEw8I3TJM/XaSPNqDSUpJVnGrZ8hf2xdJETespWKud0Q8pujHy6UpNTzMnjZOPlm0U9y9nyChIKrSlRw25bqSJU9Jxh0/aF8kSskf2Q+t+07j+932xZu+6rEZUWkSIFCbtuPn41noPAjX/bDzRWul1GPfSHFChRO37Yzbr88OOJVOXrmuJBIv9bvyqM33pNh2yezB0u/Jb8IkTcYAP0MATD967Nx8unsITJm3XQJZggUyzu7H3R2nzgo9fu2E8p90zsNlrrla7htv6X/Y24h0Pk1mGbfycNS95v/SCj6uEVnefEW97/t7T++lu9XTXTb3rrmnTL0oQ/dtneb1ltGrp4slDW+7Ief238ud1e71e22A5aOlo/+HCThrk7562RmpyFu2xNTzku1L+7V/xJlxi6UZ664vLj0bfWOTH92sNQofbUQUd47mXDafDtbC/3GrKUQrihYQkikuGpNNROtegFKXl5MiLzBMYABoG6FGjL3heHy019TpcecoRJv8QFEgWHV62OlctGybtsr9rhLknjmHfTiEy0CIN+XfrN630ZpULGW2/Ylu9dKqBnU9n15qFZzt+3P/vq+TN28wPQ+f+3fLGeTE+TyqAIZtu84vk/2nzwiRN5gC2CAsNvs8nTdVrLi1dHS4eZWEmGPECLyv4TkRNPtVsGQct6X80fIrG1L079PdqTIj2umyC9rpwmJnEg4Jf+b+pXEJZxM37brxAH579ReQuQttgAGGAx67nVfV3muwcPyv9+/kmV71gsR+U9icpLpdqtgSDnvnHqunxj9tpQuVEKql6oi6w5uZRe8iwkb/pRJm+ZK3fLX6edr4+HtQuQLBsAAdU3JyjK5Qz+Zsnm+vD+znxw6FStElPuOnYs33W4VDCn3HDl9XF/IHGbvr1Td5URZwS7gAPdgjSayrPMo+W/jp6RAVH4hotx1JumcnE9NdttuFQyJiIIRWwCDwGVR0fJO007yVN0HJWbWQJmsmv2D2QyT8gXTtixIr1+Fv/fV2x6Xe669TcoUKikF8xeQgyeP6rIyq/dvkoFLx/hUP7FK8QrSttad0rjKzbp8QrRTvTz8HAwsx3ij3zbO1h/+Zn5s91n6DMTSFjMRp3TsJ4ZTUaUOY9+Tw6ePiZXqV1SR/9x4jzSrWl9qXHFpFrjDcMiGw//K/B2r9L4OpK6dqIhIaVPzTml0ZR09cx37p8RlRfVYpP3xR3RX3cKdq70qSHtL5RslpvnLbttHrp4ko9dNl8vzFZDnb3lEnQQ11cWA8br499geaTTgScltp9XroITTTEsEQqvXhpmc3LfftnpbrlXdoK4eGPGKJKem6OfllUbt5eEb7pYqxcpLqpGqXnfH9XM165+l8uvfMzPtPvXHY/gC+71tzbvctg9cOlr3imQGr63m1zSUm9T7vXyR0uq9W1y9Nw3ZG39IT5LAZAm85xfv+kt8hW7pdje2lKZq39arWFOi7Jc+RnGMwr6d+c9imbtjpX5MM+806yR3XFVPf12pWFmL2zwnr9z6WPr3/ZaMUsfJSyWczI6jqJH41Jh3JTM2m01aXd9MvY9rS80y10hZ9T4upZ6jc+cTJfZsnC4dhWPt5E3zZFfc/kx/ntX+eujHN9KP1Zjs2LXx01Kt1JX6WHouOUF2xx2Uf2J367GdK/b+LeRfDIBBpHzhK+S7h2Ok482t9fjA7cf3SjDCQdnVpiMXPghvKFtNfmrfUx2QSmW4HiEOl6ZX19fFTxGuMvvwrKAO/DF3v6JbUa0gZKDeGC6oU4aajB/OGuA2mxcHSfw8T+qUy/h3RZsUZoYHatyhWnSflpqlq5pejwlBN5a9Vl9ev+0Jmb9zlXz852D19/4reQm/94cqsFUymQGNkka4YN9idQLUFew173sZu36G5c8rVqCQ6Wth5rYlUiS6oArU/eW6K66SvJDs0gJ42svwlxv7FsHM7HnCzyqnjgkTnvpari5RMX17hC1CHytwaaJCxptNn5HeC0bKkOXj8vQxfFFRvdfMfh+EFE8QvD9S73kcJ8zg9YQLwiFqEi7fu16eH/+RxxO1NDjh+aD5Syq41dV/v5kri5XTk/hwQRj8ZPYg05m8V6ljmdnf56xqiUoZvnct72J2f29mALe4tpG8f9eLUq1kZbfr8L7DBY+NY+L/7uigq1N8Nuc79R44a/kzrfZXvogoOSsJ8sV9XfTnljMcH4uXL6Lv1672PfLdivHSfUY/If9hF3AQulWdtS18eaR8ogJLUYt6WcEm0h6hD7Bjn+jtFv5cIYCMe7KPHidppWrJSjpAeAp/rtDKgfDyw6M99Blybni2flsV4j+yDAhm8AE77dmB0rL6bZJXOtZrrX9vs/BnpmKRMnqlgpi7X5as6Kvum1fhD5JcAmCySZewK3/v2yLRhWRih28zBDMzRdXtcKzoesfTEoiPkVPuu66xTHtmoGX4M3NLpRtl1nND5cZy13q8XYNKtWRSh77STP1sq/DnCmFw+COfSLcmHSVQvHfn8zJSHd+qeTh2OkOAe7ZeW/nj2UH6BNxXUer+ZuHPlU3993yDR+Szlq8L+Q8DYJBCYHpBncGmlY3JrcDiLyh78+k9r2bodvOkpOp2HNDmPcvr0aWVWYudlTurNtAfZjntPze20Ac4tKr4qkBkfunf+j0dbP2tXe2W8sW9XbL0e7/csJ28prrzzVj0julWpRYmq0Do+4h/uLZ2JGUSAPNi3/a89w3dHeutbnd01F2jgfYYOQEnxcMe+UgK5b9cfIVhDKPaf25ZZPp6dWL6y2O9dMjNCjwnbWvdJXkN4Rytzll5jV6rum3HPvGVFMx/mU/3QxdzZuHPWaf6D+kgT/7BLuAgl1Y2BjUEu/7+pfx1YIsEIyxjltbKgJpfB04elcSUJD32K3+EeVdq7XLV9YfNcpdSORg7WK9CTbfbo1QClpJauXeDHquGx2tZ/XbdclMwX8YDGw5EY9bNSO+aw79Hz8Tpr9FSada9u/bglgyhxnk5popFy+gzYZzpukL305TN82ST6tLGer511HPR6vqmukXSGT7c/nv7U/LKxE/FXzBmEr+3mXk7VuoxVPtUt1Mp1T2F9VsxPtDVu82e0+Oi/j60LcN2q3MWjHW14q/TnDMuAdBj91ce7dsHrrtD/5viSJWJG+dI3Ll4fSJ1v9qOUOMKH/w9W74hTQd73yLlj8fILgzjwIpKVi1zq/Zv1IWTC6uuTbQq47jhCuGvhzoBfW58jNt1A9p2Nw2WKMT8u+reXX/oH128H8NX8Po3GyP8VtNn5bcNs9O/x7rGacdqjAHECa0rDPE5lXjpdXfs7AnJKrRwdm3cwfQ6jEvdGrtL1h/8R0qrfYouWbOwixbNHve8Jq9P/ly8hb87DcYJYyz3FYVK6OEiVjqowOg81pFyDwNgiLi+TFW9Huyvf8+SmFkD1MEiuGYspoW/P/9dJp0n9tCFTgEflDgA31fd/KwQY3ncA2Aj09t+tWCE9F8yOv17HIBxQTj57elvMnyAn09Nkdur3JQeAJ0HVlutBIKF6q1WArm9Sl3TM++pWxbIixM+0gPt0/ywerL6sPhTn3G73gddhWjttRpcntPeVN1XaKFy9fHsQRmeS8AYHuy/gW26Z9iOv+HVRo+Zfrh6ggH7n84ZqoLjP7Ir7oDujqqTybipnIJ96a283LcYQP/c+A9l69Fd6duwvjhaIx+rc5/b7dGapbtKffiA9cdjZAeGJ5gNTcAJ2FvTeusJRc7QWvvNg2/rXhRn99e4Q59w4rWW5tqLExZc4TlpN+p/+kQ1zXh17O23eJTMe2mEW8BBK6rzyWrPucP0BaxWAuk59zvLlUB8hckXkSaLC+A95jqeGgH/g7telJcaPup2e/3cLfopw3PkCcY6ooA6xqxP2TQvfTu66Qc/9IFuwHDVoNIN+ndAiRvKXewCDiEIMP+5oYXuFsabFx+YwQSzzh7/5a308Adotes4trtlQWycdbsqpM70zWBmmxnMAh6xapJeaeCtP/pIy+EvSpWeLWTQsrGSUzDLrXKP5rplpPOkHjJ0xa8yZ/sK6TLliwwBIc2CnavTJ8Y4Q0slPqT8AQPqm6nucFeYpOEa/tLgQ3D8hllu2+9TLUZmB3sraE1tPPBpmaRanbDfEIoQrpcHYGH0vNq3CDhPjH4rQzADvGfeUI+NCQ5mlZfKOwAAEABJREFU2te+VwLpMbLraYsuxo//HOQW/mDc+pmm7220IGKCmTMEvRpfPii1+rSRTr9+IN8u/llm/LNY3pn+TYbwlyZWtdJNtZilXCOPxrRiaEELk5NiQ/3XdeqXbpPpELwwEW7pnnVu98FzhEUKfPHSb59kCH+A3gOcVJhB7wpmV1PuYwtgCEJ3BWbCdazXRp0B99FvtmDwmTrjtYKzzoYmY4sqqe43V1ZdJU/d3Eq3UJl9KL/9x9fiD5uO7NAXfAhlJtXhMN2OCRZWYTYnoXvcrFtzxKqJHu/3gwrTD9e6O8M2tD6gbIZzN5gVdDd2mdJLh4xg4u99ixnre04csrx+8LJxepKDK19aUf3xGNmBoGDWGn/odKwMWznB8n79l/yig0z+yCjdmoXLlqM7TUMPoBg1ys94U4LGYbFvzbrM/eGBGk1M38cIqjgZsdJ9Rl+Z+8L3btvvvOYWkenfijcW7Vojc/5dbnrdwp1r9AmE2eunquoRCsSTvVDDAEgBAeP+PC17t+HwNtPthU3GqmxTZ+1mMINv+au/yKp9G2XLkZ16TBpaHT2N7/I3lGC4VwWvR1RXi9lYJcjKIO6sqF+xlts2tBqs2rfJ4/2wMsGppDNSOH/Gllh8WHsTAFFbDkEq1OT0vsXYQk/QCokWPNfxqhiviRmd3tR388djZIfVjN/5O1Z7vB96GVr98Ko+VvhSU9QKuixR8xG19R6ymPCRVxP1ULPTDPadJ2gZRBexa/c6urNdu8qtuI77dYWfYRYAi3s5GZCyhwEwBCHQfLXgBxm+8jfTFQ0CESZYeBrzgTGNZh80ZtBtiJVTzAYao4UFF7nYw4BAgxYXjAVEVzAKuB4/d1JyGwZUN77qZqlWqrL+oEStNbQQFL+ssOnZel7A7+gKv9uOt6dLVujn3Qs743K/dTM3+Wvfrs1kwhe6zHfG7ctQiDpNxaKlvQpn/niM7ChvMdN/sxcnEGuzMGEOvSvNqzXUk0mwb9EDgX2LGn1mY+wCAWbVm/Hm78fJmNn4yutLV/UqAJp1kzvzpv4i5R4GwBCCMBOsk0C8GfhueFkEBAEOBUUHte2eac0ufCBjAgouj9xwt2qJ7Kq7tT6fN8y0qzi7apapqospN76qbsAEPSuYXZmTvO0CS8mF590f/Llv0U3uTcsVui7Nwlmpy4tnel9/PEZ2FbIoS3Iq8bTkpJKXF9XFk9vUvMurk9BAYvUcxZ07ldld0ysfuCpbuJR4I7Njtr8ms5E5BsAQgTITwVwGJqehFXB//GHpdX9XnwrzYlknzFjFDOAWw17I0QPUK7e210tAeTM5B0ttYfWJrNYeywkROdyi4WsNsWDi731r97I70aoHwJt1xf3xGNnlj1a3JlfXk/5t3vNYusQZJoKUclm1Iy/ZLZ4jb3av1QlAKL+XwwkDYJDDWBaUCxi5ZgrPplxgfF+zwc/osgI4iN9aubbbWsBWMEYLyyB9OX+E5IQ7VJfgh81fMr0OdbiwhBNmWqKmGGoUYjzkl/d1NS0P4S+nEs+4fZDhwz6zSSBWjp0LrlZpb+XFvsVYQeyb2ExqwxWxmBGPunWB8BjZFW/R0nd5vpwJKChMP7Dt+6Z1+uDo2Tg9jhBj3VBHD5NIUIcU+zdQnFT7wez3xxhdtN56YtULcMIPw2Qo9zEABil0zwxfOUF6LxzplwNtMMMi42kLjSP8Nbm6vu6mQ+Hi60pfZVlo+vE69+VYAOzW5BnT7Sv2bZDXJvXM9bFSWWH24YoWrkGqi/zgqaNCF+TVvr2h3LWWMyzTVLVY8iv2bJwEymNkxwmLbszKxbxbsjAznVVvgFl4QqjvMrWXriEa6JzLajmrWrKiHuPnyZUWq8DEZqMoNQUOBsAgtHT3Ol1YE5XiyTeYSII6XrgAujKwzBnG/7nC4H3UrrM6gHoLrQj1TepaoUWo7cjXLccaZmVZq5yEgfRYocXVzRWvlymbGAAhL/ctVunwFM5QrsMsvODkEa1VgfIY2WE15MVq5quzZZ1HSUJKkm7BQwkYzHpdo3oNnE+ozepgolsUM4j3xR82/bmF8/h96wqtkzjZdYUC5tO3Lra8H9aZv6mCezkfDGHAhDkKfiwEHUQOqFYXrKbQeuRrDH8eYCWC9rVb6vV8xz/1tazvMkHetGilOZN0Tl6b3NNy5m+Fot7NXAWr8UhWkx/QKmkVEFAyIrMF6nNbWqupK4yR9CQqIlLeuP1JXfKkdKESEsryct+2VV3IZjO102BpOTNY3SbRYsWavHiM7Ji7fYXpGMSaZa7Rwz6sPHh9Uz3xC+OD29a8S95r9ryMfqyX9HngzQy3MytHsu3YbsvwB3VNwlZW2G05M77Rqg4shiB4OhHBWvNmvSPrD25jr1OIYAAMAiiI23PeMLm1/+MyedNcIWsVipSWeS+OkG9bvaMPYI3VWW7ZQqWkU4OH5BqLriqUnzEbEI3xW7tNSh1YzVK1qu2WYlHepoKHsihYtL10wbwNT2gdMBu3d2PZa+WD5i9Z1jV7787n9fq/PzzaQzZ0mSh/d/lNB3Grmm3BLC/3LYYzjHrsC71cmTO0amOZrfoWqynMzqRL19+PkR0oefX7FvPl0no/0E3KF3EvgYJAi2XszKB3xRmOAa7QM2D12sdyb1ZLUVo5b3E8cX3Os2rWtqWyJ969mDd6N/q1ftf0b0HrICY2mRm97g+h0MAu4ACHyvPvz+wnh07FCmUOY3NQNLpWmYxLxGHGJdb7/X7VRBm3fkZ6fSpMEOnWpKMUL+B+pr9y3wbTItFY1Pxqqei2fYj6QOy/dLTsOXFQ1ycbtuLCSgRoLUBQcG0hxNqvWKJp5j9L0rfhjBzL+L3SyPzg60/424csH6dbR1x1Vh8Ot6lutlFrp8mCHatkt/6br9AfGp3qP5Thtml10rr9/pWEmrzetzipmfPCcJmwYbbqlvtLf//ETQ/ormkzKLiOJQ8D7TGyY8jyX6VNzTvdSu+g7uTkDv1kgHpPot5cEXUMwNKR7evcK5dHuU9uwLjWn/+a6rItVp9AOkN4R0kYLDWXBiEKy99h7WxfC7WfSDDvfXjttsflsnzRunA9whpa8jKrq2cGkwOxOo/ZRCW00o95/Eu9es255AT9HNZSzxHex2aT5bDCys9//S4UGhgAAxQG52Kc3zIuh+OzbxePkmEPf+S2HQfud5p20hes8YlQUsJDxfmhy8ebbt90eIfUq+De8oFF4z++u3P695M3ztWDpdGCi9mBaI10hoPtT+16ysYj21V3YbL6XYrq1oVAKijbVz2XrWo01V1qrtDiadXq6Qrr5Xq7gHwwyct9i8klKEaMiTkY8oBLZlDj0pfiu/54jOxCQWOc2D1br63bdShijDG+mUFLX1d1vHXttp63faXpOFicAGGJteNn4/Us6HLq5KdAZNbK3liNlcRz/nLDdiINLz7mpB5eLTNoZuCyMTokm62djpZ5b1rnUdPvzWl9PBbsp+DCLuAAgwkHb07rLY0HdWD4yyIsPI5F2z1B94qn8Id1RK26lkat/d20a8iV84LmA5aMtrwdxiHVKXed/rBKCwgYaI2WCzPeFsTOCWg9ePG3j3W5i6xCOZ4PZvaXUJVX+/ad6d/I2WTvlzHD8eTTOUPEF/54jJzw0ayB+nWWVb3mjzCd7PLdivGWS0ViDeKbyl+nxxI6h7/Mjj2upm9dJEfPHM/0dmbhzVt4HyNAevM4VnAy6NyiTcGPATBAIFCMXDNZGvRrLz+snsyzrGzqMWeo9Jg71HKMlpWTiWck5s+B8q6Hxc5xxv6h+sDJLATWcjpgo/vG264T/Fz8/tuP7zO93t8riGyL3SN3D31eVu3f6NP9EHQQpB/+8b+6pSxU5dW+3au6nzuO7e5VQJuzfbk8+nNXn2uF+uMxcgJa7jAzd8x635YpTEo9L18uGCF9Fo40vR4n5G//8bV4a+a2Jer4PUl8gd/9hQkf62OPJ1h+LjtQi7Ll8Jdk7UHfFgvAe7ebapTA65ZCCwNgAFizf7M0G/KsdPu9N2dX5aBvF/2sntdn9PJ4mR1cMdnhm0U/Sf2+7WTg0jGSGYyN66A+GFE+wgxacjBuxxnqhr066TPZdcK6K3TNgc3SblQ36e+hVSkvYHzUfcNfltcn99RjLD2FX7SYTNo0R5oOfkYH6VAOf2nyat+iDh3COQb6m0FX7Puq9bX9qDezPCvXH4+REzDrGnUXH1RBEGVKMBbRCoIfwuJtA57MtNYnjh/3f/+yLNy1xvI2+04elu4z+8mTo9+RrMDv23L4i/pkwqoVuLBFwW1fYMxqi+9ekNenfC6bj+7w2OKMOqBj18+QRgOekJGqUYJCj61UzO1cPsKPjn648NLXqlvt09lDZMw6385ayXcYpI2ummtKVpLKxcrp8X/44MKEDYxN26FaZLLaclGleHmpprqU05bOcqifs/bAVsvuFpRJaXV9M6lR+mqJUt2CqCuGweZrD26VDYe2STDAhAbUWsOsa5R6wYBxtLYu3/u3ngEari3YubFvZ3QaorsaXd2qPpi3H7tUDgqTbW69srZuKcJrG/XfMIEgUB7D3/CabFi5tlQqVlb/3jhpwfsc7/ctR3ZkKaxirFyDSrX0ChmYvYvnAM+PVamVrED9PYw7zBd5aVnBncf363HLOQ3DYDARrvzF9zFer5hwiDHoaJig0MYA6GcIgDj7xEBptDh5s9g6EYUvb8NZoD8GEQUWzgL2MxQufWtaH9O6TERERET+wADoZxgDRERERJSXGACJiIiIwgwDIBEREVGYYQAkIiIiCjMMgERERERhhgGQiCiAYWWaYgUKuW1HvbZgegwiCiysA0hEREQUZtgCSERERBRmGACJiIiIwgwDIBEREVGYYQAkIiIiCjMMgERERERhhgGQiIiIKMwwABIRERGFGQZAIiIiojDDAEhEREQUZhgAiYiIiMKM3TC4EhwRERFRuED2s4uDAZCIiIgobDgQAFMZAImIiIjChsp+doMtgERERERhA9kvkl3ARERERGEEAdBIdggRERERhQcjOVV1ASelnhYiIiIiCguOxNTTKAMTa5xPFSIiIiIKbRczX6zdZpNYR1KKEBEREVFocySmCLKf3RA5aqhvWBCaiIiIKHQh6xmq0Q/ZD13AR8ShNp5LFiIiIiIKTTrrOXQQPGK3RdiWYqPjbLKwJiARERFR6EHGQ9YDZD97fGTcRNUgmIz2wLQriIiIiCh0OM6eF2Q9ZL5426kJdvlmd7zNZluGK9E0iNowRERERBQakO2Mcxcm/OrM12/7Kbu+wmabnHaj1PhEdgUTERERhQAj1aGzXfr3FzOfDoBJRtKvRto0YIcKgScShYiIiIiCmw5/Fxd9Q9ZLSj09Fl/rAJgwcOM+m93WO/3WKSotnkwSIiIiIgpOqSdV+Eu51KuLrJcweNsBfG1P23giX1wPdZNjad+jNmDqKYZAIiIiomCDhjwj8dK8DkOM4159vpMAAAJ7SURBVCdS4j9N+z49AF6YDOL4xvnORoIKgXEJHBNIREREFASQ2XR2S8y4ypvNZnwtQ3eeTPve7nzliZR1vQy7sTLDD0p2XPhBKQ4hIiIiosCErJZ6PEFntwzbbcZqZDznbRkCoAyV5PjkxNZiMw5m2J5q6B+Yevo8WwOJiIiIAohu9VMZDVlN3HPaofio5PuR8Zw32t1+ytAth1Js8rDqK05xe4BzyZJ67JwuJsi1g4mIiIjyDrIYMhmymemSvoYkpuZLaSPfbjzielWE2Q88v+rw/ugG5c/aDGlh+oDnHXp84IXWQHWJsKGwoBARERFR7kHoM86nikPlMMcp1SCXZL2AhxHleO5k3/XTzK6LsLpT4qpDy6IblDutHqmZinfut0P2U33MmGFiYB1h9Dc7HLrgoFzMhWITBkMiIiIiH+me1lRDl+ZD4NOhT+UtHfowuzf5Yt4yuy+W+LXbu8T3XzvE6udnms4Kvly3aaTh+E2FwKJCRERERAFLZcJY1Uf7yJlBaxd4up1XzXP5X65RtYCRf7IKgTWEiIiIiAKQsSUxMvXuhH5/78/slhHihdRVsXGJVQ4Piy5YRoVKuUkFwWghIiIiojynunxPSoTti/jYtY+njDhywpv7+D5A75XqJYrIZZ/ZHEZHFQSjhIiIiIj8z5BEw24bGm87+7EM2Hrcl7tmeYZGdOcbqkQbEY/bDFtzwzAaqDCYX4iIiIgo16jWviSbzbZS/ftnoi3xx8QBW/ZIFuTMFN0OV0YXKlyyRUSq0VgMRyWbYS+rfrGy6oeXUddeJkRERETki3OGyGHVwHbIsDkOic2+NzXCtvD0qWMz5YfdiZJN/wcAAP//lFED1gAAAAZJREFUAwAeYEYFmDqc7gAAAABJRU5ErkJggg==";
