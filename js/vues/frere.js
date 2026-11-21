// js/vues/frere.js — écrans de la personne aidée (FALC : phrases courtes,
// tutoiement, une action par écran, grands boutons).

import { html, brut, remplir } from '../html.js';
import * as L from '../logique.js';
import * as A from '../actions.js';
import { icone, ETOILE, ETOILE_VIDE } from '../icones.js';

const $ = (id) => document.getElementById(id);
const IC = (cle) => brut(icone(cle));
const ET = brut(ETOILE);

/** Au-delà de ce prix, la jauge est une barre plutôt qu'une rangée d'étoiles. */
const MAX_ETOILES_DESSINEES = 20;

export const ECRANS = ['f-missions', 'f-mission', 'f-recompenses'];

/** Onglets de la barre du bas, avec leurs pastilles. */
export function onglets(E) {
  const d = L.donneesAide(E, E.moi.id);
  const possibles = L.recompensesActives(E.recompenses)
    .filter((r) => L.peutDemander(r, d.solde, d.demandes)).length;
  return [
    { ecran: 'f-missions', libelle: 'Missions', pastille: L.compteurs(d.missions, []).aFaire, actif: ['f-missions', 'f-mission'] },
    { ecran: 'f-recompenses', libelle: 'Récompenses', pastille: possibles },
  ];
}

export function rendre(app) {
  const E = app.etat;
  const d = L.donneesAide(E, E.moi.id);
  if (app.ecran === 'f-missions') ecranMissions(E, d);
  else if (app.ecran === 'f-mission') ecranMission(app, d);
  else if (app.ecran === 'f-recompenses') ecranRecompenses(E, d);
}

const etoiles = (n) => `${n} ${L.pluriel(n, 'étoile')}`;

function jauge(solde, prix) {
  const pleines = Math.max(0, Math.min(solde, prix));
  if (prix <= MAX_ETOILES_DESSINEES) {
    return html`<div class="stars" role="img" aria-label="${pleines} ${L.pluriel(pleines, 'étoile')} sur ${prix}">${
      brut(Array.from({ length: prix }, (_, k) => (k < pleines ? ETOILE : ETOILE_VIDE)).join(''))}</div>`;
  }
  return html`<div class="meter" role="img" aria-label="${pleines} ${L.pluriel(pleines, 'étoile')} sur ${prix}"><i data-largeur="${(pleines / prix) * 100}"></i></div>`;
}

function ecranMissions(E, d) {
  const objectif = L.objectifActuel(E.recompenses, E.moi.objectif);
  const goal = $('fObjectif');
  if (!objectif) {
    goal.classList.add('vide');
    remplir(goal, html`<b>Bientôt des récompenses !</b>`);
  } else {
    goal.classList.remove('vide');
    const manque = L.etoilesManquantes(d.solde, objectif.prix);
    remplir(goal, html`<div class="ic">${IC(objectif.icone)}</div><div><b>${objectif.titre}</b>
      <p class="encore">${manque ? html`Encore <strong>${manque}</strong> ${L.pluriel(manque, 'étoile')}` : 'Tu peux l\'avoir !'}</p>
      ${jauge(d.solde, objectif.prix)}</div>`);
  }
  const liste = L.missionsDuFrere(d.missions);
  remplir($('fMissions'), liste.length
    ? liste.map((m) => html`<button class="task ${m.statut === 'wait' ? 'wait' : ''}" type="button" data-clic="ouvrir" data-id="${m.id}">
        <span class="ic">${IC(m.icone)}</span>
        <span>${m.titre}${m.statut === 'wait' ? html`<span class="tag">Fini ! On vérifie.</span>` : ''}</span>
        <span class="pts">+${m.etoiles} ${ET}<span class="sr">${L.pluriel(m.etoiles, 'étoile')}</span></span></button>`)
    : html`<p class="empty">Pas de mission pour le moment.</p>`);
}

function ecranMission(app, d) {
  const m = d.missions.find((x) => x.id === app.param);
  // Mission validée ou supprimée pendant qu'elle était ouverte : retour à la liste.
  if (!m || (m.statut !== 'todo' && m.statut !== 'wait')) { app.aller('f-missions'); return; }
  const attente = m.statut === 'wait';
  const pret = L.peutTerminer(m);
  remplir($('e-f-mission'), html`
    <div class="hero"><div class="ic">${IC(m.icone)}</div><h1>${m.titre}</h1>
      <span class="pts">Tu gagnes ${m.etoiles} ${ET}<span class="sr">${L.pluriel(m.etoiles, 'étoile')}</span></span></div>
    ${m.etapes.map((texte, k) => {
      const fait = m.cochees[k] === true;
      return html`<button class="step ${fait ? 'done' : ''}" type="button" data-clic="etape" data-index="${k}" aria-pressed="${fait}" ${attente ? brut('disabled') : ''}>
        <span class="box" aria-hidden="true">${fait ? '✓' : ''}</span><span class="texte">${texte}</span></button>`;
    })}
    ${attente
    ? html`<p class="empty">Bravo ! Quelqu'un de la famille va vérifier.</p>`
    : html`<button class="big" type="button" data-clic="fini" ${pret ? '' : brut('disabled')}>J'ai fini</button>
           ${pret ? '' : html`<p class="indice">Coche toutes les étapes.</p>`}`}
    <button class="ghost" type="button" data-clic="retour">← Retour</button>`);
}

function ecranRecompenses(E, d) {
  const solde = Math.max(0, d.solde);
  remplir($('fTotal'), html`${ET} J'ai ${etoiles(solde)}`);
  const liste = L.recompensesActives(E.recompenses);
  remplir($('fRecompenses'), liste.length ? liste.map((r) => {
    const etat = L.etatRecompense(r, { solde: d.solde, demandes: d.demandes, objectifId: E.moi.objectif });
    let bas;
    if (etat === 'demandee') bas = html`<p class="state">Demandé ! La famille prépare ta récompense.</p>`;
    else if (etat === 'possible') bas = html`<button type="button" data-clic="demander" data-id="${r.id}">Je veux : ${r.titre}</button>`;
    else if (etat === 'objectif') bas = html`<button type="button" class="sel" aria-pressed="true">C'est mon objectif ✓</button>`;
    else bas = html`<button type="button" data-clic="objectif" data-id="${r.id}">Choisir comme objectif</button>`;
    return html`<div class="rew"><div class="ic">${IC(r.icone)}</div><div><b>${r.titre}</b>
      <div class="meter" aria-hidden="true"><i data-largeur="${(solde / r.prix) * 100}"></i></div>
      <span class="pts">${r.prix} ${ET}<span class="sr">${L.pluriel(r.prix, 'étoile')}</span></span></div>${bas}</div>`;
  }) : html`<p class="empty">Bientôt des récompenses !</p>`);
}

/** Réactions aux boutons (attribut data-clic). */
export const CLICS = {
  ouvrir: (app, el) => app.aller('f-mission', el.dataset.id),
  retour: (app) => app.aller('f-missions'),
  etape: (app, el) => app.faire(A.cocherEtape, app.param, Number(el.dataset.index)),
  fini: async (app) => {
    const r = await app.faire(A.terminerMission, app.param);
    if (!r.ok) return;
    app.aller('f-missions');
    app.ui.fete({ titre: 'Bravo !', ligne: 'Quelqu\'un de la famille va vérifier.' });
  },
  objectif: (app, el) => app.faire(A.choisirObjectif, el.dataset.id),
  demander: async (app, el) => {
    const r = await app.faire(A.demanderRecompense, el.dataset.id);
    if (r.ok) app.ui.toast('Ta demande est envoyée à la famille.');
  },
};
