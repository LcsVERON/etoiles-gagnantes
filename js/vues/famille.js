// js/vues/famille.js — écrans des aidants : valider, missions, récompenses,
// membres de la famille.

import { html, brut, remplir } from '../html.js';
import * as L from '../logique.js';
import * as A from '../actions.js';
import { icone, ETOILE, LIBELLES } from '../icones.js';

const $ = (id) => document.getElementById(id);
const IC = (cle) => brut(icone(cle));
const ET = brut(ETOILE);
const etoiles = (n) => `${n} ${L.pluriel(n, 'étoile')}`;
const PAS_HISTORIQUE = 15;

export const ECRANS = ['a-valider', 'a-missions', 'a-recompenses', 'a-famille'];

// État des formulaires (gardé entre deux affichages : les données peuvent
// changer en temps réel pendant qu'on écrit, sans effacer la saisie).
const formMission = { pour: new Set(), icone: 'plante', etoiles: 2 };
const formRecompense = { icone: 'jeu', edition: null };
let nbHistorique = PAS_HISTORIQUE;

const aides = (E) => E.membres.filter((m) => m.role === 'frere').sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr'));
const aidants = (E) => E.membres.filter((m) => m.role === 'aidant').sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr'));
const prenom = (E, uid) => E.membres.find((m) => m.id === uid)?.prenom || '(membre retiré)';

export function onglets(E) {
  return [
    { ecran: 'a-valider', libelle: 'À valider', pastille: L.compteurs(E.missions, E.demandes).aValider },
    { ecran: 'a-missions', libelle: 'Missions', pastille: 0 },
    { ecran: 'a-recompenses', libelle: 'Récompenses', pastille: 0 },
    { ecran: 'a-famille', libelle: 'Famille', pastille: 0 },
  ];
}

export function rendre(app) {
  const E = app.etat;
  ({
    'a-valider': ecranValider,
    'a-missions': ecranMissions,
    'a-recompenses': ecranRecompenses,
    'a-famille': ecranFamille,
  })[app.ecran]?.(E, app);
}

// ---------------------------------------------------------------------------
// À valider
// ---------------------------------------------------------------------------

function ecranValider(E, app) {
  const attente = E.missions.filter((m) => m.statut === 'wait');
  remplir($('aValider'), attente.length ? attente.map((m) => html`
    <div class="row"><div class="ic">${IC(m.icone)}</div>
      <div><b>${m.titre}</b><span class="info">Pour ${prenom(E, m.pour)}</span><span class="pts">+${m.etoiles} ${ET}</span></div>
      <div class="acts"><button class="yes" type="button" data-clic="valider" data-id="${m.id}">C'est fait ✓</button>
        <button class="no" type="button" data-clic="pasEncore" data-id="${m.id}">Pas encore</button></div></div>`)
    : html`<p class="empty">Rien à valider.</p>`);

  const demandes = E.demandes.filter((d) => d.statut === 'asked');
  remplir($('aDemandes'), demandes.length ? demandes.map((d) => html`
    <div class="row"><div class="ic">${IC(d.icone)}</div>
      <div><b>${d.titre}</b><span class="info">Pour ${prenom(E, d.pour)} · ${etoiles(d.prix)}</span></div>
      <div class="acts"><button class="yes" type="button" data-clic="donner" data-id="${d.id}">Récompense donnée ✓</button></div></div>`)
    : html`<p class="empty">Aucune demande.</p>`);

  const maintenant = app.stockage.maintenant();
  const evts = E.evenements.slice(0, nbHistorique);
  remplir($('aHistorique'), evts.length
    ? html`${evts.map((e) => html`<p class="hist">${L.ligneHistorique(e, maintenant)}</p>`)}
      ${E.evenements.length > nbHistorique ? html`<button class="plus" type="button" data-clic="plusHistorique">Voir plus</button>` : ''}`
    : html`<p class="empty">Rien pour le moment.</p>`);
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

function ecranMissions(E) {
  const liste = aides(E);
  // On ne garde que des personnes aidées qui existent encore ; s'il n'y en a qu'une, elle est choisie.
  [...formMission.pour].forEach((uid) => { if (!liste.some((a) => a.id === uid)) formMission.pour.delete(uid); });
  if (liste.length === 1) formMission.pour.add(liste[0].id);

  remplir($('nPour'), liste.length
    ? liste.map((a) => html`<button type="button" data-clic="nPour" data-id="${a.id}" aria-pressed="${formMission.pour.has(a.id)}">${a.prenom}</button>`)
    : html`<p class="aide">Invite d'abord une personne aidée (onglet Famille).</p>`);
  remplir($('nIcone'), L.ICONES_MISSION.map((k) => html`<button type="button" data-clic="nIcone" data-cle="${k}" aria-pressed="${k === formMission.icone}" aria-label="${LIBELLES[k]}" title="${LIBELLES[k]}"><span class="ic">${IC(k)}</span></button>`));
  remplir($('nEtoiles'), [1, 2, 3, 4, 5].map((n) => html`<button type="button" data-clic="nEtoiles" data-n="${n}" aria-pressed="${n === formMission.etoiles}" aria-label="${etoiles(n)}">${n} ${ET}</button>`));
  $('formMission').querySelector('[type=submit]').disabled = !liste.length;

  remplir($('aMissions'), liste.length ? liste.map((a) => {
    const ms = E.missions
      .filter((m) => m.pour === a.id && (m.statut !== 'ok' || m.quotidienne))
      .sort((x, y) => ({ wait: 0, todo: 1, ok: 2 }[x.statut] - { wait: 0, todo: 1, ok: 2 }[y.statut]));
    return html`<h3>${a.prenom}</h3>${ms.length ? ms.map((m) => ligneMission(m)) : html`<p class="empty">Aucune mission.</p>`}`;
  }) : '');

}

function ligneMission(m) {
  const faites = m.cochees.filter(Boolean).length;
  let statut;
  if (m.statut === 'wait') statut = html`<span class="statut attente">Fini, à vérifier</span>`;
  else if (m.statut === 'ok') statut = html`<span class="statut faite">Faite aujourd'hui ✓</span>`;
  else statut = html`<span class="statut">À faire${m.etapes.length ? ` · ${faites}/${m.etapes.length} étapes` : ''}</span>`;
  return html`<div class="row"><div class="ic">${IC(m.icone)}</div>
    <div><b>${m.titre}</b><span class="info">${etoiles(m.etoiles)}${m.quotidienne ? ' · chaque jour' : ''}</span>${statut}</div>
    <div class="acts droite"><button class="no" type="button" data-clic="supprimerMission" data-id="${m.id}">Supprimer</button></div></div>`;
}

async function envoyerMission(app) {
  const r = await app.faire(A.creerMissions, {
    titre: $('nTitre').value,
    icone: formMission.icone,
    etoiles: formMission.etoiles,
    etapes: $('nEtapes').value,
    quotidienne: $('nQuotidienne').checked,
  }, [...formMission.pour]);
  afficherErreurs('nErreur', r, { titre: 'nTitre', etapes: 'nEtapes' });
  if (!r.ok) return;
  const n = formMission.pour.size;
  $('nTitre').value = '';
  $('nEtapes').value = '';
  $('nQuotidienne').checked = false;
  app.ui.toast(n > 1 ? `${n} missions envoyées.` : 'Mission envoyée.');
}

// ---------------------------------------------------------------------------
// Récompenses
// ---------------------------------------------------------------------------

function ecranRecompenses(E) {
  const actives = L.recompensesActives(E.recompenses);
  remplir($('aRecompenses'), actives.length ? actives.map((r) => html`
    <div class="row"><div class="ic">${IC(r.icone)}</div>
      <div><b>${r.titre}</b><br><span class="pts">${r.prix} ${ET}</span></div>
      <div class="acts"><button class="no" type="button" data-clic="modifierRecompense" data-id="${r.id}">Modifier</button>
        <button class="no" type="button" data-clic="archiverRecompense" data-id="${r.id}">Archiver</button></div></div>`)
    : html`<p class="empty">Pas encore de récompense.</p>`);

  const archivees = E.recompenses.filter((r) => r.archivee);
  $('aArchivees').hidden = !archivees.length;
  remplir($('aArchiveesListe'), archivees.map((r) => html`
    <div class="row"><div class="ic">${IC(r.icone)}</div><div><b>${r.titre}</b><span class="info">${etoiles(r.prix)}</span></div>
      <div class="acts"><button class="no" type="button" data-clic="remettreRecompense" data-id="${r.id}">Remettre dans la liste</button></div></div>`));

  // Si la récompense en cours de modification a disparu, on revient à l'ajout.
  if (formRecompense.edition && !E.recompenses.some((r) => r.id === formRecompense.edition)) finEdition();
  rendreIconesRecompense();
}

function rendreIconesRecompense() {
  remplir($('rIcone'), L.ICONES_RECOMPENSE.map((k) => html`<button type="button" data-clic="rIcone" data-cle="${k}" aria-pressed="${k === formRecompense.icone}" aria-label="${LIBELLES[k]}" title="${LIBELLES[k]}"><span class="ic">${IC(k)}</span></button>`));
}

function debutEdition(r) {
  formRecompense.edition = r.id;
  formRecompense.icone = r.icone;
  $('rTitre').value = r.titre;
  $('rPrix').value = r.prix;
  $('rTitreForm').textContent = `Modifier : ${r.titre}`;
  $('rValider').textContent = 'Enregistrer';
  $('rAnnuler').hidden = false;
  rendreIconesRecompense();
  $('rTitreForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('rTitre').focus({ preventScroll: true });
}

function finEdition() {
  formRecompense.edition = null;
  $('rTitre').value = '';
  $('rPrix').value = '12';
  $('rTitreForm').textContent = 'Ajouter une récompense';
  $('rValider').textContent = 'Ajouter';
  $('rAnnuler').hidden = true;
  afficherErreurs('rErreur', { ok: true }, {});
}

async function envoyerRecompense(app) {
  const saisie = { titre: $('rTitre').value, icone: formRecompense.icone, prix: $('rPrix').value };
  const edition = formRecompense.edition;
  const r = edition
    ? await app.faire(A.modifierRecompense, edition, saisie)
    : await app.faire(A.ajouterRecompense, saisie);
  afficherErreurs('rErreur', r, { titre: 'rTitre', prix: 'rPrix' });
  if (!r.ok) return;
  finEdition();
  app.ui.toast(edition ? 'Récompense modifiée.' : 'Récompense ajoutée.');
}

// ---------------------------------------------------------------------------
// Famille
// ---------------------------------------------------------------------------

function ecranFamille(E, app) {
  const moi = E.moi.id;
  remplir($('aAidants'), aidants(E).map((m) => html`
    <div class="row simple"><div><b>${m.prenom}</b>${m.id === moi ? html`<span class="info">C'est toi</span>` : ''}</div>
      ${m.id === moi ? '' : html`<div class="acts"><button class="no" type="button" data-clic="retirer" data-id="${m.id}">Retirer</button></div>`}</div>`));

  const liste = aides(E);
  remplir($('aAides'), liste.length ? liste.map((m) => html`
    <div class="row simple"><div><b>${m.prenom}</b><span class="info">${etoiles(Math.max(0, L.donneesAide(E, m.id).solde))}</span></div>
      <div class="acts"><button class="no" type="button" data-clic="retirer" data-id="${m.id}">Retirer</button></div></div>`)
    : html`<p class="empty">Personne pour le moment. Invite la personne aidée ci-dessous.</p>`);

  const demo = app.stockage.mode === 'demo';
  remplir($('aInvitations'), E.invitations.length ? E.invitations.map((i) => html`
    <div class="row liste"><div><b>${i.prenom}</b><span class="info">${i.id} · ${i.role === 'aidant' ? 'aidant' : 'personne aidée'}</span></div>
      <div class="acts"><button class="no" type="button" data-clic="annulerInvitation" data-id="${i.id}">Annuler</button>
      ${demo ? html`<button class="no" type="button" data-clic="demoConnexion" data-id="${i.id}">Simuler sa connexion</button>` : ''}</div></div>`)
    : html`<p class="empty">Aucune invitation en attente.</p>`);
}

async function envoyerInvitation(app) {
  const role = document.querySelector('input[name=iRole]:checked')?.value;
  const r = await app.faire(A.inviter, { prenom: $('iPrenom').value, email: $('iEmail').value, role });
  afficherErreurs('iErreur', r, { prenom: 'iPrenom', email: 'iEmail' });
  if (!r.ok) return;
  $('iPrenom').value = '';
  $('iEmail').value = '';
  document.querySelectorAll('input[name=iRole]').forEach((x) => { x.checked = false; });
  app.ui.toast('Invitation enregistrée.');
}

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

/** Affiche les erreurs d'un formulaire et marque les champs concernés. */
function afficherErreurs(idMessage, resultat, champs) {
  const erreurs = resultat.erreurs || {};
  Object.entries(champs).forEach(([cle, id]) => {
    if (erreurs[cle]) $(id).setAttribute('aria-invalid', 'true');
    else $(id).removeAttribute('aria-invalid');
  });
  $(idMessage).textContent = Object.values(erreurs).join(' ');
}

/** À appeler une fois au démarrage : branche les formulaires. */
export function initialiser(app) {
  const soumettre = (id, fn) => $(id).addEventListener('submit', (e) => { e.preventDefault(); fn(app); });
  soumettre('formMission', envoyerMission);
  soumettre('formRecompense', envoyerRecompense);
  soumettre('formInvitation', envoyerInvitation);
  $('rAnnuler').addEventListener('click', finEdition);
}

/** Réactions aux boutons (attribut data-clic). */
export const CLICS = {
  valider: async (app, el) => {
    const m = app.etat.missions.find((x) => x.id === el.dataset.id);
    const r = await app.faire(A.validerMission, el.dataset.id);
    if (r.ok && m) app.ui.toast(`+${etoiles(m.etoiles)} pour ${prenom(app.etat, m.pour)}. Une petite fête l'attend.`);
  },
  pasEncore: async (app, el) => {
    const m = app.etat.missions.find((x) => x.id === el.dataset.id);
    const r = await app.faire(A.pasEncore, el.dataset.id);
    if (r.ok && m) app.ui.toast(`La mission revient dans la liste de ${prenom(app.etat, m.pour)}, sans perdre d'étoiles.`);
  },
  donner: async (app, el) => {
    const r = await app.faire(A.donnerRecompense, el.dataset.id);
    if (r.ok) app.ui.toast('C\'est noté !');
  },
  plusHistorique: (app) => { nbHistorique += PAS_HISTORIQUE; app.rafraichir(); },

  nPour: (app, el) => {
    const id = el.dataset.id;
    if (formMission.pour.has(id)) formMission.pour.delete(id); else formMission.pour.add(id);
    app.rafraichir();
  },
  nIcone: (app, el) => { formMission.icone = el.dataset.cle; app.rafraichir(); },
  nEtoiles: (app, el) => { formMission.etoiles = Number(el.dataset.n); app.rafraichir(); },
  supprimerMission: async (app, el) => {
    const m = app.etat.missions.find((x) => x.id === el.dataset.id);
    if (!m) return;
    const ok = await app.ui.confirmer({
      titre: 'Supprimer cette mission ?',
      texte: `« ${m.titre} » disparaîtra de la liste de ${prenom(app.etat, m.pour)}. Les étoiles déjà gagnées sont gardées.`,
      oui: 'Supprimer', danger: true,
    });
    if (ok && (await app.faire(A.supprimerMission, m.id)).ok) app.ui.toast('Mission supprimée.');
  },

  rIcone: (app, el) => { formRecompense.icone = el.dataset.cle; rendreIconesRecompense(); },
  modifierRecompense: (app, el) => {
    const r = app.etat.recompenses.find((x) => x.id === el.dataset.id);
    if (r) debutEdition(r);
  },
  archiverRecompense: async (app, el) => {
    const r = app.etat.recompenses.find((x) => x.id === el.dataset.id);
    if (!r) return;
    const ok = await app.ui.confirmer({
      titre: 'Archiver cette récompense ?',
      texte: `« ${r.titre} » ne sera plus proposée. Les demandes déjà faites ne changent pas. Tu pourras la remettre plus tard.`,
      oui: 'Archiver',
    });
    if (ok && (await app.faire(A.archiverRecompense, r.id, true)).ok) app.ui.toast('Récompense archivée.');
  },
  remettreRecompense: async (app, el) => {
    if ((await app.faire(A.archiverRecompense, el.dataset.id, false)).ok) app.ui.toast('Récompense remise dans la liste.');
  },

  retirer: async (app, el) => {
    const m = app.etat.membres.find((x) => x.id === el.dataset.id);
    if (!m) return;
    const texte = m.role === 'frere'
      ? `${m.prenom} n'aura plus accès à l'appli. Ses missions, ses étoiles et ses demandes seront supprimées.`
      : `${m.prenom} n'aura plus accès à la famille.`;
    const ok = await app.ui.confirmer({ titre: `Retirer ${m.prenom} ?`, texte, oui: 'Retirer', danger: true });
    if (ok && (await app.faire(A.retirerMembre, m.id)).ok) app.ui.toast(`${m.prenom} a été retiré(e) de la famille.`);
  },
  annulerInvitation: async (app, el) => {
    if ((await app.faire(A.annulerInvitation, el.dataset.id)).ok) app.ui.toast('Invitation annulée.');
  },
  supprimerTout: async (app) => {
    const ok = await app.ui.confirmer({
      titre: 'Tout supprimer ?',
      texte: 'La famille, ses membres, les missions, les étoiles, les récompenses et l\'historique seront supprimés pour tout le monde. On ne pourra pas revenir en arrière.',
      oui: 'Oui, tout supprimer', danger: true,
    });
    if (ok) await app.faire(A.supprimerFamille);
  },
};
