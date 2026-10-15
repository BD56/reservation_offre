# Tests hors ligne

Simulation de Google Apps Script / Google Sheets (`harness.js`, `mocks.js`,
`fakesheet.js`) + Chromium piloté par Playwright (`navigateur.js`) avec un faux
`google.script.run` branché sur le vrai code serveur. Repris de
`BD56/Gestion-cheque-differe`.

- **Lancer** : `npm test` depuis la racine (fuseau fixé à Europe/Paris).
- La fausse feuille **imite la conversion automatique de Google Sheets** (paramètres
  France) : « 0612… » et « +33… » deviennent des nombres, « 2026-12-01 » et
  « 01/12/2026 10:00 » des dates, une apostrophe initiale force le texte.
- `env.pannesApres.nomFonction` : la fonction écrit puis la réponse se perd ;
  `env.retards.nomFonction = ms` : réponse retardée (envoi « en cours »).
- `donnees.js` : jeu de données commun aux tests de la page.
- `env.pannes.nomFonction = "message"` fait échouer une fonction serveur (tests d'erreur).
- Limites : ce sont des **simulations** ; le comportement réel de Google est à vérifier
  sur une copie du Sheet.
