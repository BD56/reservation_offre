// Fausse feuille Google Sheets (sous-ensemble utilisé par le code serveur)
function fmtDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function colIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
// Imite l'interprétation de Google Sheets (paramètres régionaux France) à l'écriture d'un
// texte (format « Automatique ») : "'xxx" -> texte xxx (apostrophe invisible) ;
// "0612…" / "+33…" -> nombre (0 perdu) ; "=..." -> formule ; "2026-12-01" et
// "01/12/2026 10:00" -> date.
function interpreter(v) {
  if (typeof v !== "string") return v;
  if (v.charAt(0) === "'") return v.slice(1);
  const t = v.trim();
  if (/^[+-]?\d+([.,]\d+)?$/.test(t)) return Number(t.replace(",", "."));
  if (v.charAt(0) === "=") return { formule: v };
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return new Date(+m[1], m[2] - 1, +m[3]);
  m = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?$/.exec(t);
  if (m) return new Date(+m[3], m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
  return v;
}
class FakeSheet {
  constructor(name, rows) {
    this.name = name;
    this.cells = [];
    this.bg = [];
    this.hidden = false;
    (rows || []).forEach((r) => this.appendRow(r));
  }
  getName() {
    return this.name;
  }
  _get(r, c) {
    return this.cells[r - 1] && this.cells[r - 1][c - 1] !== undefined ? this.cells[r - 1][c - 1] : "";
  }
  _set(r, c, v) {
    while (this.cells.length < r) this.cells.push([]);
    this.cells[r - 1][c - 1] = v;
  }
  getLastRow() {
    for (let r = this.cells.length; r >= 1; r--)
      if ((this.cells[r - 1] || []).some((v) => v !== "" && v !== undefined && v !== null)) return r;
    return 0;
  }
  getLastColumn() {
    return Math.max(0, ...this.cells.map((r) => r.length));
  }
  getRange(a, b, c, d) {
    if (typeof a === "string" && a.includes(":")) return new FakeRange(this, 2, 1, 1, 1); // plage ouverte (formats)
    if (typeof a === "string") {
      const m = a.match(/^([A-Z]+)(\d+)$/);
      return this.getRange(+m[2], colIndex(m[1]), 1, 1);
    }
    return new FakeRange(this, a, b, c || 1, d || 1);
  }
  getDataRange() {
    const lr = Math.max(1, this.getLastRow());
    return this.getRange(1, 1, lr, Math.max(1, this.getLastColumn()));
  }
  appendRow(vals) {
    const r = this.getLastRow() + 1;
    vals.forEach((v, i) => this._set(r, i + 1, interpreter(v)));
    return this;
  }
  deleteRow(r) {
    this.cells.splice(r - 1, 1);
    this.bg.splice(r - 1, 1);
  }
  hideSheet() {
    this.hidden = true;
  }
  setFrozenRows() {}
  clearContents() {
    this.cells = [];
  }
}
class FakeRange {
  constructor(sh, r, c, nr, nc) {
    Object.assign(this, { sh, r, c, nr, nc });
  }
  _each(f) {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) f(this.r + i, this.c + j, i, j);
  }
  getValue() {
    return this.sh._get(this.r, this.c);
  }
  getRow() {
    return this.r;
  }
  getColumn() {
    return this.c;
  }
  getNumRows() {
    return this.nr;
  }
  getNumColumns() {
    return this.nc;
  }
  getLastRow() {
    return this.r + this.nr - 1;
  }
  getLastColumn() {
    return this.c + this.nc - 1;
  }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push(this.sh._get(this.r + i, this.c + j));
      out.push(row);
    }
    return out;
  }
  getDisplayValues() {
    return this.getValues().map((r) => r.map((v) => (v instanceof Date ? fmtDate(v) : String(v))));
  }
  setValue(v) {
    this.sh._set(this.r, this.c, interpreter(v));
    return this;
  }
  setValues(vs) {
    this._each((r, c, i, j) => this.sh._set(r, c, interpreter(vs[i][j])));
    return this;
  }
  clearContent() {
    this._each((r, c) => this.sh._set(r, c, ""));
    return this;
  }
  setFontWeight() {
    return this;
  }
  setNumberFormat() {
    return this;
  }
  isBlank() {
    return this.getValues().every((r) => r.every((v) => v === "" || v === null || v === undefined));
  }
  setBackground(col) {
    this._each((r, c) => {
      this.sh.bg[r - 1] = this.sh.bg[r - 1] || [];
      this.sh.bg[r - 1][c - 1] = col;
    });
    return this;
  }
  setBackgrounds(m) {
    this._each((r, c, i, j) => {
      this.sh.bg[r - 1] = this.sh.bg[r - 1] || [];
      this.sh.bg[r - 1][c - 1] = m[i][j];
    });
    return this;
  }
  getBackgrounds() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push((this.sh.bg[this.r + i - 1] || [])[this.c + j - 1] || null);
      out.push(row);
    }
    return out;
  }
  copyTo(dest) {
    const vs = this.getValues();
    vs.forEach((row, i) => row.forEach((v, j) => dest.sh._set(dest.r + i, dest.c + j, v)));
  }
}
function makeSpreadsheet(env) {
  return {
    getSheetByName: (n) => env.sheets[n] || null,
    getSheets: () => Object.values(env.sheets),
    insertSheet: (name) => {
      const s = new FakeSheet(name);
      env.sheets[name] = s;
      return s;
    },
    getNumSheets: () => Object.keys(env.sheets).length,
    deleteSheet: (s) => {
      delete env.sheets[s.getName()];
    },
    getSpreadsheetTimeZone: () => "Europe/Paris",
    getOwner: () => ({ getEmail: () => env.owner }),
    getEditors: () => env.editors.map((e) => ({ getEmail: () => e })),
    getUrl: () => "https://docs.google.com/spreadsheets/d/FAUX/edit",
    getId: () => env.idClasseur,
    toast: (m) => {
      env.toasts.push(m);
    },
  };
}
module.exports = { FakeSheet, FakeRange, makeSpreadsheet, fmtDate, interpreter };
