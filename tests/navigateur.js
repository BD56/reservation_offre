// Outils communs : charge Index.html rendu dans Chromium, google.script.run -> faux serveur Node.
// Bootstrap (chargé depuis un CDN par la vraie page) est servi depuis node_modules.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { rendrePage } = require("./harness");
const { makeEnv } = require("./mocks");
const J = (x) => (x === undefined ? null : JSON.parse(JSON.stringify(x)));

const PROXY = `
(function () {
  function runner(ok, ko) {
    return new Proxy({}, { get: function (_, nom) {
      if (nom === 'withSuccessHandler') return function (h) { return runner(h, ko); };
      if (nom === 'withFailureHandler') return function (h) { return runner(ok, h); };
      return function () {
        var args = Array.prototype.slice.call(arguments);
        window.__appels = window.__appels || []; window.__appels.push(nom);
        window.__serveur(nom, JSON.stringify(args)).then(function (r) {
          var o = JSON.parse(r);
          if (o.err) { if (ko) ko(new Error(o.err)); } else if (ok) ok(o.val);
        });
      };
    }});
  }
  window.google = { script: { run: runner(null, null) } };
  window.print = function () { window.__imprime = document.getElementById('zoneImpression').innerHTML; window.dispatchEvent(new Event('afterprint')); };
  window.__alertes = []; window.alert = function (m) { window.__alertes.push(String(m)); };
  window.confirm = function () { return window.__confirmer !== false; };
})();`;

// opts : preparer(env) (données de départ), sheets (classeur), page (options Playwright)
async function ouvrir(repo, opts = {}) {
  const env = makeEnv(Object.assign({ repo }, opts));
  env.pannes = {}; // { nomFonction: "message" } : la fonction serveur échoue
  if (opts.preparer) opts.preparer(env); // données de départ (offres, réservations…)
  const html = rendrePage(repo, {}).replace(
    "<head>",
    // comme doGet (addMetaTag)
    '<head><meta name="viewport" content="width=device-width, initial-scale=1"><script>' + PROXY + "</script>"
  );
  const browser = await chromium.launch();
  const page = await browser.newPage(opts.page || {});
  const erreursPage = [];
  page.on("pageerror", (e) => erreursPage.push(e.message));
  // https://cdn.jsdelivr.net/npm/<paquet>@<version>/<chemin> -> node_modules/<paquet>/<chemin>
  await page.route(/cdn\.jsdelivr\.net\/npm\//, (route) => {
    const m = /\/npm\/([^@/]+)@[^/]+\/([^?#]+)/.exec(route.request().url());
    const fichier = m && path.join(repo, "node_modules", m[1], m[2]);
    if (fichier && fs.existsSync(fichier)) return route.fulfill({ path: fichier });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.exposeFunction("__serveur", (nom, argsJson) => {
    try {
      if (typeof env.ctx[nom] !== "function" || /_$/.test(nom))
        throw new Error("fonction inconnue/privée : " + nom);
      if (env.pannes[nom]) throw new Error(env.pannes[nom]);
      return JSON.stringify({ val: J(env.ctx[nom].apply(null, JSON.parse(argsJson))) });
    } catch (e) {
      return JSON.stringify({ err: e.message });
    }
  });
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(300);
  return { env, page, browser, erreursPage };
}

// Attend que tous les appels serveur en cours soient revenus (fenêtres Bootstrap : animations)
async function attendre(page, ms = 450) {
  await page.waitForTimeout(ms);
}

module.exports = { ouvrir, attendre, J };
