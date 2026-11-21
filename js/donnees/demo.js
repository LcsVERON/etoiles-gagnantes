// js/donnees/demo.js — stockage du MODE DÉMO : tout reste en mémoire et
// disparaît quand on recharge la page. Il expose la même interface que le
// stockage Firebase (étape 4) :
//   abonner(fn) → se désabonner ; fn(etat) est appelée à chaque changement
//   executer(ops) → Promise ; applique un lot d'écritures (js/actions.js)
//   nouvelId() ; maintenant()
// et, en plus, des commandes propres à la démo (objet `demo`).
//
// Les prénoms ci-dessous sont fictifs.

import { appliquer, baseVide, etatDe } from './memoire.js';
import * as A from '../actions.js';

const JOUR = 24 * 60 * 60 * 1000;

export function creerStockageDemo() {
  let decalage = 0; // « Passer au lendemain » avance l'horloge de la démo
  const maintenant = () => Date.now() + decalage;
  let compteur = 0;
  const nouvelId = () => `d${(++compteur).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  let base = exemple(maintenant());
  let moiUid = 'aidant1';
  const abonnes = new Set();

  const publier = () => {
    const etat = { ...etatDe(base, moiUid), mode: 'demo' };
    abonnes.forEach((fn) => fn(etat));
  };

  return {
    mode: 'demo',
    maintenant,
    nouvelId,
    abonner(fn) {
      abonnes.add(fn);
      queueMicrotask(() => fn({ ...etatDe(base, moiUid), mode: 'demo' }));
      return () => abonnes.delete(fn);
    },
    async executer(ops) {
      if (!ops.length) return;
      base = appliquer(base, ops, maintenant());
      queueMicrotask(publier);
    },
    demo: {
      changerUtilisateur(uid) { moiUid = uid; publier(); },
      jourSuivant() { decalage += JOUR; publier(); },
      /** Simule la première connexion d'une personne invitée. */
      simulerConnexion(email) {
        const inv = base.invites[email];
        if (!inv) return;
        const uid = nouvelId();
        base = appliquer(base, A.rejoindre({ id: email, ...inv }, uid, nouvelId), maintenant());
        publier();
      },
      recommencer() { base = exemple(maintenant()); moiUid = 'aidant1'; publier(); },
    },
  };
}

/** Famille d'exemple (prénoms fictifs). */
function exemple(t) {
  const b = baseVide();
  const il_y_a = (jours, heures = 0) => t - jours * JOUR - heures * 3600 * 1000;
  b.famille = { nom: 'Famille démo', creeeLe: il_y_a(30), creeePar: 'aidant1' };
  const m = (prenom, role, x = {}) => ({ prenom, role, objectif: null, fetesVuesJusqua: null, rejointLe: il_y_a(30), ...x });
  b.members = {
    aidant1: m('Camille', 'aidant'),
    aidant2: m('Dominique', 'aidant'),
    aide1: m('Alex', 'frere', { objectif: 'r1' }),
    aide2: m('Sam', 'frere'),
  };
  b.invites = { 'invite@example.com': { prenom: 'Charlie', role: 'aidant', invitePar: 'aidant1', creeLe: il_y_a(1) } };
  b.rewards = {
    r1: { titre: 'Glace', icone: 'glace', prix: 10, archivee: false, creeeLe: il_y_a(30) },
    r2: { titre: 'Cinéma', icone: 'cinema', prix: 15, archivee: false, creeeLe: il_y_a(30) },
    r3: { titre: 'Sortie au choix', icone: 'sortie', prix: 20, archivee: false, creeeLe: il_y_a(30) },
  };
  const tache = (titre, icone, etoiles, etapes, pour, x = {}) => ({
    titre, icone, etoiles, etapes, cochees: etapes.map(() => false), statut: 'todo', quotidienne: false,
    pour, creeePar: 'aidant1', creeeLe: il_y_a(2), valideePar: null, valideeLe: null, derniereValidation: null, ...x,
  });
  b.tasks = {
    t1: tache('Ranger ta chambre', 'chambre', 3, ['Les vêtements sales dans le panier', 'Les vêtements propres dans l\'armoire', 'Les objets sur l\'étagère', 'Faire le lit'], 'aide1'),
    t2: tache('Sortir les poubelles', 'poubelle', 1, ['Fermer le sac', 'Descendre le sac', 'Le mettre dans la grande poubelle'], 'aide1', { quotidienne: true, creeeLe: il_y_a(3) }),
    t3: tache('Marcher 30 minutes', 'marche', 3, ['Mettre les chaussures', 'Marcher jusqu\'au parc', 'Faire le tour du parc', 'Rentrer'], 'aide1'),
    t4: tache('Vider le lave-vaisselle', 'vaisselle', 2, ['Les assiettes dans le placard', 'Les verres dans le placard', 'Les couverts dans le tiroir'], 'aide1', { statut: 'wait', cochees: [true, true, true] }),
    t5: tache('Se brosser les dents', 'dents', 1, [], 'aide2', { quotidienne: true, statut: 'ok', valideePar: 'aidant2', valideeLe: il_y_a(0, 1), derniereValidation: 'v3' }),
    t6: tache('Arroser les plantes', 'plante', 2, ['Remplir l\'arrosoir', 'Arroser chaque plante', 'Ranger l\'arrosoir'], 'aide2'),
  };
  const v = (missionId, pour, titre, icone, etoiles, le) => ({ missionId, pour, titre, icone, etoiles, par: 'aidant1', le });
  b.validations = {
    v1: v('x1', 'aide1', 'Mettre la table', 'table', 2, il_y_a(1, 3)),
    v2: v('x2', 'aide1', 'Marcher 30 minutes', 'marche', 5, il_y_a(1, 2)),
    v3: v('t5', 'aide2', 'Se brosser les dents', 'dents', 1, il_y_a(0, 1)),
    v4: v('x3', 'aide2', 'Faire les courses', 'courses', 4, il_y_a(2)),
  };
  b.members.aide1.fetesVuesJusqua = il_y_a(1, 2);
  b.members.aide2.fetesVuesJusqua = il_y_a(0, 1);
  const e = (type, titre, etoiles, auteurUid, auteurNom, pourNom, le) => ({ type, titre, etoiles, auteurUid, auteurNom, pourNom, le });
  b.events = {
    e1: e('mission_validee', 'Faire les courses', 4, 'aidant1', 'Camille', 'Sam', il_y_a(2)),
    e2: e('mission_validee', 'Mettre la table', 2, 'aidant1', 'Camille', 'Alex', il_y_a(1, 3)),
    e3: e('mission_validee', 'Marcher 30 minutes', 5, 'aidant1', 'Camille', 'Alex', il_y_a(1, 2)),
    e4: e('membre_invite', 'Charlie', null, 'aidant1', 'Camille', '', il_y_a(1)),
    e5: e('mission_validee', 'Se brosser les dents', 1, 'aidant2', 'Dominique', 'Sam', il_y_a(0, 1)),
    e6: e('mission_terminee', 'Vider le lave-vaisselle', null, 'aide1', 'Alex', '', il_y_a(0, 0.5)),
  };
  return b;
}
