// tests/regles/aide.js — outils communs aux tests des règles (émulateur).
//
// Chaque test part d'une famille d'exemple écrite SANS les règles (données
// de départ), puis essaie des écritures AVEC les règles, soit :
//   - en passant par les vraies actions de l'appli (js/actions.js) et le vrai
//     traducteur vers Firestore (js/donnees/lots.js) ;
//   - soit en fabriquant à la main une écriture interdite (tricherie).

import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertFails as refuseOriginal, assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, collection,
  collectionGroup, query, where, serverTimestamp, increment, Timestamp, setLogLevel,
} from 'firebase/firestore';
import { ecrireLots } from '../../js/donnees/lots.js';

export { assertSucceeds };

/**
 * Vérifie qu'une écriture ou une lecture est REFUSÉE.
 * Contre-épreuve (CONTRE_EPREUVE=1, avec des règles qui autorisent tout) :
 * chaque refus doit alors devenir une réussite ; sinon, le refus venait
 * d'autre chose que les règles (test mal écrit) et on l'affiche.
 */
export async function assertFails(promesse, raison = '') {
  if (!process.env.CONTRE_EPREUVE) return refuseOriginal(promesse);
  try {
    await promesse;
  } catch (e) {
    const ligne = (new Error().stack.split('\n').find((l) => l.includes('regles.test.js')) || '').trim();
    console.log(`REFUS SANS LES RÈGLES : ${raison} ${ligne} → ${e.message.split('\n')[0]}`);
  }
  return null;
}
export {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, collection,
  collectionGroup, query, where, serverTimestamp, increment, Timestamp,
};

export const F = 'fam1';
export const JOUR = 24 * 3600 * 1000;

/** Fonctions Firestore passées au traducteur (comme dans le navigateur). */
export const fs = { doc, writeBatch, serverTimestamp, increment };

/** Personnes de test (adresses réservées example.com). */
export const PERSONNES = {
  aid: { email: 'aidant1@example.com', email_verified: true },
  aid2: { email: 'aidant2@example.com', email_verified: true },
  x: { email: 'aide-x@example.com', email_verified: true },
  y: { email: 'aide-y@example.com', email_verified: true },
  n1: { email: 'nouveau@example.com', email_verified: true }, // invité(e) dans la famille
  ext: { email: 'exterieur@example.com', email_verified: true }, // hors famille
  nv: { email: 'nouveau@example.com', email_verified: false }, // adresse non vérifiée
};

let env;

// Les refus attendus sont écrits dans le journal du SDK : on les masque.
setLogLevel('silent');

export async function demarrer() {
  env = await initializeTestEnvironment({
    projectId: 'demo-etoiles',
    // REGLES_TEST permet d'essayer un autre fichier de règles (contre-épreuve).
    firestore: { rules: readFileSync(process.env.REGLES_TEST || new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
  return env;
}

export async function arreter() {
  await env?.cleanup();
}

/** Base Firestore vue par une personne (avec les règles). */
export function db(uid) {
  if (uid === null) return env.unauthenticatedContext().firestore();
  return env.authenticatedContext(uid, PERSONNES[uid]).firestore();
}

const ts = (ms) => Timestamp.fromMillis(ms);

/** Fiche de membre complète. */
export function fiche(uid, prenom, role, x = {}) {
  return {
    uid, prenom, role, objectif: null, fetesVuesJusqua: null, rejointLe: ts(Date.now() - 30 * JOUR),
    gagnees: 0, depensees: 0, derniereValidation: null, derniereDemande: null, ...x,
  };
}

export function mission(pour, x = {}) {
  return {
    titre: 'Ranger', icone: 'chambre', etoiles: 2, etapes: ['A', 'B'], cochees: [false, false],
    statut: 'todo', quotidienne: false, pour, creeePar: 'aid', creeeLe: ts(Date.now() - JOUR),
    valideePar: null, valideeLe: null, derniereValidation: null, ...x,
  };
}

/**
 * Famille d'exemple :
 *   aidants aid et aid2 ; personnes aidées x (10 gagnées, 3 dépensées → 7) et y (0) ;
 *   récompenses r1 (5, active), r2 (2, archivée), r3 (50, active) ;
 *   missions t1 (x, à faire), t2 (x, en attente), t3 (y, à faire),
 *   tq (x, quotidienne validée il y a 2 jours), tq2 (x, quotidienne validée à l'instant) ;
 *   validation v0 (x, 10) ; demande d1 (x, 3, demandée) ; invitation nouveau@example.com (frere).
 */
export async function remplir() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    const p = (...c) => doc(d, 'families', F, ...c);
    const maintenant = Date.now();
    await setDoc(doc(d, 'families', F), { nom: 'Famille test', creeeLe: ts(maintenant - 30 * JOUR), creeePar: 'aid' });
    await setDoc(p('members', 'aid'), fiche('aid', 'Aidant A', 'aidant'));
    await setDoc(p('members', 'aid2'), fiche('aid2', 'Aidant B', 'aidant'));
    await setDoc(p('members', 'x'), fiche('x', 'Aidé X', 'frere', { gagnees: 10, depensees: 3, derniereValidation: 'v0', derniereDemande: 'd1' }));
    await setDoc(p('members', 'y'), fiche('y', 'Aidé Y', 'frere'));
    await setDoc(p('rewards', 'r1'), { titre: 'Glace', icone: 'glace', prix: 5, archivee: false, creeeLe: ts(maintenant) });
    await setDoc(p('rewards', 'r2'), { titre: 'Vieux jeu', icone: 'jeu', prix: 2, archivee: true, creeeLe: ts(maintenant) });
    await setDoc(p('rewards', 'r3'), { titre: 'Cinéma', icone: 'cinema', prix: 50, archivee: false, creeeLe: ts(maintenant) });
    await setDoc(p('tasks', 't1'), mission('x'));
    await setDoc(p('tasks', 't2'), mission('x', { titre: 'Vaisselle', icone: 'vaisselle', etoiles: 3, statut: 'wait', cochees: [true, true] }));
    await setDoc(p('tasks', 't3'), mission('y'));
    await setDoc(p('tasks', 'tq'), mission('x', { titre: 'Dents', icone: 'dents', etoiles: 1, quotidienne: true, statut: 'ok', cochees: [true, true], valideePar: 'aid', valideeLe: ts(maintenant - 2 * JOUR), derniereValidation: 'v0' }));
    await setDoc(p('tasks', 'tq2'), mission('x', { titre: 'Lit', icone: 'lit', etoiles: 1, quotidienne: true, statut: 'ok', cochees: [true, true], valideePar: 'aid', valideeLe: ts(maintenant), derniereValidation: 'v0' }));
    await setDoc(p('validations', 'v0'), { missionId: 'ancienne', pour: 'x', titre: 'Ancienne', icone: 'lit', etoiles: 10, par: 'aid', le: ts(maintenant - 3 * JOUR) });
    await setDoc(p('redemptions', 'd1'), { recompenseId: 'r2', titre: 'Vieux jeu', icone: 'jeu', prix: 3, statut: 'asked', pour: 'x', demandeeLe: ts(maintenant - JOUR), donneePar: null, donneeLe: null });
    await setDoc(p('invites', 'nouveau@example.com'), { email: 'nouveau@example.com', prenom: 'Nouveau', role: 'frere', invitePar: 'aid', creeLe: ts(maintenant) });
    await setDoc(p('events', 'e0'), { type: 'famille_creee', titre: '', etoiles: null, auteurUid: 'aid', auteurNom: 'Aidant A', pourNom: '', le: ts(maintenant - 30 * JOUR) });
  });
}

/** Exécute fn(base) sans les règles (préparation d'un test). */
export function sansRegles(fn) {
  return env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
}

/** Lit un document sans les règles (pour vérifier le résultat). */
export async function lire(...chemin) {
  let data = null;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const s = await getDoc(doc(ctx.firestore(), ...chemin));
    data = s.exists() ? s.data() : null;
  });
  return data;
}

async function lireTout(col) {
  let liste = [];
  await env.withSecurityRulesDisabled(async (ctx) => {
    const s = await getDocs(collection(ctx.firestore(), 'families', F, col));
    liste = s.docs.map((x) => ({ id: x.id, ...x.data() }));
  });
  return liste;
}

/** État de la famille, de la même forme que celui de l'appli (js/donnees/memoire.js). */
export async function etat(uid) {
  const [membres, invitations, missions, validations, recompenses, demandes, evenements] = await Promise.all(
    ['members', 'invites', 'tasks', 'validations', 'rewards', 'redemptions', 'events'].map(lireTout),
  );
  return {
    famille: await lire('families', F),
    moi: membres.find((m) => m.id === uid) || null,
    membres, invitations, missions, validations, recompenses, demandes, evenements,
  };
}

let compteurIds = 0;
const nouvelId = () => `auto${++compteurIds}`;

/** Prépare les écritures d'une action de l'appli, jouée par `uid`. */
export async function ops(uid, action, ...args) {
  const E = await etat(uid);
  return action(E, { moi: E.moi, nouvelId, maintenant: Date.now() }, ...args);
}

/** Envoie des écritures (format js/actions.js) en tant que `uid`. */
export function envoyer(uid, liste, familleId = F) {
  return ecrireLots(fs, db(uid), familleId, liste);
}

/** Joue une action de l'appli en tant que `uid` (règles actives). */
export async function faire(uid, action, ...args) {
  return envoyer(uid, await ops(uid, action, ...args));
}

/** Raccourci : référence d'un document de la famille, vue par `uid`. */
export function ref(uid, ...chemin) {
  return doc(db(uid), 'families', F, ...chemin);
}
