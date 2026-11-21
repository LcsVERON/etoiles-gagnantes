// js/app.js — point d'entrée : choisit le stockage, affiche le bon écran
// selon le rôle, et relie les boutons aux actions.

import * as A from './actions.js';
import * as L from './logique.js';
import * as ui from './ui.js';
import { html, remplir } from './html.js';
import { creerStockageDemo } from './donnees/demo.js';
import * as Frere from './vues/frere.js';
import * as Famille from './vues/famille.js';

const $ = (id) => document.getElementById(id);

// Étape 2 : seul le mode démo existe. À l'étape 4, le stockage Firebase sera
// utilisé par défaut et le mode démo restera accessible avec l'adresse #demo.
function choisirStockage() {
  return creerStockageDemo();
}

const stockage = choisirStockage();

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
      ui.toast(e.message || 'Ça n\'a pas marché. Réessaie.');
      return { ok: false };
    }
  },
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

function rendre() {
  const E = app.etat;
  if (!E) return;
  const refocus = memoriserFocus();
  $('chargement').hidden = true;
  document.querySelectorAll('.ecran').forEach((s) => { s.hidden = true; });
  rendreBarreDemo(E);

  if (!E.famille || !E.moi) {
    document.body.classList.remove('vue-frere');
    $('barreNav').hidden = true;
    $('e-vide').hidden = false;
    remplir($('e-vide'), stockage.mode === 'demo'
      ? html`<h1>Plus rien ici</h1><p>Toutes les données de la démo ont été supprimées.</p>
             <button class="big" type="button" data-clic="demoRecommencer">Recommencer la démo</button>`
      : html`<p class="empty">Chargement…</p>`);
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
// Vérifications automatiques à chaque mise à jour des données
// ---------------------------------------------------------------------------

let remiseEnCours = false;
/** Remet « à faire » les missions quotidiennes d'un jour passé. */
async function verifierRemises() {
  if (remiseEnCours || !app.etat?.moi) return;
  const ops = A.remisesAZero(app.etat, app.contexte());
  if (!ops.length) return;
  remiseEnCours = true;
  try { await stockage.executer(ops); } catch (e) { console.error(e); }
  remiseEnCours = false;
}

let feteEnCours = false;
/** Montre la fête « +N étoiles » une seule fois par validation. */
async function verifierFete() {
  const E = app.etat;
  if (feteEnCours || E?.moi?.role !== 'frere') return;
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
  if (app.etat?.moi?.id === uid) await app.faire(A.marquerFeteVue, f.vuJusqua);
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
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-clic]');
  if (!el || el.disabled) return;
  const nom = el.dataset.clic;
  const fn = CLICS_COMMUNS[nom] || (app.etat?.moi ? vueDe(app.etat).CLICS[nom] : null);
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

Famille.initialiser(app);

stockage.abonner((etat) => {
  app.etat = etat;
  rendre();
  verifierRemises();
  verifierFete();
});

// Si l'appli reste ouverte après minuit : remise à zéro et dates à jour.
setInterval(() => { rendre(); verifierRemises(); }, 5 * 60 * 1000);
