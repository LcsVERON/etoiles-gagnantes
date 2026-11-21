// js/icones.js — bibliothèque d'icônes SVG (dessins simples, 64 × 64).
// Les clés doivent correspondre à ICONES_MISSION et ICONES_RECOMPENSE
// (js/logique.js) : un test le vérifie.

const DESSINS = {
  // ---- missions ----
  chambre: '<rect x="6" y="26" width="52" height="22" rx="4" fill="#5b7fd6"/><rect x="10" y="16" width="20" height="14" rx="4" fill="#e8eefc" stroke="#9aa8c4" stroke-width="1.5"/><rect x="6" y="46" width="6" height="10" fill="#3c5aa8"/><rect x="52" y="46" width="6" height="10" fill="#3c5aa8"/>',
  lit: '<rect x="6" y="30" width="52" height="14" rx="3" fill="#9b6bd6"/><rect x="8" y="22" width="16" height="10" rx="3" fill="#ece2fa" stroke="#b79be0" stroke-width="1.5"/><rect x="6" y="42" width="5" height="10" fill="#6e45a8"/><rect x="53" y="42" width="5" height="10" fill="#6e45a8"/>',
  poubelle: '<rect x="16" y="18" width="32" height="38" rx="4" fill="#3f9a5c"/><rect x="12" y="12" width="40" height="7" rx="3" fill="#2d7445"/><rect x="27" y="7" width="10" height="6" rx="2" fill="#2d7445"/><path d="M25 26v22M32 26v22M39 26v22" stroke="#cfe9d8" stroke-width="3"/>',
  vaisselle: '<circle cx="28" cy="34" r="20" fill="#e8eefc" stroke="#9aa8c4" stroke-width="3"/><circle cx="28" cy="34" r="11" fill="none" stroke="#9aa8c4" stroke-width="2"/><rect x="51" y="12" width="4" height="44" rx="2" fill="#9aa8c4"/>',
  table: '<circle cx="32" cy="34" r="16" fill="#e8eefc" stroke="#9aa8c4" stroke-width="3"/><path d="M10 14v40M6 14v10c0 4 8 4 8 0V14" stroke="#7d8aa6" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M55 14c-5 4-5 16 0 20v20" stroke="#7d8aa6" stroke-width="3" stroke-linecap="round" fill="none"/>',
  linge: '<rect x="12" y="8" width="40" height="48" rx="5" fill="#e8eefc" stroke="#9aa8c4" stroke-width="3"/><circle cx="32" cy="35" r="13" fill="#5bb5e0" stroke="#9aa8c4" stroke-width="3"/><circle cx="20" cy="15" r="2.5" fill="#7d8aa6"/><circle cx="28" cy="15" r="2.5" fill="#7d8aa6"/>',
  aspirateur: '<path d="M44 8v40" stroke="#33363b" stroke-width="4" stroke-linecap="round"/><rect x="38" y="20" width="12" height="20" rx="5" fill="#d23b3b"/><rect x="30" y="48" width="26" height="8" rx="3" fill="#33363b"/><path d="M8 56h16" stroke="#c9b26a" stroke-width="3" stroke-dasharray="2 4" stroke-linecap="round"/>',
  cuisine: '<rect x="12" y="30" width="40" height="22" rx="5" fill="#e2603d"/><rect x="8" y="26" width="48" height="6" rx="3" fill="#c24a2a"/><rect x="28" y="20" width="8" height="6" rx="2" fill="#c24a2a"/><path d="M22 16c-3-3 3-5 0-9M32 16c-3-3 3-5 0-9M42 16c-3-3 3-5 0-9" stroke="#9aa8c4" stroke-width="3" fill="none" stroke-linecap="round"/>',
  courses: '<path d="M8 14h8l6 28h26l6-20H19" fill="none" stroke="#1d3f9e" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/><circle cx="26" cy="51" r="4" fill="#1d3f9e"/><circle cx="46" cy="51" r="4" fill="#1d3f9e"/>',
  plante: '<path d="M20 38h24l-4 18H24z" fill="#c2683a"/><path d="M32 38V18M32 26c-8 0-12-6-12-12 8 0 12 6 12 12zM32 22c6 0 10-5 10-10-7 0-10 5-10 10z" fill="#3f9a5c" stroke="#3f9a5c" stroke-width="2"/>',
  marche: '<path d="M14 40c6-2 10-10 12-18 6 4 14 6 22 6 4 0 6 4 6 8v6c0 3-2 4-5 4H14c-4 0-5-5 0-6z" fill="#e2603d"/><rect x="10" y="46" width="46" height="6" rx="3" fill="#33363b"/>',
  sport: '<rect x="22" y="29" width="20" height="6" rx="2" fill="#7d8aa6"/><rect x="10" y="18" width="8" height="28" rx="3" fill="#1d3f9e"/><rect x="18" y="22" width="5" height="20" rx="2" fill="#3c5aa8"/><rect x="46" y="18" width="8" height="28" rx="3" fill="#1d3f9e"/><rect x="41" y="22" width="5" height="20" rx="2" fill="#3c5aa8"/><rect x="4" y="27" width="6" height="10" rx="2" fill="#7d8aa6"/><rect x="54" y="27" width="6" height="10" rx="2" fill="#7d8aa6"/>',
  douche: '<path d="M14 56V14c0-4 3-6 7-6h11c4 0 6 3 6 6v4" stroke="#7d8aa6" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M28 24h20l-3-6H31z" fill="#7d8aa6"/><path d="M31 30v4M38 30v6M45 30v4M34 40v4M42 40v4M38 47v4" stroke="#3a9bd0" stroke-width="3" stroke-linecap="round"/>',
  dents: '<path d="M18 12c6-4 10 0 14 0s8-4 14 0c6 5 4 16 0 22-2 4-2 18-6 18-3 0-4-12-8-12s-5 12-8 12c-4 0-4-14-6-18-4-6-6-17 0-22z" fill="#fff" stroke="#7d8aa6" stroke-width="3" stroke-linejoin="round"/>',
  telephone: '<rect x="18" y="6" width="28" height="52" rx="6" fill="#33363b"/><rect x="22" y="12" width="20" height="36" rx="2" fill="#5bb5e0"/><circle cx="32" cy="53" r="2.5" fill="#e8eefc"/>',
  animal: '<ellipse cx="32" cy="42" rx="13" ry="11" fill="#7a4a24"/><circle cx="16" cy="28" r="6" fill="#7a4a24"/><circle cx="26" cy="18" r="6" fill="#7a4a24"/><circle cx="38" cy="18" r="6" fill="#7a4a24"/><circle cx="48" cy="28" r="6" fill="#7a4a24"/>',
  // ---- récompenses ----
  burger: '<path d="M10 30c0-12 10-18 22-18s22 6 22 18z" fill="#e0a040"/><rect x="8" y="32" width="48" height="6" rx="3" fill="#4caf50"/><rect x="8" y="38" width="48" height="7" rx="3" fill="#7a3e1d"/><path d="M10 47h44c0 5-4 8-10 8H20c-6 0-10-3-10-8z" fill="#e0a040"/>',
  pizza: '<path d="M32 58L8 14c14-8 34-8 48 0z" fill="#f5c96a"/><path d="M8 14c14-8 34-8 48 0l-3 6c-12-6-30-6-42 0z" fill="#c2683a"/><circle cx="26" cy="28" r="4" fill="#d23b3b"/><circle cx="38" cy="30" r="4" fill="#d23b3b"/><circle cx="32" cy="42" r="3.5" fill="#d23b3b"/>',
  glace: '<path d="M20 30h24L32 60z" fill="#e0a040"/><circle cx="25" cy="25" r="9" fill="#f48fb1"/><circle cx="39" cy="25" r="9" fill="#81c784"/><circle cx="32" cy="15" r="9" fill="#fff3c4" stroke="#e0c97a" stroke-width="1.5"/>',
  cinema: '<rect x="8" y="18" width="48" height="30" rx="4" fill="#d23b3b"/><circle cx="20" cy="33" r="5" fill="#fff"/><path d="M32 26l14 7-14 7z" fill="#fff"/>',
  sortie: '<path d="M32 8l16 26H16z" fill="#2f8a4f"/><path d="M32 20l18 28H14z" fill="#3fa862"/><rect x="29" y="46" width="6" height="10" fill="#7a4a24"/>',
  jeu: '<rect x="6" y="22" width="52" height="24" rx="12" fill="#33363b"/><path d="M18 29v10M13 34h10" stroke="#fff" stroke-width="3"/><circle cx="42" cy="31" r="3" fill="#f5b301"/><circle cx="48" cy="37" r="3" fill="#e2603d"/>',
  musique: '<path d="M24 46V14l26-6v32" stroke="#1d3f9e" stroke-width="4" fill="none" stroke-linejoin="round"/><ellipse cx="18" cy="47" rx="8" ry="6" fill="#1d3f9e"/><ellipse cx="44" cy="41" rx="8" ry="6" fill="#1d3f9e"/>',
  livre: '<path d="M32 16c-8-5-16-6-24-4v38c8-2 16-1 24 4z" fill="#5b7fd6"/><path d="M32 16c8-5 16-6 24-4v38c-8-2-16-1-24 4z" fill="#3c5aa8"/><path d="M32 16v38" stroke="#e8eefc" stroke-width="2"/>',
  piscine: '<path d="M38 8v30M50 8v30M38 16h12M38 26h12" stroke="#7d8aa6" stroke-width="3" stroke-linecap="round"/><path d="M4 42c5-4 9-4 14 0s9 4 14 0 9-4 14 0 9 4 14 0M4 52c5-4 9-4 14 0s9 4 14 0 9-4 14 0 9 4 14 0" stroke="#3a9bd0" stroke-width="4" fill="none" stroke-linecap="round"/>',
  bowling: '<path d="M44 6c4 0 5 4 4 8-1 3-3 5-1 9 3 6 5 12 4 20-1 7-3 13-7 13s-6-6-7-13c-1-8 1-14 4-20 2-4 0-6-1-9-1-4 0-8 4-8z" fill="#fff" stroke="#7d8aa6" stroke-width="2"/><path d="M38 18h12" stroke="#d23b3b" stroke-width="3"/><circle cx="20" cy="42" r="14" fill="#1d3f9e"/><circle cx="16" cy="36" r="2" fill="#e8eefc"/><circle cx="22" cy="34" r="2" fill="#e8eefc"/><circle cx="20" cy="40" r="2" fill="#e8eefc"/>',
  cadeau: '<rect x="10" y="26" width="44" height="28" rx="3" fill="#e2603d"/><rect x="8" y="20" width="48" height="9" rx="3" fill="#f07b57"/><rect x="29" y="20" width="6" height="34" fill="#f5b301"/><path d="M32 20c-4-8-14-8-12-2 1 3 8 2 12 2zM32 20c4-8 14-8 12-2-1 3-8 2-12 2z" fill="#f5b301"/>',
  ecran: '<rect x="6" y="12" width="52" height="34" rx="4" fill="#33363b"/><rect x="10" y="16" width="44" height="26" rx="2" fill="#5b7fd6"/><path d="M24 54h16M32 46v8" stroke="#33363b" stroke-width="4" stroke-linecap="round"/>',
};

/** Nom lu par les lecteurs d'écran et affiché au survol. */
export const LIBELLES = Object.freeze({
  chambre: 'Chambre', lit: 'Lit', poubelle: 'Poubelle', vaisselle: 'Vaisselle',
  table: 'Mettre la table', linge: 'Linge', aspirateur: 'Aspirateur', cuisine: 'Cuisine',
  courses: 'Courses', plante: 'Plante', marche: 'Marche', sport: 'Sport', douche: 'Douche',
  dents: 'Dents', telephone: 'Téléphone', animal: 'Animal',
  burger: 'Burger', pizza: 'Pizza', glace: 'Glace', cinema: 'Cinéma', sortie: 'Sortie',
  jeu: 'Jeu vidéo', musique: 'Musique', livre: 'Livre', piscine: 'Piscine',
  bowling: 'Bowling', cadeau: 'Cadeau', ecran: 'Écran',
});

export const CLES_ICONES = Object.freeze(Object.keys(DESSINS));

/** Code SVG de l'icône (décorative : le texte à côté porte l'information). */
export function icone(cle) {
  return `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">${DESSINS[cle] || DESSINS.cadeau}</svg>`;
}

const CHEMIN_ETOILE = 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z';

/** Étoile pleine. */
export const ETOILE = `<svg class="etoile" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${CHEMIN_ETOILE}" fill="#f5b301" stroke="#c98d00" stroke-width="1"/></svg>`;
/** Étoile vide (encore à gagner). */
export const ETOILE_VIDE = `<svg class="etoile" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${CHEMIN_ETOILE}" fill="none" stroke="#c9b26a" stroke-width="1.6"/></svg>`;
/** Grande étoile pour la fête. */
export const ETOILE_FETE = `<svg class="etoile-fete" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${CHEMIN_ETOILE}" fill="#f5b301" stroke="#c98d00" stroke-width="1"/></svg>`;
