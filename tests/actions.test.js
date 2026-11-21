// Tests des actions (js/actions.js) appliquées à la base en mémoire.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../js/actions.js';
import * as L from '../js/logique.js';
import { appliquer, baseVide, etatDe } from '../js/donnees/memoire.js';
import { CLES_ICONES, LIBELLES } from '../js/icones.js';

const JOUR = 24 * 3600 * 1000;
const T0 = new Date(2026, 10, 21, 10, 0).getTime();

/** Petite famille de test : un aidant, deux personnes aidées, une récompense. */
function monde() {
  let base = baseVide();
  let n = 0;
  let t = T0;
  const nouvelId = () => `id${++n}`;
  base = appliquer(base, A.creerFamille({ nom: 'Famille test', moi: { id: 'aid', prenom: 'Aidant A' }, nouvelId }), t);
  for (const [uid, prenom, role] of [['x', 'Aidé X', 'frere'], ['y', 'Aidé Y', 'frere'], ['aid2', 'Aidant B', 'aidant']]) {
    base = appliquer(base, A.inviter(etatDe(base, 'aid'), { moi: etatDe(base, 'aid').moi, nouvelId }, { email: `${uid}@example.com`, prenom, role }), t);
    base = appliquer(base, A.rejoindre({ id: `${uid}@example.com`, prenom, role }, uid, nouvelId), t);
  }
  const w = {
    get base() { return base; },
    etat: (uid) => etatDe(base, uid),
    avancer: (ms) => { t += ms; },
    /** Exécute une action en tant que `uid`. */
    faire(uid, action, ...args) {
      const E = etatDe(base, uid);
      const ops = action(E, { moi: E.moi, nouvelId, maintenant: t }, ...args);
      base = appliquer(base, ops, t);
      return ops;
    },
    solde: (uid) => L.donneesAide(etatDe(base, uid), uid).solde,
  };
  w.faire('aid', A.ajouterRecompense, { titre: 'Glace', icone: 'glace', prix: 3 });
  return w;
}

const idMission = (w, titre) => w.etat('aid').missions.find((m) => m.titre === titre).id;
const idRecompense = (w, titre) => w.etat('aid').recompenses.find((r) => r.titre === titre).id;

describe('famille et invitations', () => {
  test('création et arrivée des membres avec le rôle de l\'invitation', () => {
    const w = monde();
    const E = w.etat('aid');
    assert.equal(E.famille.nom, 'Famille test');
    assert.deepEqual(E.membres.map((m) => `${m.id}:${m.role}`).sort(), ['aid2:aidant', 'aid:aidant', 'x:frere', 'y:frere']);
    assert.equal(E.invitations.length, 0, 'invitations consommées');
    assert.ok(E.evenements.some((e) => e.type === 'famille_creee'));
  });

  test('saisies invalides de création de famille', () => {
    assert.throws(() => A.creerFamille({ nom: ' ', moi: { id: 'a', prenom: '' }, nouvelId: () => 'z' }), A.ErreurSaisie);
  });

  test('une personne aidée ne peut pas inviter', () => {
    const w = monde();
    assert.throws(() => w.faire('x', A.inviter, { email: 'z@example.com', prenom: 'Z', role: 'aidant' }), /aidants/);
  });

  test('invitation en double refusée', () => {
    const w = monde();
    w.faire('aid', A.inviter, { email: 'z@example.com', prenom: 'Z', role: 'frere' });
    assert.throws(() => w.faire('aid', A.inviter, { email: 'Z@Example.com', prenom: 'Z', role: 'frere' }), /déjà invitée/);
    w.faire('aid', A.annulerInvitation, 'z@example.com');
    assert.equal(w.etat('aid').invitations.length, 0);
  });
});

describe('parcours d\'une mission', () => {
  test('créer pour deux personnes : une copie chacune', () => {
    const w = monde();
    w.faire('aid', A.creerMissions, { titre: 'Ranger', icone: 'chambre', etoiles: 2, etapes: 'A\nB' }, ['x', 'y']);
    const ms = w.etat('aid').missions;
    assert.deepEqual(ms.map((m) => m.pour).sort(), ['x', 'y']);
    assert.ok(ms.every((m) => m.statut === 'todo' && m.cochees.length === 2));
  });

  test('créer sans destinataire : erreur de saisie', () => {
    const w = monde();
    assert.throws(() => w.faire('aid', A.creerMissions, { titre: 'R', icone: 'lit', etoiles: 1 }, []), (e) => e instanceof A.ErreurSaisie && !!e.erreurs.pour);
    assert.throws(() => w.faire('aid', A.creerMissions, { titre: 'R', icone: 'lit', etoiles: 1 }, ['aid2']), A.ErreurSaisie, 'un aidant n\'est pas une personne aidée');
  });

  test('cocher, finir, valider : les étoiles arrivent', () => {
    const w = monde();
    w.faire('aid', A.creerMissions, { titre: 'Ranger', icone: 'chambre', etoiles: 2, etapes: 'A\nB' }, ['x']);
    const id = idMission(w, 'Ranger');
    assert.throws(() => w.faire('x', A.terminerMission, id), /Coche/);
    w.faire('x', A.cocherEtape, id, 0);
    w.faire('x', A.cocherEtape, id, 1);
    w.faire('x', A.terminerMission, id);
    assert.equal(w.etat('x').missions[0].statut, 'wait');
    assert.throws(() => w.faire('x', A.cocherEtape, id, 0), /finie/);
    assert.equal(w.solde('x'), 0);
    w.faire('aid', A.validerMission, id);
    assert.equal(w.solde('x'), 2);
    assert.equal(w.solde('y'), 0, 'l\'autre personne aidée ne gagne rien');
    const m = w.etat('aid').missions[0];
    assert.equal(m.statut, 'ok');
    assert.equal(m.valideePar, 'aid');
    assert.equal(w.etat('aid').validations[0].id, m.derniereValidation);
  });

  test('« Pas encore » : retour, étapes décochées, aucune étoile retirée', () => {
    const w = monde();
    w.faire('aid', A.creerMissions, { titre: 'Ranger', icone: 'chambre', etoiles: 2, etapes: 'A' }, ['x']);
    w.faire('aid', A.creerMissions, { titre: 'Marcher', icone: 'marche', etoiles: 3 }, ['x']);
    w.faire('x', A.terminerMission, idMission(w, 'Marcher'));
    w.faire('aid', A.validerMission, idMission(w, 'Marcher'));
    const id = idMission(w, 'Ranger');
    w.faire('x', A.cocherEtape, id, 0);
    w.faire('x', A.terminerMission, id);
    w.faire('aid', A.pasEncore, id);
    const m = w.etat('x').missions.find((x) => x.id === id);
    assert.equal(m.statut, 'todo');
    assert.deepEqual(m.cochees, [false]);
    assert.equal(w.solde('x'), 3);
  });

  test('une personne aidée ne touche pas aux missions des autres et ne valide pas', () => {
    const w = monde();
    w.faire('aid', A.creerMissions, { titre: 'Ranger', icone: 'chambre', etoiles: 2, etapes: 'A' }, ['x']);
    const id = idMission(w, 'Ranger');
    assert.throws(() => w.faire('y', A.cocherEtape, id, 0), /pas ta mission/);
    w.faire('x', A.cocherEtape, id, 0);
    w.faire('x', A.terminerMission, id);
    assert.throws(() => w.faire('x', A.validerMission, id), /aidants/);
    assert.throws(() => w.faire('aid', A.cocherEtape, id, 0), /personne aidée/);
  });

  test('supprimer une mission validée garde les étoiles', () => {
    const w = monde();
    w.faire('aid', A.creerMissions, { titre: 'Marcher', icone: 'marche', etoiles: 3 }, ['x']);
    const id = idMission(w, 'Marcher');
    w.faire('x', A.terminerMission, id);
    w.faire('aid', A.validerMission, id);
    w.faire('aid', A.supprimerMission, id);
    assert.equal(w.etat('aid').missions.length, 0);
    assert.equal(w.solde('x'), 3);
  });
});

describe('missions quotidiennes', () => {
  test('revient le lendemain, étoiles gardées, et peut être regagnée', () => {
    const w = monde();
    w.faire('aid', A.creerMissions, { titre: 'Dents', icone: 'dents', etoiles: 1, etapes: 'Brosser', quotidienne: true }, ['x']);
    const id = idMission(w, 'Dents');
    const jour = () => {
      w.faire('x', A.cocherEtape, id, 0);
      w.faire('x', A.terminerMission, id);
      w.faire('aid', A.validerMission, id);
    };
    jour();
    assert.deepEqual(w.faire('x', A.remisesAZero), [], 'même jour : rien à remettre');
    w.avancer(JOUR);
    assert.equal(w.faire('x', A.remisesAZero).length, 1);
    const m = w.etat('x').missions[0];
    assert.equal(m.statut, 'todo');
    assert.deepEqual(m.cochees, [false]);
    assert.equal(w.solde('x'), 1, 'la remise à zéro ne retire rien');
    jour();
    assert.equal(w.solde('x'), 2);
  });

  test('une personne aidée ne remet à zéro que ses missions', () => {
    const w = monde();
    w.faire('aid', A.creerMissions, { titre: 'Dents', icone: 'dents', etoiles: 1, quotidienne: true }, ['x', 'y']);
    for (const uid of ['x', 'y']) {
      const id = w.etat(uid).missions.find((m) => m.pour === uid).id;
      w.faire(uid, A.terminerMission, id);
      w.faire('aid', A.validerMission, id);
    }
    w.avancer(JOUR);
    assert.equal(w.faire('x', A.remisesAZero).length, 1);
    assert.equal(w.faire('aid', A.remisesAZero).length, 1, 'l\'aidant remet celle de y');
  });
});

describe('récompenses', () => {
  function avecEtoiles(n) {
    const w = monde();
    w.faire('aid', A.creerMissions, { titre: 'M', icone: 'lit', etoiles: n }, ['x']);
    const id = idMission(w, 'M');
    w.faire('x', A.terminerMission, id);
    w.faire('aid', A.validerMission, id);
    return w;
  }

  test('demander quand on a assez, puis donner', () => {
    const w = avecEtoiles(4);
    const r = idRecompense(w, 'Glace');
    w.faire('x', A.demanderRecompense, r);
    assert.equal(w.solde('x'), 1);
    assert.throws(() => w.faire('x', A.demanderRecompense, r), /assez/, 'déjà demandée');
    const d = w.etat('aid').demandes[0];
    assert.equal(d.prix, 3);
    assert.equal(d.pour, 'x');
    assert.throws(() => w.faire('x', A.donnerRecompense, d.id), /aidants/);
    w.faire('aid', A.donnerRecompense, d.id);
    assert.equal(w.etat('aid').demandes[0].statut, 'given');
    assert.equal(w.solde('x'), 1);
    assert.throws(() => w.faire('aid', A.donnerRecompense, d.id), /Déjà/);
  });

  test('pas assez d\'étoiles : refusé', () => {
    const w = avecEtoiles(2);
    assert.throws(() => w.faire('x', A.demanderRecompense, idRecompense(w, 'Glace')), /assez/);
  });

  test('changer le prix ne change pas les demandes déjà faites', () => {
    const w = avecEtoiles(5);
    const r = idRecompense(w, 'Glace');
    w.faire('x', A.demanderRecompense, r);
    w.faire('aid', A.modifierRecompense, r, { titre: 'Glace', icone: 'glace', prix: 50 });
    assert.equal(w.solde('x'), 2);
  });

  test('objectif, archivage et remise dans la liste', () => {
    const w = monde();
    const r = idRecompense(w, 'Glace');
    w.faire('x', A.choisirObjectif, r);
    assert.equal(w.etat('x').moi.objectif, r);
    assert.throws(() => w.faire('aid', A.choisirObjectif, r), /personne aidée/);
    w.faire('aid', A.archiverRecompense, r, true);
    assert.throws(() => w.faire('x', A.choisirObjectif, r), /n'existe plus/);
    assert.throws(() => w.faire('aid', A.archiverRecompense, r, true), /Déjà/);
    w.faire('aid', A.archiverRecompense, r, false);
    assert.equal(w.etat('x').recompenses[0].archivee, false);
  });

  test('saisie de récompense invalide', () => {
    const w = monde();
    assert.throws(() => w.faire('aid', A.ajouterRecompense, { titre: '', icone: 'glace', prix: 0 }), A.ErreurSaisie);
  });
});

describe('fête et membres', () => {
  test('marquerFeteVue', () => {
    const w = monde();
    w.faire('x', A.marquerFeteVue, 123);
    assert.equal(w.etat('x').moi.fetesVuesJusqua, 123);
    assert.throws(() => w.faire('x', A.marquerFeteVue, -1));
    assert.throws(() => w.faire('aid', A.marquerFeteVue, 1));
  });

  test('retirer une personne aidée supprime ses données, pas celles des autres', () => {
    const w = monde();
    w.faire('aid', A.creerMissions, { titre: 'M', icone: 'lit', etoiles: 4 }, ['x', 'y']);
    for (const uid of ['x', 'y']) {
      const id = w.etat(uid).missions.find((m) => m.pour === uid).id;
      w.faire(uid, A.terminerMission, id);
      w.faire('aid', A.validerMission, id);
    }
    w.faire('x', A.demanderRecompense, idRecompense(w, 'Glace'));
    w.faire('aid', A.retirerMembre, 'x');
    const E = w.etat('aid');
    assert.ok(!E.membres.some((m) => m.id === 'x'));
    assert.ok([...E.missions, ...E.validations, ...E.demandes].every((d) => d.pour !== 'x'));
    assert.equal(w.solde('y'), 4);
  });

  test('un aidant ne peut pas se retirer lui-même', () => {
    const w = monde();
    assert.throws(() => w.faire('aid', A.retirerMembre, 'aid'), /toi-même/);
    w.faire('aid', A.retirerMembre, 'aid2');
    assert.equal(w.etat('aid').membres.filter((m) => m.role === 'aidant').length, 1);
    assert.throws(() => w.faire('x', A.retirerMembre, 'y'), /aidants/);
  });

  test('supprimer la famille efface tout', () => {
    const w = monde();
    w.faire('aid', A.creerMissions, { titre: 'M', icone: 'lit', etoiles: 1 }, ['x']);
    w.faire('aid', A.inviter, { email: 'z@example.com', prenom: 'Z', role: 'frere' });
    w.faire('aid', A.supprimerFamille);
    const b = w.base;
    assert.equal(b.famille, null);
    for (const col of ['members', 'invites', 'tasks', 'validations', 'rewards', 'redemptions', 'events']) {
      assert.deepEqual(b[col], {}, col);
    }
  });
});

describe('base en mémoire', () => {
  test('lot tout ou rien', () => {
    const b = baseVide();
    assert.throws(() => appliquer(b, [
      { op: 'creer', col: 'tasks', id: 'a', donnees: {} },
      { op: 'modifier', col: 'tasks', id: 'absent', donnees: {} },
    ], 0));
    assert.deepEqual(b.tasks, {}, 'la base d\'origine n\'a pas bougé');
  });

  test('HORODATAGE est remplacé par la date', () => {
    const b = appliquer(baseVide(), [{ op: 'creer', col: 'events', id: 'e', donnees: { le: A.HORODATAGE } }], 42);
    assert.equal(b.events.e.le, 42);
  });
});

describe('icônes', () => {
  test('chaque clé autorisée a un dessin et un nom', () => {
    for (const k of [...L.ICONES_MISSION, ...L.ICONES_RECOMPENSE]) {
      assert.ok(CLES_ICONES.includes(k), `dessin manquant : ${k}`);
      assert.ok(LIBELLES[k], `nom manquant : ${k}`);
    }
    assert.equal(CLES_ICONES.length, L.ICONES_MISSION.length + L.ICONES_RECOMPENSE.length);
  });
});
