// Contrôle du code (ESLint) : `npm run lint`. Outil de développement, jamais envoyé à Apps Script.
import fs from "node:fs";
import { createRequire } from "node:module";
import js from "@eslint/js";
import globals from "globals";
import html from "eslint-plugin-html";

const require = createRequire(import.meta.url);
const { nomsDeclares, declarationsServeur, declarationsPage } = require("./tests/declarations.js");

// Services Google Apps Script disponibles côté serveur.
const appsScript = Object.fromEntries(
  [
    "CacheService",
    "ContentService",
    "DriveApp",
    "HtmlService",
    "LockService",
    "Logger",
    "PropertiesService",
    "ScriptApp",
    "Session",
    "SpreadsheetApp",
    "Utilities",
  ].map((n) => [n, "readonly"])
);

// Côté serveur, tous les .gs partagent la même portée globale ; côté page, tous les
// <script> des morceaux Script*.html aussi. Pour chaque fichier, on fournit donc à
// ESLint les noms déclarés au premier niveau des AUTRES fichiers du même côté :
// `no-undef` signale toujours les fautes de frappe, et `no-redeclare` signale un nom
// déclaré dans deux fichiers (sans ce contrôle, rien ne le dit et c'est la dernière
// déclaration lue qui l'emporte).
function globalesDesAutres(declarations, fichier) {
  return Object.fromEntries(
    Object.entries(declarations)
      .filter(([f]) => f !== fichier)
      .flatMap(([, noms]) => noms.map((n) => [n, "writable"]))
  );
}
const serveur = declarationsServeur(".");
const page = declarationsPage(".");
// Variables du <script> d'Index.html (données injectées par le serveur), s'il y en a un
const scriptIndex =
  (fs.readFileSync("Index.html", "utf8").match(/<script>([\s\S]*?)<\/script>/) || [])[1] || "";
const globalesIndex = Object.fromEntries(
  nomsDeclares(scriptIndex.replace(/<\?!?=[\s\S]*?\?>/g, "null")).map((n) => [n, "writable"])
);

const regles = {
  ...js.configs.recommended.rules,
  // Les fonctions du premier niveau sont des points d'entrée (menu, robots, google.script.run,
  // boutons de la page).
  "no-unused-vars": ["warn", { vars: "local", args: "none", caughtErrors: "none" }],
  "no-empty": ["error", { allowEmptyCatch: true }],
  // Style voulu : `var x = {}; try { x = JSON.parse(…) } catch (e) { x = {} }` (valeur sûre d'abord).
  "no-useless-assignment": "off",
  "no-useless-escape": "warn",
  // const / let uniquement (refonte, étape 5)
  "no-var": "error",
  "prefer-const": "error",
};

export default [
  { ignores: ["node_modules/**"] },
  ...Object.keys(serveur).map((f) => ({
    files: [f],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "script",
      globals: { ...appsScript, ...globalesDesAutres(serveur, f) },
    },
    rules: regles,
  })),
  {
    // Pages : scripts du navigateur (google.script.run). Index.html contient des
    // injections de modèle (<?!= … ?>) dans son script : contrôlé par tests/test_rendu.js.
    files: ["**/*.html"],
    ignores: ["Index.html"],
    plugins: { html },
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "script",
      globals: { ...globals.browser, google: "readonly", bootstrap: "readonly" },
    },
    rules: regles,
  },
  ...Object.keys(page).map((f) => ({
    files: [f],
    languageOptions: {
      globals: {
        ...globals.browser,
        google: "readonly",
        bootstrap: "readonly",
        ...globalesIndex,
        ...globalesDesAutres(page, f),
      },
    },
  })),
  {
    // Outils de développement (Node)
    files: ["outils/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "commonjs", globals: globals.node },
    rules: regles,
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node, ...globals.browser },
    },
    // Le code passé à page.evaluate() tourne dans la page : ses variables y sont définies.
    rules: { ...regles, "no-unused-vars": "off", "no-undef": "off", "no-regex-spaces": "off" },
  },
];
