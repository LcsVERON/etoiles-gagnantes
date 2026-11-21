// js/donnees/firebase.js — stockage avec Firebase (Authentication + Firestore).
//
// Même interface que le mode démo (js/donnees/demo.js) :
//   abonner(fn), executer(ops, options), nouvelId(), maintenant()
// plus la connexion et l'entrée dans une famille (objet `connexion`).
//
// L'état publié a la même forme que celui du mode démo, avec en plus :
//   phase : 'config' | 'chargement' | 'connexion' | 'lien' | 'accueil' | 'famille'
//   utilisateur : { uid, email, nom } ou null
//   invitationsRecues : invitations trouvées pour l'adresse de la personne
//
// Hors connexion : Firestore garde une copie locale (persistentLocalCache).
// Les écritures sont appliquées tout de suite à cette copie, puis envoyées
// au serveur quand la connexion revient.

import { initializeApp } from '../vendor/firebase/firebase-app.js';
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserPopupRedirectResolver,
  onAuthStateChanged, GoogleAuthProvider, signInWithPopup, sendSignInLinkToEmail,
  isSignInWithEmailLink, signInWithEmailLink, signOut, connectAuthEmulator,
} from '../vendor/firebase/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, collection, collectionGroup, query, where, orderBy, limit, onSnapshot, getDocs,
  getDocFromServer, writeBatch, serverTimestamp, increment,
} from '../vendor/firebase/firebase-firestore.js';
import {
  firebaseConfig, configurationComplete, utiliserEmulateurs, configEmulateurs, EMULATEURS,
} from '../firebase-config.js';
import * as A from '../actions.js';
import { enMillis, normaliserEmail } from '../logique.js';
import { preparerLot, ecrireLots, supprimeLaFamille, TAILLE_LOT } from './lots.js';

const fs = { doc, writeBatch, serverTimestamp, increment };

// Mémorisé sur l'appareil (localStorage) :
const CLE_EMAIL = 'mes-missions:email-connexion'; // adresse en attente du lien e-mail
const cleFamille = (uid) => `mes-missions:famille:${uid}`; // famille de ce compte

/** Nombre de validations lues pour la fête « +N étoiles » (les plus récentes). */
const VALIDATIONS_LUES = 50;

const lireLocal = (cle) => { try { return localStorage.getItem(cle); } catch { return null; } };
const ecrireLocal = (cle, v) => { try { localStorage.setItem(cle, v); } catch { /* stockage indisponible */ } };
const effacerLocal = (cle) => { try { localStorage.removeItem(cle); } catch { /* idem */ } };

const familleVide = () => ({
  famille: null, moi: null, membres: [], invitations: [], missions: [], validations: [],
  recompenses: [], demandes: [], evenements: [],
});

/** Stockage minimal quand la configuration n'est pas remplie. */
function stockageSansConfig() {
  const etat = { mode: 'firebase', phase: 'config', ...familleVide() };
  return {
    mode: 'firebase',
    maintenant: () => Date.now(),
    nouvelId: () => '',
    surErreur: null,
    abonner(fn) { queueMicrotask(() => fn(etat)); return () => {}; },
    async executer() { throw new Error('Configuration Firebase à compléter.'); },
  };
}

export function creerStockageFirebase() {
  if (!configurationComplete && !utiliserEmulateurs) return stockageSansConfig();

  const appFirebase = initializeApp(utiliserEmulateurs ? configEmulateurs : firebaseConfig);
  // La session reste ouverte (IndexedDB, sinon localStorage).
  const auth = initializeAuth(appFirebase, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  auth.languageCode = 'fr';
  const db = initializeFirestore(appFirebase, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (utiliserEmulateurs) {
    connectAuthEmulator(auth, EMULATEURS.auth, { disableWarnings: true });
    connectFirestoreEmulator(db, EMULATEURS.firestore.host, EMULATEURS.firestore.port);
  }

  const nouvelId = () => doc(collection(db, '_')).id;
  const abonnes = new Set();
  const stockage = {
    mode: 'firebase',
    emulateurs: utiliserEmulateurs,
    maintenant: () => Date.now(),
    nouvelId,
    surErreur: (e) => console.error(e),
  };

  // ---------------------------------------------------------------------------
  // État publié
  // ---------------------------------------------------------------------------
  let etat = {
    mode: 'firebase', phase: 'chargement', utilisateur: null, invitationsRecues: [],
    emulateurs: utiliserEmulateurs, ...familleVide(),
  };
  const publier = (modif) => {
    etat = { ...etat, ...modif };
    abonnes.forEach((fn) => fn(etat));
  };

  // ---------------------------------------------------------------------------
  // Écoute en temps réel de la famille ouverte
  // ---------------------------------------------------------------------------
  let familleId = null;
  let roleEcoute = null;
  let limiteHistorique = 16;
  const ecoutes = new Map(); // clé → fonction pour arrêter l'écoute
  let sources = {};
  let recalculPrevu = false;
  let pertePrevue = false;

  const lireDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));

  function ecouter(cle, cible, transformer = lireDocs) {
    ecoutes.get(cle)?.();
    const arret = onSnapshot(cible, (snap) => {
      sources[cle] = transformer(snap);
      sources[`${cle}:cache`] = snap.metadata.fromCache;
      planifierRecalcul();
    }, (erreur) => {
      // Accès refusé : la personne a été retirée, ou la famille supprimée.
      if (erreur.code === 'permission-denied') perdreFamille();
      else stockage.surErreur(erreur);
    });
    ecoutes.set(cle, arret);
  }

  function fermerFamille() {
    ecoutes.forEach((arret) => arret());
    ecoutes.clear();
    sources = {};
    familleId = null;
    roleEcoute = null;
  }

  function ouvrirFamille(fid) {
    fermerFamille();
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    familleId = fid;
    ecrireLocal(cleFamille(uid), fid);
    publier({ phase: 'chargement', ...familleVide() });
    ecouter('famille', doc(db, 'families', fid), (s) => (s.exists() ? { id: s.id, ...s.data({ serverTimestamps: 'estimate' }) } : null));
    ecouter('membres', collection(db, 'families', fid, 'members'));
    verifierAppartenance();
  }

  /**
   * Vérifie auprès du serveur que l'on fait toujours partie de la famille.
   * Nécessaire car, une fois retiré(e), le serveur n'envoie plus rien aux
   * écoutes en cours. Une seule lecture ; hors connexion, on ne fait rien.
   */
  async function verifierAppartenance() {
    const uid = auth.currentUser?.uid;
    const fid = familleId;
    if (!uid || !fid || globalThis.navigator?.onLine === false) return;
    try {
      const fiche = await getDocFromServer(doc(db, 'families', fid, 'members', uid));
      if (familleId === fid && !fiche.exists()) perdreFamille();
    } catch (e) {
      if (familleId === fid && e.code === 'permission-denied') perdreFamille();
    }
  }

  // À chaque retour sur l'appli, au retour de la connexion, et toutes les 10 minutes.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') verifierAppartenance();
  });
  window.addEventListener('online', verifierAppartenance);
  setInterval(verifierAppartenance, 10 * 60 * 1000);

  /** Écoutes qui dépendent du rôle (une personne aidée ne lit pas les invitations). */
  function ecouterSelonRole(role) {
    const uid = auth.currentUser.uid;
    const c = (...chemin) => collection(db, 'families', familleId, ...chemin);
    roleEcoute = role;
    ecouter('missionsEnCours', query(c('tasks'), where('statut', 'in', ['todo', 'wait'])));
    ecouter('missionsQuotidiennes', query(c('tasks'), where('quotidienne', '==', true)));
    ecouter('recompenses', c('rewards'));
    ecouter('demandes', query(c('redemptions'), where('statut', '==', 'asked')));
    if (role === 'aidant') {
      ecouter('invitations', c('invites'));
      ecouterHistorique();
    } else {
      ecouter('validations', query(c('validations'), where('pour', '==', uid), orderBy('le', 'desc'), limit(VALIDATIONS_LUES)));
    }
  }

  function ecouterHistorique() {
    ecouter('evenements', query(collection(db, 'families', familleId, 'events'), orderBy('le', 'desc'), limit(limiteHistorique)));
  }

  function planifierRecalcul() {
    if (recalculPrevu) return;
    recalculPrevu = true;
    queueMicrotask(() => { recalculPrevu = false; recalculer(); });
  }

  const parDateDesc = (champ) => (a, b) => (enMillis(b[champ]) ?? Infinity) - (enMillis(a[champ]) ?? Infinity);

  function recalculer() {
    if (!familleId) return;
    const uid = auth.currentUser?.uid;
    const s = sources;
    const membres = s.membres || [];
    const moi = membres.find((m) => m.id === uid) || null;

    // La famille a disparu, ou on n'en fait plus partie (réponse du serveur).
    if ((s.famille === null && s['famille:cache'] === false)
      || (s.membres && !moi && s['membres:cache'] === false)) {
      perdreFamille();
      return;
    }
    if (moi && !roleEcoute) ecouterSelonRole(moi.role);

    const missions = new Map();
    [...(s.missionsEnCours || []), ...(s.missionsQuotidiennes || [])].forEach((m) => missions.set(m.id, m));
    publier({
      phase: s.famille && moi ? 'famille' : 'chargement',
      famille: s.famille || null,
      moi,
      membres,
      invitations: s.invitations || [],
      missions: [...missions.values()],
      validations: s.validations || [],
      recompenses: s.recompenses || [],
      demandes: (s.demandes || []).sort(parDateDesc('demandeeLe')),
      evenements: s.evenements || [],
    });
  }

  /** La famille n'est plus accessible : on oublie et on cherche à nouveau. */
  function perdreFamille() {
    if (pertePrevue) return;
    pertePrevue = true;
    queueMicrotask(() => {
      pertePrevue = false;
      const uid = auth.currentUser?.uid;
      if (uid) effacerLocal(cleFamille(uid));
      fermerFamille();
      chercherFamille();
    });
  }

  // ---------------------------------------------------------------------------
  // Trouver sa famille, ou une invitation, après la connexion
  // ---------------------------------------------------------------------------
  async function chercherFamille() {
    const u = auth.currentUser;
    if (!u) return;
    // Famille déjà connue sur cet appareil : on l'ouvre (marche hors connexion).
    const memo = lireLocal(cleFamille(u.uid));
    if (memo) { ouvrirFamille(memo); return; }

    publier({ phase: 'chargement', ...familleVide() });
    try {
      const fiches = await getDocs(query(collectionGroup(db, 'members'), where('uid', '==', u.uid), limit(1)));
      if (auth.currentUser?.uid !== u.uid) return;
      if (!fiches.empty) { ouvrirFamille(fiches.docs[0].ref.parent.parent.id); return; }
      let invitationsRecues = [];
      if (u.emailVerified && u.email) {
        const inv = await getDocs(query(collectionGroup(db, 'invites'), where('email', '==', u.email.toLowerCase())));
        invitationsRecues = inv.docs.map((d) => ({ id: d.id, familleId: d.ref.parent.parent.id, ...d.data() }));
      }
      if (auth.currentUser?.uid !== u.uid) return;
      publier({ phase: 'accueil', invitationsRecues, ...familleVide() });
    } catch (e) {
      stockage.surErreur(e);
      publier({ phase: 'accueil', invitationsRecues: [], ...familleVide() });
    }
  }

  // ---------------------------------------------------------------------------
  // Connexion
  // ---------------------------------------------------------------------------
  let lienEnAttente = isSignInWithEmailLink(auth, location.href);

  const nettoyerAdresse = () => history.replaceState(null, '', location.pathname);

  async function terminerLien(email) {
    const e = normaliserEmail(email);
    if (!e) throw new Error('Adresse e-mail non valable.');
    try {
      await signInWithEmailLink(auth, e, location.href);
      effacerLocal(CLE_EMAIL);
    } finally {
      lienEnAttente = false;
      nettoyerAdresse();
      if (!auth.currentUser) publier({ phase: 'connexion' });
    }
  }

  // Lien e-mail ouvert sur l'appareil qui l'a demandé : connexion directe.
  if (lienEnAttente) {
    const email = lireLocal(CLE_EMAIL);
    if (email) terminerLien(email).catch((e) => stockage.surErreur(e));
  }

  onAuthStateChanged(auth, (u) => {
    fermerFamille();
    if (!u) {
      publier({ phase: lienEnAttente && !lireLocal(CLE_EMAIL) ? 'lien' : (lienEnAttente ? 'chargement' : 'connexion'), utilisateur: null, invitationsRecues: [], ...familleVide() });
      return;
    }
    publier({ utilisateur: { uid: u.uid, email: u.email, nom: u.displayName || '' } });
    chercherFamille();
  });

  const exigerConnexionInternet = () => {
    if (globalThis.navigator?.onLine === false) throw new Error('Il faut être connecté à Internet.');
  };

  stockage.connexion = {
    async google() {
      exigerConnexionInternet();
      try {
        await signInWithPopup(auth, new GoogleAuthProvider());
      } catch (e) {
        if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
        throw e;
      }
    },
    async envoyerLien(email) {
      exigerConnexionInternet();
      const e = normaliserEmail(email);
      if (!e) throw new A.ErreurSaisie({ email: 'Adresse e-mail non valable.' });
      await sendSignInLinkToEmail(auth, e, { url: location.origin + location.pathname, handleCodeInApp: true });
      ecrireLocal(CLE_EMAIL, e);
      return e;
    },
    terminerLien,
    async deconnecter() {
      fermerFamille();
      await signOut(auth);
    },
    /** Le premier aidant crée la famille (il faut être en ligne). */
    async creerFamille({ nom, prenom }) {
      exigerConnexionInternet();
      const u = auth.currentUser;
      const fid = doc(collection(db, 'families')).id;
      const ops = A.creerFamille({ nom, moi: { id: u.uid, prenom }, nouvelId });
      await ecrireLots(fs, db, fid, ops);
      ouvrirFamille(fid);
    },
    /** Une personne invitée rejoint la famille (il faut être en ligne). */
    async rejoindre(invitation) {
      exigerConnexionInternet();
      const u = auth.currentUser;
      await ecrireLots(fs, db, invitation.familleId, A.rejoindre(invitation, u.uid, nouvelId));
      ouvrirFamille(invitation.familleId);
    },
  };

  // ---------------------------------------------------------------------------
  // Interface commune avec le mode démo
  // ---------------------------------------------------------------------------
  stockage.abonner = (fn) => {
    abonnes.add(fn);
    queueMicrotask(() => fn(etat));
    return () => abonnes.delete(fn);
  };

  /**
   * Envoie des écritures. Un lot normal n'est PAS attendu : la copie locale
   * est mise à jour tout de suite (l'écran change même hors connexion) et
   * l'envoi au serveur se fait dès que possible. Si le serveur refuse,
   * Firestore annule le changement local et l'erreur est signalée (sauf
   * `silencieux`, pour les écritures automatiques).
   * Les très gros envois et la suppression complète sont attendus (plusieurs
   * lots dans l'ordre) : il faut être en ligne.
   */
  stockage.executer = async (ops, { silencieux = false } = {}) => {
    if (!ops.length) return;
    if (!familleId) throw new Error('Aucune famille ouverte.');
    if (ops.length > TAILLE_LOT || supprimeLaFamille(ops)) {
      exigerConnexionInternet();
      await ecrireLots(fs, db, familleId, ops);
      return;
    }
    preparerLot(fs, db, familleId, ops).commit().catch((e) => {
      if (silencieux) console.warn('Écriture automatique refusée', e);
      else stockage.surErreur(e);
    });
  };

  /** Nombre d'événements d'historique voulus (« Voir plus »). */
  stockage.historique = (n) => {
    limiteHistorique = n;
    if (familleId && roleEcoute === 'aidant') ecouterHistorique();
  };

  return stockage;
}
