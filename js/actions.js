// js/actions.js — ce que fait chaque bouton de l'application.
//
// Chaque action reçoit l'état actuel de la famille et un contexte, vérifie
// qu'elle est permise, puis RENVOIE la liste des écritures à faire (elle
// n'écrit rien elle-même). Le stockage applique ensuite ces écritures en une
// seule fois :
//   - en mode démo : dans la mémoire du navigateur (js/donnees/memoire.js) ;
//   - avec Firebase (étape 4) : dans un lot Firestore (writeBatch), donc tout
//     ou rien.
// Les mêmes actions servent donc aux deux modes, et pourront plus tard
// déclencher des notifications (une Cloud Function qui réagit à l'écriture
// d'un événement, par exemple) sans rien changer ici.
//
// Format d'une écriture :
//   { op: 'creer' | 'modifier' | 'supprimer', col, id, donnees }
//   col : 'members' | 'invites' | 'tasks' | 'validations' | 'rewards'
//         | 'redemptions' | 'events', ou null pour le document de la famille.
//
// Contexte : { moi, nouvelId, maintenant }
//   moi       : membre connecté ({ id, prenom, role, ... })
//   nouvelId  : fonction qui fabrique un identifiant de document
//   maintenant: date actuelle (ms) — utilisée seulement pour les remises à zéro
//
// L'ordre des écritures compte quand un lot est trop gros et doit être
// découpé (Firestore : 500 écritures par lot) : voir retirerMembre et
// supprimerFamille.

import * as L from './logique.js';

/** Marqueur remplacé par la date du serveur au moment de l'écriture. */
export const HORODATAGE = Object.freeze({ horodatage: true });

/**
 * Ajout à un compteur, fait par le serveur (Firestore : increment()). Deux
 * aidants qui valident en même temps ne s'écrasent donc pas l'un l'autre.
 */
export class Increment {
  constructor(n) { this.n = n; Object.freeze(this); }
}
export const incrementer = (n) => new Increment(n);

/** Erreur de saisie : `erreurs` associe un champ du formulaire à un message. */
export class ErreurSaisie extends Error {
  constructor(erreurs) {
    super(Object.values(erreurs)[0] || 'Saisie incorrecte.');
    this.erreurs = erreurs;
  }
}

const creer = (col, id, donnees) => ({ op: 'creer', col, id, donnees });
const modifier = (col, id, donnees) => ({ op: 'modifier', col, id, donnees });
const supprimer = (col, id) => ({ op: 'supprimer', col, id });

function exiger(condition, message) {
  if (!condition) throw new Error(message);
}

function trouver(liste, id, message) {
  const x = (liste || []).find((e) => e.id === id);
  exiger(x, message);
  return x;
}

const estAidant = (ctx) => ctx.moi?.role === 'aidant';
const estAide = (ctx) => ctx.moi?.role === 'frere';
const exigerAidant = (ctx) => exiger(estAidant(ctx), 'Réservé aux aidants.');
const exigerAide = (ctx) => exiger(estAide(ctx), 'Réservé à la personne aidée.');

function evenement(ctx, type, details) {
  return creer('events', ctx.nouvelId(), {
    ...L.preparerEvenement(type, { ...details, auteur: ctx.moi }),
    le: HORODATAGE,
  });
}

const prenomDe = (etat, uid) => etat.membres.find((m) => m.id === uid)?.prenom || '';
const aidesDe = (etat) => etat.membres.filter((m) => m.role === 'frere');

// ---------------------------------------------------------------------------
// Famille et membres
// ---------------------------------------------------------------------------

/** Création de la famille par le premier aidant. `moi` = { id, prenom }. */
export function creerFamille({ nom, moi, nouvelId }) {
  const n = String(nom ?? '').replace(/\s+/g, ' ').trim();
  const p = String(moi?.prenom ?? '').replace(/\s+/g, ' ').trim();
  const erreurs = {};
  if (!n) erreurs.nom = 'Écris un nom de famille.';
  else if (n.length > L.LIMITES.nomFamille) erreurs.nom = `${L.LIMITES.nomFamille} caractères au maximum.`;
  if (!p) erreurs.prenom = 'Écris ton prénom.';
  else if (p.length > L.LIMITES.prenom) erreurs.prenom = `${L.LIMITES.prenom} caractères au maximum.`;
  if (Object.keys(erreurs).length) throw new ErreurSaisie(erreurs);
  const ctx = { moi: { id: moi.id, prenom: p, role: 'aidant' }, nouvelId };
  return [
    creer(null, null, { nom: n, creeeLe: HORODATAGE, creeePar: moi.id }),
    creer('members', moi.id, membre(moi.id, p, 'aidant')),
    evenement(ctx, 'famille_creee', {}),
  ];
}

/** Fiche d'un nouveau membre. Les compteurs ne servent qu'aux personnes aidées. */
function membre(uid, prenom, role) {
  return {
    uid, prenom, role,
    objectif: null, fetesVuesJusqua: null, rejointLe: HORODATAGE,
    gagnees: 0, depensees: 0, derniereValidation: null, derniereDemande: null,
  };
}

/** Un aidant invite quelqu'un (adresse e-mail, prénom, rôle). */
export function inviter(etat, ctx, saisie) {
  exigerAidant(ctx);
  const r = L.preparerInvitation(saisie);
  if (!r.ok) throw new ErreurSaisie(r.erreurs);
  const { email, role, prenom } = r.invitation;
  exiger(!etat.invitations.some((i) => i.id === email), 'Cette adresse est déjà invitée.');
  return [
    creer('invites', email, { email, prenom, role, invitePar: ctx.moi.id, creeLe: HORODATAGE }),
    evenement(ctx, 'membre_invite', { titre: prenom }),
  ];
}

export function annulerInvitation(etat, ctx, email) {
  exigerAidant(ctx);
  trouver(etat.invitations, email, 'Invitation introuvable.');
  return [supprimer('invites', email)];
}

/**
 * Une personne invitée rejoint la famille à sa première connexion.
 * `invitation` = { id: email, prenom, role } ; `uid` = son identifiant.
 * Elle ne choisit ni son rôle ni son prénom : ils viennent de l'invitation.
 */
export function rejoindre(invitation, uid, nouvelId) {
  const ctx = { moi: { id: uid, prenom: invitation.prenom, role: invitation.role }, nouvelId };
  return [
    creer('members', uid, membre(uid, invitation.prenom, invitation.role)),
    supprimer('invites', invitation.id),
    evenement(ctx, 'membre_rejoint', {}),
  ];
}

/**
 * Un aidant retire un membre. Pour une personne aidée, ses missions,
 * validations et demandes sont supprimées avec elle.
 * Un aidant ne peut pas se retirer lui-même : il reste donc toujours au
 * moins un aidant (pour tout arrêter, il supprime la famille).
 * La fiche du membre est supprimée EN PREMIER : les règles n'autorisent la
 * suppression de validations et de demandes que si la personne aidée
 * n'existe plus (personne ne peut ainsi retirer des étoiles).
 */
export function retirerMembre(etat, ctx, uid) {
  exigerAidant(ctx);
  exiger(uid !== ctx.moi.id, 'Tu ne peux pas te retirer toi-même.');
  const m = trouver(etat.membres, uid, 'Membre introuvable.');
  const ops = [
    supprimer('members', uid),
    evenement(ctx, 'membre_retire', { titre: m.prenom }),
  ];
  if (m.role === 'frere') {
    for (const col of [['tasks', etat.missions], ['validations', etat.validations], ['redemptions', etat.demandes]]) {
      col[1].filter((x) => x.pour === uid).forEach((x) => ops.push(supprimer(col[0], x.id)));
    }
  }
  return ops;
}

/**
 * Supprime toutes les données de la famille.
 *   1. la famille est marquée « en suppression » (les règles autorisent alors
 *      à effacer validations, demandes, récompenses et historique) ;
 *   2. tout le reste est supprimé ;
 *   3. le membre qui agit est supprimé en avant-dernier, la famille en dernier.
 */
export function supprimerFamille(etat, ctx) {
  exigerAidant(ctx);
  const ops = [modifier(null, null, { suppression: true })];
  const tout = [['events', etat.evenements], ['redemptions', etat.demandes],
    ['validations', etat.validations], ['tasks', etat.missions],
    ['rewards', etat.recompenses], ['invites', etat.invitations]];
  for (const [col, liste] of tout) liste.forEach((x) => ops.push(supprimer(col, x.id)));
  etat.membres.filter((m) => m.id !== ctx.moi.id).forEach((m) => ops.push(supprimer('members', m.id)));
  ops.push(supprimer('members', ctx.moi.id));
  ops.push(supprimer(null, null));
  return ops;
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

/** Un aidant crée une mission pour une ou plusieurs personnes aidées (une copie chacune). */
export function creerMissions(etat, ctx, saisie, pourUids) {
  exigerAidant(ctx);
  const r = L.preparerMission(saisie);
  const cibles = [...new Set(pourUids || [])].filter((uid) => aidesDe(etat).some((a) => a.id === uid));
  const erreurs = r.ok ? {} : { ...r.erreurs };
  if (!cibles.length) erreurs.pour = 'Choisis pour qui est la mission.';
  if (Object.keys(erreurs).length) throw new ErreurSaisie(erreurs);
  return cibles.flatMap((uid) => [
    creer('tasks', ctx.nouvelId(), {
      ...r.mission,
      pour: uid,
      creeePar: ctx.moi.id,
      creeeLe: HORODATAGE,
      valideePar: null,
      valideeLe: null,
      derniereValidation: null,
    }),
    evenement(ctx, 'mission_creee', { titre: r.mission.titre, pourNom: prenomDe(etat, uid) }),
  ]);
}

/** Un aidant supprime une mission. Les étoiles déjà gagnées sont gardées. */
export function supprimerMission(etat, ctx, id) {
  exigerAidant(ctx);
  const m = trouver(etat.missions, id, 'Mission introuvable.');
  return [
    supprimer('tasks', id),
    evenement(ctx, 'mission_supprimee', { titre: m.titre, pourNom: prenomDe(etat, m.pour) }),
  ];
}

function maMission(etat, ctx, id) {
  exigerAide(ctx);
  const m = trouver(etat.missions, id, 'Mission introuvable.');
  exiger(m.pour === ctx.moi.id, 'Ce n\'est pas ta mission.');
  return m;
}

/** La personne aidée coche ou décoche une étape. */
export function cocherEtape(etat, ctx, id, index) {
  const m = maMission(etat, ctx, id);
  exiger(m.statut === 'todo', 'Cette mission est finie.');
  exiger(Number.isInteger(index) && index >= 0 && index < m.etapes.length, 'Étape introuvable.');
  return [modifier('tasks', id, { cochees: L.basculerEtape(m.cochees, index) })];
}

/** « J'ai fini » : la mission passe en attente de vérification. */
export function terminerMission(etat, ctx, id) {
  const m = maMission(etat, ctx, id);
  exiger(L.transitionMissionAutorisee('frere', m, 'wait', ctx.maintenant), 'Coche d\'abord toutes les étapes.');
  return [
    modifier('tasks', id, { statut: 'wait' }),
    evenement(ctx, 'mission_terminee', { titre: m.titre }),
  ];
}

/**
 * « C'est fait ✓ » : la mission est validée (depuis « en attente », ou
 * directement depuis « à faire »). Une validation est créée et le compteur
 * d'étoiles gagnées de la personne aidée augmente, dans le même lot.
 */
export function validerMission(etat, ctx, id) {
  exigerAidant(ctx);
  const m = trouver(etat.missions, id, 'Mission introuvable.');
  exiger(L.transitionMissionAutorisee('aidant', m, 'ok', ctx.maintenant), 'Cette mission n\'est pas à valider.');
  const vid = ctx.nouvelId();
  return [
    creer('validations', vid, {
      missionId: id, pour: m.pour, titre: m.titre, icone: m.icone,
      etoiles: m.etoiles, par: ctx.moi.id, le: HORODATAGE,
    }),
    modifier('tasks', id, {
      statut: 'ok', valideePar: ctx.moi.id, valideeLe: HORODATAGE, derniereValidation: vid,
    }),
    modifier('members', m.pour, { gagnees: incrementer(m.etoiles), derniereValidation: vid }),
    evenement(ctx, 'mission_validee', { titre: m.titre, etoiles: m.etoiles, pourNom: prenomDe(etat, m.pour) }),
  ];
}

/** « Pas encore » : la mission revient, étapes décochées, aucune étoile retirée. */
export function pasEncore(etat, ctx, id) {
  exigerAidant(ctx);
  const m = trouver(etat.missions, id, 'Mission introuvable.');
  exiger(L.transitionMissionAutorisee('aidant', m, 'todo', ctx.maintenant), 'Cette mission n\'est pas à valider.');
  return [
    modifier('tasks', id, L.pasEncore(m)),
    evenement(ctx, 'mission_pas_encore', { titre: m.titre, pourNom: prenomDe(etat, m.pour) }),
  ];
}

/**
 * Remet « à faire » les missions quotidiennes validées un jour précédent.
 * Appelée à chaque ouverture ; un aidant remet tout à zéro, une personne
 * aidée seulement ses propres missions (c'est ce que permettront les règles).
 */
export function remisesAZero(etat, ctx) {
  const miennes = estAidant(ctx) ? etat.missions : etat.missions.filter((m) => m.pour === ctx.moi?.id);
  return L.remisesAZero(miennes, ctx.maintenant).map(({ id, modif }) => modifier('tasks', id, modif));
}

// ---------------------------------------------------------------------------
// Récompenses
// ---------------------------------------------------------------------------

/** La personne aidée choisit son objectif. */
export function choisirObjectif(etat, ctx, recompenseId) {
  exigerAide(ctx);
  const r = trouver(etat.recompenses, recompenseId, 'Récompense introuvable.');
  exiger(!r.archivee, 'Cette récompense n\'existe plus.');
  return [modifier('members', ctx.moi.id, { objectif: recompenseId })];
}

/**
 * « Je veux X » : la demande fige le prix actuel ; le compteur d'étoiles
 * dépensées augmente dans le même lot (les règles vérifient qu'il reste
 * assez d'étoiles).
 */
export function demanderRecompense(etat, ctx, recompenseId) {
  exigerAide(ctx);
  const r = trouver(etat.recompenses, recompenseId, 'Récompense introuvable.');
  const { demandes, solde } = L.donneesAide(etat, ctx.moi.id);
  exiger(L.peutDemander(r, solde, demandes), 'Pas encore assez d\'étoiles.');
  const did = ctx.nouvelId();
  return [
    creer('redemptions', did, {
      ...L.preparerDemande(r), pour: ctx.moi.id, demandeeLe: HORODATAGE, donneePar: null, donneeLe: null,
    }),
    modifier('members', ctx.moi.id, { depensees: incrementer(r.prix), derniereDemande: did }),
    evenement(ctx, 'recompense_demandee', { titre: r.titre, etoiles: r.prix }),
  ];
}

/** « Récompense donnée ✓ » (le solde ne change pas : il a baissé à la demande). */
export function donnerRecompense(etat, ctx, demandeId) {
  exigerAidant(ctx);
  const d = trouver(etat.demandes, demandeId, 'Demande introuvable.');
  exiger(L.transitionDemandeAutorisee('aidant', d.statut, 'given'), 'Déjà donnée.');
  return [
    modifier('redemptions', demandeId, { statut: 'given', donneePar: ctx.moi.id, donneeLe: HORODATAGE }),
    evenement(ctx, 'recompense_donnee', { titre: d.titre, pourNom: prenomDe(etat, d.pour) }),
  ];
}

export function ajouterRecompense(etat, ctx, saisie) {
  exigerAidant(ctx);
  const r = L.preparerRecompense(saisie);
  if (!r.ok) throw new ErreurSaisie(r.erreurs);
  return [
    creer('rewards', ctx.nouvelId(), { ...r.recompense, creeeLe: HORODATAGE }),
    evenement(ctx, 'recompense_ajoutee', { titre: r.recompense.titre, etoiles: r.recompense.prix }),
  ];
}

/** Modifier le nom, l'image ou le prix. Les demandes déjà faites gardent leur prix. */
export function modifierRecompense(etat, ctx, id, saisie) {
  exigerAidant(ctx);
  trouver(etat.recompenses, id, 'Récompense introuvable.');
  const r = L.preparerRecompense(saisie);
  if (!r.ok) throw new ErreurSaisie(r.erreurs);
  const { titre, icone, prix } = r.recompense;
  return [
    modifier('rewards', id, { titre, icone, prix }),
    evenement(ctx, 'recompense_modifiee', { titre, etoiles: prix }),
  ];
}

/** Archiver (retirer de la liste) ou remettre une récompense. */
export function archiverRecompense(etat, ctx, id, archivee = true) {
  exigerAidant(ctx);
  const r = trouver(etat.recompenses, id, 'Récompense introuvable.');
  exiger(!!r.archivee !== archivee, archivee ? 'Déjà archivée.' : 'Déjà dans la liste.');
  return [
    modifier('rewards', id, { archivee }),
    evenement(ctx, archivee ? 'recompense_archivee' : 'recompense_remise', { titre: r.titre }),
  ];
}

// ---------------------------------------------------------------------------
// Fête « +N étoiles »
// ---------------------------------------------------------------------------

/** Mémorise (dans la fiche de la personne aidée) la dernière validation fêtée. */
export function marquerFeteVue(etat, ctx, vuJusqua) {
  exigerAide(ctx);
  exiger(Number.isInteger(vuJusqua) && vuJusqua >= 0, 'Date incorrecte.');
  return [modifier('members', ctx.moi.id, { fetesVuesJusqua: vuJusqua })];
}
