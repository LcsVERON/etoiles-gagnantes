// js/app.js — point d'entrée : choisit le stockage (Firebase, ou démo avec
// l'adresse #demo), affiche le bon écran selon la phase et le rôle, et relie
// les boutons aux actions.

import * as A from './actions.js';
import * as L from './logique.js';
import * as ui from './ui.js';
import { html, remplir } from './html.js';
import { messageErreur } from './erreurs.js';
import { creerStockageDemo } from './donnees/demo.js';
import * as Accueil from './vues/accueil.js';
import * as Frere from './vues/frere.js';
import * as Famille from './vues/famille.js';

const $ = (id) => document.getElementById(id);

const MODE_DEMO = location.hash === '#demo';

// Passer de la démo à l'appli (ou l'inverse) recharge la page : les deux
// modes ne partagent rien.
window.addEventListener('hashchange', () => location.reload());

/** Le SDK Firebase n'est chargé que hors démo. */
async function choisirStockage() {
  if (MODE_DEMO) return creerStockageDemo();
  const { creerStockageFirebase } = await import('./donnees/firebase.js');
  return creerStockageFirebase();
}

let stockage;
try {
  stockage = await choisirStockage();
} catch (e) {
  console.error(e);
  $('chargement').textContent = 'L\'appli n\'a pas pu démarrer. Recharge la page.';
  throw e;
}

const app = {
  etat: null,
  ecran: null,
  param: null,
  stockage,
  ui,

  /** Va sur un écran (et remonte en haut de la page). */
  aller(ecran, param = null) {
    this.ecran = ecran;
    this.param = param;
    rendre();
    window.scrollTo(0, 0);
  },

  /** Réaffiche l'écran actuel sans changer de page. */
  rafraichir() { rendre(); },

  contexte() {
    return { moi: this.etat?.moi, nouvelId: stockage.nouvelId, maintenant: stockage.maintenant() };
  },

  /**
   * Exécute une action de js/actions.js. Renvoie { ok: true } ou
   * { ok: false, erreurs } (erreurs de saisie à afficher dans le formulaire).
   * Les autres erreurs sont affichées dans un message bref.
   */
  async faire(action, ...args) {
    try {
      const ops = action(this.etat, this.contexte(), ...args);
      await stockage.executer(ops);
      return { ok: true };
    } catch (e) {
      if (e instanceof A.ErreurSaisie) return { ok: false, erreurs: e.erreurs };
      console.error(e);
      ui.toast(messageErreur(e));
      return { ok: false };
    }
  },
};

// Erreurs signalées plus tard par le serveur (écriture refusée, etc.).
stockage.surErreur = (e) => {
  console.error(e);
  ui.toast(messageErreur(e));
};

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

function vueDe(E) {
  return E.moi?.role === 'frere' ? Frere : Famille;
}

/** Retrouve le bouton qui avait le focus après un nouvel affichage. */
function memoriserFocus() {
  const el = document.activeElement;
  if (!el || !el.dataset || !el.dataset.clic) return null;
  const { clic, id, cle, n, index } = el.dataset;
  return () => {
    const sel = Object.entries({ clic, id, cle, n, index })
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `[data-${k}="${CSS.escape(v)}"]`).join('');
    document.querySelector(sel)?.focus({ preventScroll: true });
  };
}

function cacherTout() {
  document.querySelectorAll('.ecran').forEach((s) => { s.hidden = true; });
  $('chargement').hidden = true;
  $('barreNav').hidden = true;
}

function rendre() {
  const E = app.etat;
  if (!E) return;
  const refocus = memoriserFocus();
  cacherTout();
  rendreBarreDemo(E);
  const phase = E.phase || 'famille';

  // Avant d'entrer dans une famille (Firebase) : connexion, accueil…
  if (phase !== 'famille') {
    document.body.classList.remove('vue-frere');
    if (Accueil.PHASES.includes(phase)) {
      $(`e-${phase}`).hidden = false;
      Accueil.rendre(app);
    } else {
      $('chargement').hidden = false;
    }
    refocus?.();
    return;
  }

  // Démo dont on a tout supprimé.
  if (!E.famille || !E.moi) {
    document.body.classList.remove('vue-frere');
    $('e-vide').hidden = false;
    remplir($('e-vide'), html`<h1>Plus rien ici</h1><p>Toutes les données de la démo ont été supprimées.</p>
      <button class="big" type="button" data-clic="demoRecommencer">Recommencer la démo</button>`);
    return;
  }

  const vue = vueDe(E);
  document.body.classList.toggle('vue-frere', vue === Frere);
  if (!vue.ECRANS.includes(app.ecran)) { app.ecran = vue.ECRANS[0]; app.param = null; }
  const ecran = app.ecran;
  $(`e-${ecran}`).hidden = false;
  vue.rendre(app);
  if (app.ecran !== ecran) return; // l'écran a redirigé (ex. mission validée entre-temps)

  rendreNav(vue.onglets(E));
  ui.appliquerLargeurs();
  refocus?.();
}

function rendreNav(onglets) {
  $('barreNav').hidden = false;
  remplir($('nav'), onglets.map((o) => {
    const actif = (o.actif || [o.ecran]).includes(app.ecran);
    return html`<button type="button" data-clic="onglet" data-id="${o.ecran}" ${actif ? html`aria-current="page"` : ''}>${o.libelle}${
      o.pastille ? html`<span class="dot"><span class="sr">(</span>${o.pastille}<span class="sr">)</span></span>` : ''}</button>`;
  }));
}

function rendreBarreDemo(E) {
  if (stockage.mode !== 'demo') return;
  $('haut').hidden = false;
  const jour = new Date(stockage.maintenant()).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('demoJour').textContent = `Nous sommes le ${jour}.`;
  const groupe = (role, titre) => {
    const ms = E.membres.filter((m) => m.role === role);
    return ms.length ? html`<optgroup label="${titre}">${ms.map((m) => html`<option value="${m.id}" ${m.id === E.moi?.id ? html`selected` : ''}>${m.prenom}</option>`)}</optgroup>` : '';
  };
  remplir($('demoQui'), html`${groupe('aidant', 'Aidants')}${groupe('frere', 'Personnes aidées')}`);
}

// ---------------------------------------------------------------------------
// Écritures automatiques à chaque mise à jour des données
// ---------------------------------------------------------------------------

const dansUneFamille = () => (app.etat?.phase || 'famille') === 'famille' && !!app.etat?.moi;

/** Écriture automatique : en cas de refus, pas de message (et pas de boucle). */
async function faireDiscretement(action, ...args) {
  try {
    const ops = action(app.etat, app.contexte(), ...args);
    await stockage.executer(ops, { silencieux: true });
  } catch (e) {
    console.warn(e);
  }
}

// Une mission dont la remise à zéro a été tentée n'est pas réessayée avant
// 10 minutes (si le serveur la refuse, on évite de recommencer en boucle).
const remisesTentees = new Map();
const DELAI_REESSAI = 10 * 60 * 1000;

/** Remet « à faire » les missions quotidiennes d'un jour passé. */
function verifierRemises() {
  if (!dansUneFamille()) return;
  const maintenant = Date.now();
  const ops = A.remisesAZero(app.etat, app.contexte())
    .filter((o) => maintenant - (remisesTentees.get(o.id) || 0) > DELAI_REESSAI);
  if (!ops.length) return;
  ops.forEach((o) => remisesTentees.set(o.id, maintenant));
  faireDiscretement(() => ops);
}

let feteEnCours = false;
/** Montre la fête « +N étoiles » une seule fois par validation. */
async function verifierFete() {
  const E = app.etat;
  if (feteEnCours || !dansUneFamille() || E.moi.role !== 'frere') return;
  const vu = Number.isInteger(E.moi.fetesVuesJusqua) ? E.moi.fetesVuesJusqua : null;
  const f = L.feteAMontrer(L.donneesAide(E, E.moi.id).validations, vu);
  if (f.vuJusqua == null || f.vuJusqua === vu) return;
  feteEnCours = true;
  const uid = E.moi.id;
  if (f.etoiles > 0) {
    await ui.fete({
      titre: `+${f.etoiles} ${L.pluriel(f.etoiles, 'étoile')} !`,
      ligne: f.nouvelles.length > 1 ? 'La famille a validé tes missions. Bravo !' : 'La famille a validé ta mission. Bravo !',
    });
  }
  // On mémorise seulement si c'est toujours la même personne (mode démo).
  if (app.etat?.moi?.id === uid) await faireDiscretement(A.marquerFeteVue, Math.round(f.vuJusqua));
  feteEnCours = false;
}

// ---------------------------------------------------------------------------
// Boutons
// ---------------------------------------------------------------------------

const CLICS_COMMUNS = {
  onglet: (a, el) => a.aller(el.dataset.id),
  demoDemain: () => {
    stockage.demo.jourSuivant();
    ui.toast('C\'est le lendemain : les missions de chaque jour reviennent.');
  },
  demoConnexion: (a, el) => {
    stockage.demo.simulerConnexion(el.dataset.id);
    ui.toast('La personne a rejoint la famille. Choisis-la en haut pour voir son appli.');
  },
  demoRecommencer: () => { app.ecran = null; stockage.demo.recommencer(); },
  ...Accueil.CLICS,
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-clic]');
  if (!el || el.disabled) return;
  const nom = el.dataset.clic;
  const fn = CLICS_COMMUNS[nom] || (dansUneFamille() ? vueDe(app.etat).CLICS[nom] : null);
  if (!fn) return;
  e.preventDefault();
  fn(app, el);
});

$('demoQui').addEventListener('change', (e) => {
  app.ecran = null;
  app.param = null;
  stockage.demo?.changerUtilisateur(e.target.value);
  window.scrollTo(0, 0);
});

Accueil.initialiser(app);
Famille.initialiser(app);

let dernierUid = null;
stockage.abonner((etat) => {
  // Changement de compte : on repart du premier écran.
  if (etat.moi?.id !== dernierUid) { app.ecran = null; app.param = null; dernierUid = etat.moi?.id ?? null; }
  app.etat = etat;
  rendre();
  verifierRemises();
  verifierFete();
});

// Service worker : ouverture de l'appli sans connexion (voir sw.js).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker non installé', e));
}

// Si l'appli reste ouverte après minuit : remise à zéro et dates à jour.
setInterval(() => { rendre(); verifierRemises(); }, 5 * 60 * 1000);
