// js/html.js — fabrication de HTML sûre.
// Toute valeur insérée dans le gabarit html`...` est échappée, sauf si elle
// a été marquée avec brut() (réservé à du code produit par l'application,
// comme les icônes SVG). Ainsi, un titre de mission ne peut jamais injecter
// de code dans la page.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' };

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

class Brut {
  constructor(s) { this.s = String(s); }
  toString() { return this.s; }
}

/** Marque du HTML comme sûr (à n'utiliser que pour du code de l'application). */
export const brut = (s) => new Brut(s);

function rendre(v) {
  if (v instanceof Brut) return v.s;
  if (Array.isArray(v)) return v.map(rendre).join('');
  if (v == null || v === false) return '';
  return esc(v);
}

/** Gabarit : html`<b>${titre}</b>` échappe `titre`. */
export function html(chaines, ...valeurs) {
  let out = chaines[0];
  valeurs.forEach((v, i) => { out += rendre(v) + chaines[i + 1]; });
  return new Brut(out);
}

/** Remplace le contenu d'un élément. */
export function remplir(el, contenu) {
  el.innerHTML = rendre(contenu);
}
