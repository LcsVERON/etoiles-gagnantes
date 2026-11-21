// js/donnees/lots.js — traduit les écritures de js/actions.js en lots Firestore.
//
// Les fonctions Firestore sont passées en paramètre (`fs`) au lieu d'être
// importées : le même code sert dans le navigateur (SDK chargé à l'étape 4)
// et dans les tests des règles (paquet npm « firebase »).
//   fs = { doc, writeBatch, serverTimestamp, increment }

import { HORODATAGE, Increment } from '../actions.js';

/** Nombre maximal d'écritures par lot (Firestore : 500 ; on garde une marge). */
export const TAILLE_LOT = 450;

/** Remplace les marqueurs de js/actions.js par leurs équivalents Firestore. */
export function versFirestore(fs, donnees) {
  const out = {};
  for (const [k, v] of Object.entries(donnees)) {
    if (v === HORODATAGE) out[k] = fs.serverTimestamp();
    else if (v instanceof Increment) out[k] = fs.increment(v.n);
    else out[k] = v;
  }
  return out;
}

/** Référence du document visé par une écriture (col null = la famille). */
export function reference(fs, db, familleId, { col, id }) {
  return col === null
    ? fs.doc(db, 'families', familleId)
    : fs.doc(db, 'families', familleId, col, id);
}

/** Découpe les écritures en lots, dans l'ordre (voir retirerMembre, supprimerFamille). */
export function decouper(ops, taille = TAILLE_LOT) {
  const lots = [];
  for (let i = 0; i < ops.length; i += taille) lots.push(ops.slice(i, i + taille));
  return lots;
}

/** Prépare un lot Firestore (sans l'envoyer). */
export function preparerLot(fs, db, familleId, ops) {
  const lot = fs.writeBatch(db);
  for (const op of ops) {
    const ref = reference(fs, db, familleId, op);
    if (op.op === 'creer') lot.set(ref, versFirestore(fs, op.donnees));
    else if (op.op === 'modifier') lot.update(ref, versFirestore(fs, op.donnees));
    else if (op.op === 'supprimer') lot.delete(ref);
    else throw new Error(`Opération inconnue : ${op.op}`);
  }
  return lot;
}

/**
 * Envoie les écritures, lot après lot, dans l'ordre. Chaque lot est « tout ou
 * rien ». Renvoie la promesse du dernier envoi.
 */
export async function ecrireLots(fs, db, familleId, ops, taille = TAILLE_LOT) {
  for (const morceau of decouper(ops, taille)) {
    await preparerLot(fs, db, familleId, morceau).commit();
  }
}
