// js/donnees/memoire.js — base de données en mémoire (mode démo et tests).
// Fonctions pures : appliquer des écritures et fabriquer l'« état » lu par
// l'interface. Le stockage Firebase (étape 4) fabriquera un état de même forme.

import { HORODATAGE } from '../actions.js';

export const COLLECTIONS = Object.freeze(['members', 'invites', 'tasks', 'validations', 'rewards', 'redemptions', 'events']);

/** Base vide : { famille: null, members: {}, invites: {}, ... } */
export function baseVide() {
  const b = { famille: null };
  COLLECTIONS.forEach((c) => { b[c] = {}; });
  return b;
}

function remplacerHorodatage(donnees, maintenant) {
  const out = {};
  for (const [k, v] of Object.entries(donnees)) out[k] = v === HORODATAGE ? maintenant : v;
  return out;
}

/**
 * Applique une liste d'écritures « tout ou rien » et renvoie une nouvelle
 * base. Comme Firestore : créer un document qui existe déjà, ou modifier /
 * supprimer un document absent, fait échouer tout le lot.
 */
export function appliquer(base, ops, maintenant) {
  const b = { famille: base.famille ? { ...base.famille } : null };
  COLLECTIONS.forEach((c) => { b[c] = { ...base[c] }; });
  for (const { op, col, id, donnees } of ops) {
    if (col === null) {
      if (op === 'creer') { if (b.famille) throw new Error('La famille existe déjà.'); b.famille = remplacerHorodatage(donnees, maintenant); }
      else if (op === 'modifier') { if (!b.famille) throw new Error('Famille introuvable.'); b.famille = { ...b.famille, ...remplacerHorodatage(donnees, maintenant) }; }
      else if (op === 'supprimer') b.famille = null;
      continue;
    }
    if (!COLLECTIONS.includes(col)) throw new Error(`Collection inconnue : ${col}`);
    const existe = Object.prototype.hasOwnProperty.call(b[col], id);
    if (op === 'creer') {
      if (existe) throw new Error(`${col}/${id} existe déjà.`);
      b[col][id] = remplacerHorodatage(donnees, maintenant);
    } else if (op === 'modifier') {
      if (!existe) throw new Error(`${col}/${id} introuvable.`);
      b[col][id] = { ...b[col][id], ...remplacerHorodatage(donnees, maintenant) };
    } else if (op === 'supprimer') {
      delete b[col][id];
    } else {
      throw new Error(`Opération inconnue : ${op}`);
    }
  }
  return b;
}

const liste = (obj) => Object.entries(obj).map(([id, d]) => ({ id, ...d }));
const parDate = (champ) => (a, b) => (b[champ] ?? Infinity) - (a[champ] ?? Infinity);

/** État lu par l'interface, vu par le membre `uid`. */
export function etatDe(base, uid) {
  const membres = liste(base.members);
  return {
    pret: true,
    famille: base.famille,
    moi: membres.find((m) => m.id === uid) || null,
    membres,
    invitations: liste(base.invites),
    missions: liste(base.tasks),
    validations: liste(base.validations),
    recompenses: liste(base.rewards),
    demandes: liste(base.redemptions).sort(parDate('demandeeLe')),
    evenements: liste(base.events).sort(parDate('le')),
  };
}
