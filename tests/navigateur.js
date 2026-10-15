// Outils communs : charge Index.html rendu dans Chromium, google.script.run -> faux serveur Node.
const { chromium } = require("playwright");
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
  window.print = function () { window.__imprimeDansLaPage = true; };
  window.__alertes = []; window.alert = function (m) { window.__alertes.push(String(m)); };
  window.confirm = function () { return window.__confirmer !== false; };
})();`;

// opts : preparer(env) (données de départ), sheets (classeur), page (options Playwright)
async function ouvrir(repo, opts = {}) {
  const env = makeEnv(Object.assign({ repo }, opts));
  env.pannes = {}; // { nomFonction: "message" } : la fonction serveur échoue
  env.pannesApres = {}; // { nomFonction: "message" } : elle écrit, mais la réponse se perd
  env.retards = {}; // { nomFonction: ms } : réponse retardée (envoi « en cours »)
  if (opts.preparer) opts.preparer(env); // données de départ (offres, réservations…)
  // Comme doGet : la copie est glissée dans la page (opts.sansCopie : lecture échouée -> null)
  const copieJson = opts.sansCopie ? "null" : env.ctx.jsonPourPage_(env.ctx.copie_());
  const html = rendrePage(repo, { copieJson }).replace(
    "<head>",
    // comme doGet (addMetaTag)
    '<head><meta name="viewport" content="width=device-width, initial-scale=1"><script>' + PROXY + "</script>"
  );
  const browser = await chromium.launch();
  const page = await browser.newPage(opts.page || {});
  const erreursPage = [];
  page.on("pageerror", (e) => erreursPage.push(e.message));
  await page.exposeFunction("__serveur", async (nom, argsJson) => {
    if (env.retards[nom]) await new Promise((ok) => setTimeout(ok, env.retards[nom]));
    try {
      if (typeof env.ctx[nom] !== "function" || /_$/.test(nom))
        throw new Error("fonction inconnue/privée : " + nom);
      if (env.pannes[nom]) throw new Error(env.pannes[nom]);
      const val = J(env.ctx[nom].apply(null, JSON.parse(argsJson)));
      if (env.pannesApres[nom]) throw new Error(env.pannesApres[nom]);
      return JSON.stringify({ val });
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
