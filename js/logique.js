// js/logique.js — règles de calcul de l'application.
//
// Ce fichier ne contient QUE des fonctions pures : pas de Firebase, pas de DOM,
// pas de localStorage, pas d'horloge cachée (la date du jour est toujours
// passée en paramètre). Il est utilisé tel quel par le navigateur et par les
// tests (node --test).
//
// Vocabulaire des données (identique dans Firestore et dans le mode démo) :
//   mission     : { id, titre, icone, etoiles, etapes: [texte], cochees: [booléen],
//                   statut: 'todo'|'wait'|'ok', quotidienne, valideeLe, ... }
//   validation  : { id, missionId, titre, icone, etoiles, le }
//                 → une ligne par mission validée. C'est la seule source des
//                   étoiles gagnées (voir calculerSolde).
//   recompense  : { id, titre, icone, prix, archivee }
//   demande     : { id, recompenseId, titre, icone, prix, statut: 'asked'|'given' }
//   evenement   : { type, titre, etoiles, auteurUid, auteurNom } (+ date ajoutée
//                 par la couche de stockage)

// ---------------------------------------------------------------------------
// Constantes partagées (les mêmes limites seront reprises dans firestore.rules)
// ---------------------------------------------------------------------------

export const LIMITES = Object.freeze({
  titreMission: 60,
  nbEtapes: 12,
  etape: 80,
  etoilesMin: 1,
  etoilesMax: 5,
  titreRecompense: 40,
  prixMin: 1,
  prixMax: 99,
  prenom: 30,
  email: 254,
});

export const STATUTS_MISSION = Object.freeze(['todo', 'wait', 'ok']);
export const STATUTS_DEMANDE = Object.freeze(['asked', 'given']);
export const ROLES = Object.freeze(['aidant', 'frere']);

// Clés des icônes autorisées. Les dessins SVG correspondants sont dans
// js/icones.js (étape 2) ; firestore.rules reprendra cette liste.
export const ICONES_MISSION = Object.freeze([
  'chambre', 'lit', 'poubelle', 'vaisselle', 'table', 'linge', 'aspirateur',
  'cuisine', 'courses', 'plante', 'marche', 'sport', 'douche', 'dents',
  'telephone', 'animal',
]);
export const ICONES_RECOMPENSE = Object.freeze([
  'burger', 'pizza', 'glace', 'cinema', 'sortie', 'jeu', 'musique', 'livre',
  'piscine', 'bowling', 'cadeau', 'ecran',
]);

// ---------------------------------------------------------------------------
// Outils de date
// ---------------------------------------------------------------------------

/**
 * Convertit une date en millisecondes. Accepte un nombre, une Date, ou un
 * objet qui possède toMillis() (Timestamp Firestore). Renvoie null sinon
 * (par exemple une date serveur pas encore connue).
 */
export function enMillis(d) {
  if (d == null) return null;
  if (typeof d === 'number') return Number.isFinite(d) ? d : null;
  if (d instanceof Date) {
    const t = d.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof d.toMillis === 'function') return d.toMillis();
  return null;
}

const deux = (n) => String(n).padStart(2, '0');

/** Jour local au format 'AAAA-MM-JJ' (comparable comme une chaîne). */
export function jourLocal(d) {
  const t = enMillis(d);
  if (t == null) return null;
  const x = new Date(t);
  return `${x.getFullYear()}-${deux(x.getMonth() + 1)}-${deux(x.getDate())}`;
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « Aujourd'hui », « Hier » ou « Le 3 novembre ». */
export function libelleJour(d, maintenant) {
  const t = enMillis(d);
  if (t == null) return 'À l\'instant';
  const jour = jourLocal(t);
  if (jour === jourLocal(maintenant)) return 'Aujourd\'hui';
  const hier = new Date(enMillis(maintenant));
  hier.setDate(hier.getDate() - 1);
  if (jour === jourLocal(hier)) return 'Hier';
  const x = new Date(t);
  return `Le ${x.getDate()} ${MOIS[x.getMonth()]}`;
}

// ---------------------------------------------------------------------------
// Étoiles
// ---------------------------------------------------------------------------

const entierPositif = (n) => (Number.isInteger(n) && n > 0 ? n : 0);

/**
 * Solde d'étoiles = étoiles des missions validées − prix des récompenses
 * demandées ou données. Le solde n'est jamais stocké : on le recalcule.
 *
 * Les étoiles gagnées viennent des « validations » (une par mission validée)
 * et non du statut actuel des missions : ainsi, remettre à zéro une mission
 * quotidienne, la supprimer ou la modifier ne retire jamais d'étoiles.
 */
export function calculerSolde({ validations = [], demandes = [] } = {}) {
  const gagnees = validations.reduce((s, v) => s + entierPositif(v.etoiles), 0);
  const depensees = demandes
    .filter((d) => d.statut === 'asked' || d.statut === 'given')
    .reduce((s, d) => s + entierPositif(d.prix), 0);
  return gagnees - depensees;
}

/** Nombre d'étoiles qu'il manque pour obtenir une récompense (jamais négatif). */
export function etoilesManquantes(solde, prix) {
  return Math.max(0, entierPositif(prix) - Math.max(0, solde));
}

/** Texte de la jauge : « Encore 3 étoiles », « Encore 1 étoile » ou « Tu peux l'avoir ! ». */
export function texteEncore(solde, prix) {
  const n = etoilesManquantes(solde, prix);
  if (n === 0) return 'Tu peux l\'avoir !';
  return `Encore ${n} ${pluriel(n, 'étoile')}`;
}

export function pluriel(n, mot) {
  return Math.abs(n) > 1 ? `${mot}s` : mot;
}

// ---------------------------------------------------------------------------
// Missions : étapes et statut
// ---------------------------------------------------------------------------

/** Coche ou décoche l'étape `index`. Renvoie un nouveau tableau. */
export function basculerEtape(cochees, index) {
  if (!Number.isInteger(index) || index < 0 || index >= cochees.length) {
    return cochees.slice();
  }
  return cochees.map((c, k) => (k === index ? !c : c));
}

/** Vrai si toutes les étapes sont cochées (une mission sans étape est prête). */
export function toutesCochees(mission) {
  const { etapes = [], cochees = [] } = mission;
  return cochees.length === etapes.length && cochees.every((c) => c === true);
}

/** « J'ai fini » n'est actif que si la mission est à faire et tout est coché. */
export function peutTerminer(mission) {
  return mission.statut === 'todo' && toutesCochees(mission);
}

/**
 * Une mission quotidienne validée un jour précédent doit revenir « à faire ».
 * `maintenant` est une date (Date, nombre ou Timestamp).
 */
export function estARefaire(mission, maintenant) {
  if (!mission.quotidienne || mission.statut !== 'ok') return false;
  const jourValidation = jourLocal(mission.valideeLe);
  if (jourValidation == null) return false; // date serveur pas encore connue
  return jourValidation < jourLocal(maintenant);
}

/** Modification à appliquer pour remettre une mission à zéro. */
export function remiseAZero(mission) {
  return { statut: 'todo', cochees: (mission.etapes || []).map(() => false) };
}

/** Liste des remises à zéro à faire : [{ id, modif }]. */
export function remisesAZero(missions, maintenant) {
  return missions
    .filter((m) => estARefaire(m, maintenant))
    .map((m) => ({ id: m.id, modif: remiseAZero(m) }));
}

/**
 * Transitions de statut d'une mission, par rôle.
 *   frère  : todo → wait (« J'ai fini », seulement si tout est coché)
 *            ok   → todo (remise à zéro d'une mission quotidienne d'un jour passé)
 *   aidant : wait → ok   (« C'est fait ✓ »)
 *            wait → todo (« Pas encore » : étapes décochées, aucune étoile retirée)
 *            ok   → todo (remise à zéro d'une mission quotidienne d'un jour passé)
 * Toute autre transition est refusée.
 */
export function transitionMissionAutorisee(role, mission, vers, maintenant) {
  const de = mission.statut;
  if (!STATUTS_MISSION.includes(de) || !STATUTS_MISSION.includes(vers)) return false;
  const remise = de === 'ok' && vers === 'todo' && estARefaire(mission, maintenant);
  if (role === 'frere') {
    if (de === 'todo' && vers === 'wait') return toutesCochees(mission);
    return remise;
  }
  if (role === 'aidant') {
    if (de === 'wait' && (vers === 'ok' || vers === 'todo')) return true;
    return remise;
  }
  return false;
}

/** Modification à appliquer pour « Pas encore » : retour à faire, étapes décochées. */
export function pasEncore(mission) {
  return remiseAZero(mission);
}

/**
 * Missions affichées au frère : celles qui ne sont pas validées, les « à faire »
 * d'abord, puis les « en attente » ; les plus récentes en premier.
 */
export function missionsDuFrere(missions) {
  const rang = { todo: 0, wait: 1 };
  return missions
    .filter((m) => m.statut === 'todo' || m.statut === 'wait')
    .sort((a, b) => (rang[a.statut] - rang[b.statut])
      || ((enMillis(b.creeeLe) ?? Infinity) - (enMillis(a.creeeLe) ?? Infinity)));
}

/** Pastilles de la barre du bas. */
export function compteurs(missions, demandes) {
  return {
    aFaire: missions.filter((m) => m.statut === 'todo').length,
    aValider: missions.filter((m) => m.statut === 'wait').length
      + demandes.filter((d) => d.statut === 'asked').length,
  };
}

// ---------------------------------------------------------------------------
// Récompenses et demandes
// ---------------------------------------------------------------------------

/** Récompenses non archivées, de la moins chère à la plus chère. */
export function recompensesActives(recompenses) {
  return recompenses
    .filter((r) => !r.archivee)
    .sort((a, b) => a.prix - b.prix || String(a.titre).localeCompare(String(b.titre), 'fr'));
}

/**
 * Objectif affiché en haut de l'écran du frère : celui qu'il a choisi s'il
 * existe encore, sinon la récompense active la moins chère, sinon null.
 */
export function objectifActuel(recompenses, objectifId) {
  const actives = recompensesActives(recompenses);
  return actives.find((r) => r.id === objectifId) || actives[0] || null;
}

/** Demande en cours (pas encore donnée) pour cette récompense, ou null. */
export function demandeEnCours(recompense, demandes) {
  return demandes.find((d) => d.recompenseId === recompense.id && d.statut === 'asked') || null;
}

/** Le frère peut demander la récompense s'il a assez d'étoiles et pas de demande en cours. */
export function peutDemander(recompense, solde, demandes) {
  return !recompense.archivee
    && entierPositif(recompense.prix) > 0
    && solde >= recompense.prix
    && !demandeEnCours(recompense, demandes);
}

/**
 * Ce que l'écran « Mes récompenses » affiche pour une récompense :
 *   'demandee' : « Demandé ! La famille prépare ta récompense. »
 *   'possible' : bouton « Je veux X »
 *   'objectif' : « C'est mon objectif »
 *   'choisir'  : bouton « Choisir comme objectif »
 */
export function etatRecompense(recompense, { solde, demandes, objectifId }) {
  if (demandeEnCours(recompense, demandes)) return 'demandee';
  if (peutDemander(recompense, solde, demandes)) return 'possible';
  return recompense.id === objectifId ? 'objectif' : 'choisir';
}

/** Données d'une nouvelle demande : le prix est figé au moment de la demande. */
export function preparerDemande(recompense) {
  return {
    recompenseId: recompense.id,
    titre: recompense.titre,
    icone: recompense.icone,
    prix: recompense.prix,
    statut: 'asked',
  };
}

/** Seul un aidant peut passer une demande de « demandée » à « donnée ». */
export function transitionDemandeAutorisee(role, de, vers) {
  return role === 'aidant' && de === 'asked' && vers === 'given';
}

// ---------------------------------------------------------------------------
// Fête « +N étoiles » à l'ouverture de l'appli
// ---------------------------------------------------------------------------

/**
 * Calcule la fête à montrer au frère.
 *   validations : liste des validations (avec leur date `le`)
 *   vuJusqua    : date (en ms) de la dernière validation déjà fêtée, ou null
 *                 si l'appli n'a encore rien mémorisé sur cet appareil.
 * Renvoie { etoiles, nouvelles, vuJusqua } : `vuJusqua` est la nouvelle valeur
 * à mémoriser APRÈS avoir montré la fête, pour ne pas la refaire.
 *
 * Première ouverture (vuJusqua null) : pas de fête pour les validations
 * anciennes, on mémorise seulement où on en est.
 * Les validations dont la date serveur n'est pas encore connue sont ignorées :
 * elles seront fêtées quand elle arrivera.
 */
export function feteAMontrer(validations, vuJusqua) {
  const datees = validations
    .map((v) => ({ v, t: enMillis(v.le) }))
    .filter((x) => x.t != null);
  const plusRecente = datees.reduce((m, x) => Math.max(m, x.t), -Infinity);
  if (vuJusqua == null) {
    return { etoiles: 0, nouvelles: [], vuJusqua: datees.length ? plusRecente : null };
  }
  const nouvelles = datees.filter((x) => x.t > vuJusqua).map((x) => x.v);
  return {
    etoiles: nouvelles.reduce((s, v) => s + entierPositif(v.etoiles), 0),
    nouvelles,
    vuJusqua: Math.max(vuJusqua, plusRecente),
  };
}

// ---------------------------------------------------------------------------
// Saisies des aidants (vérifiées ici, puis à nouveau par firestore.rules)
// ---------------------------------------------------------------------------

/** Découpe le texte des étapes : une étape par ligne, lignes vides ignorées. */
export function decouperEtapes(texte) {
  return String(texte ?? '')
    .split(/\r?\n/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const nettoyer = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Vérifie et met en forme une nouvelle mission.
 * Renvoie { ok: true, mission } ou { ok: false, erreurs: { champ: message } }.
 */
export function preparerMission({ titre, icone, etoiles, etapes, quotidienne } = {}) {
  const erreurs = {};
  const t = nettoyer(titre);
  const liste = Array.isArray(etapes) ? etapes.map(nettoyer).filter(Boolean) : decouperEtapes(etapes);
  if (!t) erreurs.titre = 'Écris un titre.';
  else if (t.length > LIMITES.titreMission) erreurs.titre = `${LIMITES.titreMission} caractères au maximum.`;
  if (!ICONES_MISSION.includes(icone)) erreurs.icone = 'Choisis une image.';
  if (!Number.isInteger(etoiles) || etoiles < LIMITES.etoilesMin || etoiles > LIMITES.etoilesMax) {
    erreurs.etoiles = `Choisis entre ${LIMITES.etoilesMin} et ${LIMITES.etoilesMax} étoiles.`;
  }
  if (liste.length > LIMITES.nbEtapes) erreurs.etapes = `${LIMITES.nbEtapes} étapes au maximum.`;
  else if (liste.some((e) => e.length > LIMITES.etape)) erreurs.etapes = `Chaque étape : ${LIMITES.etape} caractères au maximum.`;
  if (Object.keys(erreurs).length) return { ok: false, erreurs };
  return {
    ok: true,
    mission: {
      titre: t,
      icone,
      etoiles,
      etapes: liste,
      cochees: liste.map(() => false),
      statut: 'todo',
      quotidienne: quotidienne === true,
    },
  };
}

/** Vérifie et met en forme une récompense (ajout ou modification). */
export function preparerRecompense({ titre, icone, prix } = {}) {
  const erreurs = {};
  const t = nettoyer(titre);
  const p = typeof prix === 'string' ? Number(prix.trim()) : prix;
  if (!t) erreurs.titre = 'Écris un nom.';
  else if (t.length > LIMITES.titreRecompense) erreurs.titre = `${LIMITES.titreRecompense} caractères au maximum.`;
  if (!ICONES_RECOMPENSE.includes(icone)) erreurs.icone = 'Choisis une image.';
  if (!Number.isInteger(p) || p < LIMITES.prixMin || p > LIMITES.prixMax) {
    erreurs.prix = `Un prix entre ${LIMITES.prixMin} et ${LIMITES.prixMax} étoiles.`;
  }
  if (Object.keys(erreurs).length) return { ok: false, erreurs };
  return { ok: true, recompense: { titre: t, icone, prix: p, archivee: false } };
}

/** Adresse e-mail en minuscules et sans espaces, ou null si elle n'est pas valable. */
export function normaliserEmail(email) {
  const e = String(email ?? '').trim().toLowerCase();
  if (e.length > LIMITES.email) return null;
  return /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(e) ? e : null;
}

/** Vérifie une invitation : { ok, invitation: { email, role, prenom } } ou { ok: false, erreurs }. */
export function preparerInvitation({ email, role, prenom } = {}) {
  const erreurs = {};
  const e = normaliserEmail(email);
  const p = nettoyer(prenom);
  if (!e) erreurs.email = 'Adresse e-mail non valable.';
  if (!ROLES.includes(role)) erreurs.role = 'Choisis un rôle.';
  if (!p) erreurs.prenom = 'Écris un prénom.';
  else if (p.length > LIMITES.prenom) erreurs.prenom = `${LIMITES.prenom} caractères au maximum.`;
  if (Object.keys(erreurs).length) return { ok: false, erreurs };
  return { ok: true, invitation: { email: e, role, prenom: p } };
}

// ---------------------------------------------------------------------------
// Historique
// ---------------------------------------------------------------------------

export const TYPES_EVENEMENT = Object.freeze([
  'famille_creee',
  'membre_invite',
  'membre_rejoint',
  'mission_creee',
  'mission_terminee',
  'mission_validee',
  'mission_pas_encore',
  'recompense_ajoutee',
  'recompense_modifiee',
  'recompense_archivee',
  'recompense_demandee',
  'recompense_donnee',
]);

/**
 * Prépare un événement d'historique. La date est ajoutée par la couche de
 * stockage (date serveur). `auteur` = { uid, prenom }.
 *   titre   : titre de la mission ou de la récompense, ou prénom de l'invité
 *   etoiles : nombre d'étoiles concerné, ou null
 */
export function preparerEvenement(type, { titre = '', etoiles = null, auteur } = {}) {
  if (!TYPES_EVENEMENT.includes(type)) throw new Error(`Type d'événement inconnu : ${type}`);
  if (!auteur || !auteur.uid) throw new Error('Auteur manquant');
  return {
    type,
    titre: nettoyer(titre).slice(0, LIMITES.titreMission),
    etoiles: Number.isInteger(etoiles) ? etoiles : null,
    auteurUid: auteur.uid,
    auteurNom: nettoyer(auteur.prenom).slice(0, LIMITES.prenom),
  };
}

/** Phrase affichée dans l'historique. */
export function texteEvenement(evt) {
  const nom = evt.auteurNom || 'Quelqu\'un';
  const t = evt.titre;
  const n = evt.etoiles;
  const etoiles = Number.isInteger(n) ? `${n} ${pluriel(n, 'étoile')}` : '';
  switch (evt.type) {
    case 'famille_creee': return `${nom} a créé la famille`;
    case 'membre_invite': return `${nom} a invité ${t}`;
    case 'membre_rejoint': return `${nom} a rejoint la famille`;
    case 'mission_creee': return `Nouvelle mission : « ${t} »`;
    case 'mission_terminee': return `${nom} a fini « ${t} »`;
    case 'mission_validee': return `« ${t} » validée, +${etoiles}`;
    case 'mission_pas_encore': return `« ${t} » : pas encore, renvoyée gentiment`;
    case 'recompense_ajoutee': return `Nouvelle récompense : ${t} (${etoiles})`;
    case 'recompense_modifiee': return `Récompense modifiée : ${t}`;
    case 'recompense_archivee': return `Récompense retirée de la liste : ${t}`;
    case 'recompense_demandee': return `${nom} demande : ${t} (−${etoiles})`;
    case 'recompense_donnee': return `Récompense donnée : ${t}`;
    default: return '';
  }
}

/** Ligne complète : « Hier : « Ranger » validée, +3 étoiles ». */
export function ligneHistorique(evt, maintenant) {
  return `${libelleJour(evt.le, maintenant)} : ${texteEvenement(evt)}`;
}
