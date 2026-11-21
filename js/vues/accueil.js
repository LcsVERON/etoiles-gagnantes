// js/vues/accueil.js — écrans avant d'entrer dans une famille : configuration
// manquante, connexion, fin de connexion par lien, invitation ou création de
// la famille.

import { html, remplir } from '../html.js';
import { ErreurSaisie } from '../actions.js';
import { messageErreur } from '../erreurs.js';

const $ = (id) => document.getElementById(id);

export const PHASES = ['config', 'connexion', 'lien', 'accueil'];

const nomRole = (role) => (role === 'aidant' ? 'aidant(e)' : 'personne aidée');

export function rendre(app) {
  const E = app.etat;
  if (E.phase !== 'accueil') return;
  const u = E.utilisateur;
  $('accCompte').textContent = u?.email ? `Tu es connecté(e) avec ${u.email}.` : 'Tu es connecté(e).';
  const invitations = E.invitationsRecues || [];
  remplir($('accInvitations'), invitations.map((inv, k) => html`
    <div class="row liste"><div><b>Une invitation t'attend</b>
      <span class="info">Tu rejoindras une famille comme ${nomRole(inv.role)}, avec le prénom « ${inv.prenom} ».</span></div>
      <div class="acts"><button class="yes" type="button" data-clic="rejoindre" data-index="${k}">Rejoindre la famille</button></div></div>`));
  $('accSansInvitation').hidden = invitations.length > 0;
  // Proposition de prénom : le premier mot du nom du compte Google, s'il existe.
  if (!$('cPrenom').value && u?.nom) $('cPrenom').value = u.nom.split(' ')[0].slice(0, 30);
}

function erreurs(idMessage, e, champs = {}) {
  const liste = e instanceof ErreurSaisie ? e.erreurs : (e ? { general: messageErreur(e) } : {});
  Object.entries(champs).forEach(([cle, id]) => {
    if (liste[cle]) $(id).setAttribute('aria-invalid', 'true');
    else $(id).removeAttribute('aria-invalid');
  });
  $(idMessage).textContent = Object.values(liste).join(' ');
}

/** Empêche un double envoi pendant une opération. */
async function occupe(form, fn) {
  const bouton = form.querySelector('[type=submit]');
  if (bouton.disabled) return;
  bouton.disabled = true;
  try { await fn(); } finally { bouton.disabled = false; }
}

export function initialiser(app) {
  const connexion = () => app.stockage.connexion;

  $('formLien').addEventListener('submit', (ev) => {
    ev.preventDefault();
    occupe($('formLien'), async () => {
      try {
        const email = await connexion().envoyerLien($('lEmail').value);
        erreurs('lErreur', null, { email: 'lEmail' });
        $('lEnvoye').hidden = false;
        $('lEnvoye').textContent = `C'est envoyé ! Ouvre l'e-mail reçu à ${email} et touche le lien, sur cet appareil. Pense à regarder dans les indésirables.`;
      } catch (e) {
        erreurs('lErreur', e, { email: 'lEmail' });
      }
    });
  });

  $('formLienConfirmer').addEventListener('submit', (ev) => {
    ev.preventDefault();
    occupe($('formLienConfirmer'), async () => {
      try {
        await connexion().terminerLien($('lcEmail').value);
      } catch (e) {
        erreurs('lcErreur', e, { email: 'lcEmail' });
        app.ui.toast(messageErreur(e));
      }
    });
  });

  $('formFamille').addEventListener('submit', (ev) => {
    ev.preventDefault();
    occupe($('formFamille'), async () => {
      try {
        await connexion().creerFamille({ nom: $('cNom').value, prenom: $('cPrenom').value });
        erreurs('cErreur', null, { nom: 'cNom', prenom: 'cPrenom' });
        app.ui.toast('La famille est créée. Ajoute des récompenses, puis invite les autres membres.');
      } catch (e) {
        erreurs('cErreur', e, { nom: 'cNom', prenom: 'cPrenom' });
      }
    });
  });
}

/** Réactions aux boutons (valables quelle que soit la phase). */
export const CLICS = {
  connexionGoogle: async (app) => {
    try { await app.stockage.connexion.google(); } catch (e) { app.ui.toast(messageErreur(e)); }
  },
  deconnecter: async (app) => {
    const ok = await app.ui.confirmer({
      titre: 'Se déconnecter ?',
      texte: 'Sur ce téléphone, il faudra se reconnecter pour revenir dans l\'appli.',
      oui: 'Se déconnecter',
    });
    if (ok) await app.stockage.connexion.deconnecter();
  },
  rejoindre: async (app, el) => {
    const inv = (app.etat.invitationsRecues || [])[Number(el.dataset.index)];
    if (!inv) return;
    el.disabled = true;
    try {
      await app.stockage.connexion.rejoindre(inv);
      app.ui.toast('Bienvenue dans la famille !');
    } catch (e) {
      el.disabled = false;
      app.ui.toast(messageErreur(e));
    }
  },
  montrerCreation: () => {
    $('formFamille').hidden = false;
    $('cNom').focus();
  },
};
