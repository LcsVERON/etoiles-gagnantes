// Tests de firestore.rules avec l'émulateur Firestore.
// Lancer : npm run test:regles
// Chaque règle a au moins un test « autorisé » (assertSucceeds) et un test
// « refusé » (assertFails).

import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../../js/actions.js';
import { ecrireLots } from '../../js/donnees/lots.js';
import {
  F, JOUR, fs, demarrer, arreter, remplir, sansRegles, db, ref, lire, ops, envoyer, faire, mission, fiche,
  assertFails, assertSucceeds,
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, collection, collectionGroup,
  query, where, serverTimestamp, increment, Timestamp,
} from './aide.js';

before(demarrer);
after(arreter);
beforeEach(remplir);

const evt = (uid, nom, x = {}) => ({
  type: 'mission_creee', titre: 'T', etoiles: null, auteurUid: uid, auteurNom: nom, pourNom: '', le: serverTimestamp(), ...x,
});

// =============================================================================
describe('lecture', () => {
  test('autorisé : un membre lit la famille et ses données', async () => {
    await assertSucceeds(getDoc(doc(db('x'), 'families', F)));
    for (const col of ['members', 'tasks', 'validations', 'rewards', 'redemptions', 'events']) {
      await assertSucceeds(getDocs(collection(db('x'), 'families', F, col)));
    }
  });

  test('refusé : une personne hors de la famille ne lit rien', async () => {
    await assertFails(getDoc(doc(db('ext'), 'families', F)));
    for (const col of ['members', 'invites', 'tasks', 'validations', 'rewards', 'redemptions', 'events']) {
      await assertFails(getDocs(collection(db('ext'), 'families', F, col)));
    }
  });

  test('refusé : sans connexion, rien', async () => {
    await assertFails(getDoc(doc(db(null), 'families', F)));
    await assertFails(getDoc(ref(null, 'tasks', 't1')));
  });

  test('invitations : autorisé aux aidants, refusé aux personnes aidées', async () => {
    await assertSucceeds(getDocs(collection(db('aid'), 'families', F, 'invites')));
    await assertFails(getDocs(collection(db('x'), 'families', F, 'invites')));
  });

  test('recherche de sa fiche (groupe de collections) : autorisé pour soi, refusé pour les autres', async () => {
    const q = (uid, cible) => getDocs(query(collectionGroup(db(uid), 'members'), where('uid', '==', cible)));
    const r = await assertSucceeds(q('x', 'x'));
    assert.equal(r.docs[0].ref.parent.parent.id, F);
    await assertSucceeds(q('ext', 'ext')); // ne trouve rien, mais a le droit de chercher
    await assertFails(q('ext', 'x'));
    await assertFails(getDocs(collectionGroup(db('ext'), 'members')));
  });

  test('recherche de son invitation : autorisé à son adresse vérifiée, refusé sinon', async () => {
    const q = (uid, email) => getDocs(query(collectionGroup(db(uid), 'invites'), where('email', '==', email)));
    const r = await assertSucceeds(q('n1', 'nouveau@example.com'));
    assert.equal(r.size, 1);
    await assertFails(q('ext', 'nouveau@example.com'));
    await assertFails(q('nv', 'nouveau@example.com'), 'adresse non vérifiée');
  });
});

// =============================================================================
describe('famille : création', () => {
  const G = 'fam2';
  const creation = (uid, prenom = 'Fondateur') => A.creerFamille({ nom: 'Nouvelle famille', moi: { id: uid, prenom }, nouvelId: () => `ev-${uid}` });

  test('autorisé : une personne vérifiée crée une famille et en devient aidant', async () => {
    await assertSucceeds(envoyer('ext', creation('ext'), G));
    assert.equal((await lire('families', G, 'members', 'ext')).role, 'aidant');
  });

  test('refusé : adresse non vérifiée', async () => {
    await assertFails(envoyer('nv', creation('nv'), G));
  });

  test('refusé : famille sans sa fiche d\'aidant', async () => {
    await assertFails(envoyer('ext', creation('ext').filter((o) => o.col === null), G));
  });

  test('refusé : se déclarer personne aidée en créant la famille', async () => {
    const o = creation('ext');
    o.find((x) => x.col === 'members').donnees.role = 'frere';
    await assertFails(envoyer('ext', o, G));
  });

  test('refusé : créer la famille au nom de quelqu\'un d\'autre', async () => {
    const o = creation('ext');
    o.find((x) => x.col === null).donnees.creeePar = 'aid';
    await assertFails(envoyer('ext', o, G));
  });

  test('refusé : prendre la place d\'une famille existante', async () => {
    await assertFails(envoyer('ext', creation('ext'), F));
  });

  test('refusé : fiche de fondateur avec des étoiles d\'avance', async () => {
    const o = creation('ext');
    o.find((x) => x.col === 'members').donnees.gagnees = 100;
    await assertFails(envoyer('ext', o, G));
  });
});

describe('famille : modification et suppression', () => {
  test('autorisé : un aidant renomme la famille', async () => {
    await assertSucceeds(updateDoc(doc(db('aid'), 'families', F), { nom: 'Autre nom' }));
  });

  test('refusé : une personne aidée renomme, ou un nom trop long, ou un champ inconnu', async () => {
    await assertFails(updateDoc(doc(db('x'), 'families', F), { nom: 'Autre nom' }));
    await assertFails(updateDoc(doc(db('aid'), 'families', F), { nom: 'x'.repeat(41) }));
    await assertFails(updateDoc(doc(db('aid'), 'families', F), { creeePar: 'aid2' }));
  });

  test('refusé : supprimer la famille sans la marquer « en suppression »', async () => {
    await assertFails(deleteDoc(doc(db('aid'), 'families', F)));
  });

  test('refusé : effacer l\'historique ou les récompenses hors suppression', async () => {
    await assertFails(deleteDoc(ref('aid', 'events', 'e0')));
    await assertFails(deleteDoc(ref('aid', 'rewards', 'r1')));
  });

  test('refusé : une personne aidée marque la famille « en suppression » ou la supprime', async () => {
    await assertFails(updateDoc(doc(db('x'), 'families', F), { suppression: true }));
    await sansRegles((d) => updateDoc(doc(d, 'families', F), { suppression: true }));
    await assertFails(deleteDoc(doc(db('x'), 'families', F)));
    await assertFails(deleteDoc(ref('x', 'events', 'e0')));
  });

  test('autorisé : un aidant supprime toutes les données (en plusieurs lots)', async () => {
    const liste = await ops('aid', A.supprimerFamille);
    // lots de 5 écritures pour vérifier que l'ordre suffit d'un lot à l'autre
    await assertSucceeds(ecrireLots(fs, db('aid'), F, liste, 5));
    assert.equal(await lire('families', F), null);
    for (const col of ['members', 'invites', 'tasks', 'validations', 'rewards', 'redemptions', 'events']) {
      for (const id of ['aid', 'x', 't1', 'v0', 'r1', 'd1', 'e0', 'nouveau@example.com']) {
        assert.equal(await lire('families', F, col, id), null, `${col}/${id}`);
      }
    }
  });
});

// =============================================================================
describe('invitations', () => {
  test('autorisé : un aidant invite', async () => {
    await assertSucceeds(faire('aid', A.inviter, { email: 'Quelqu.un@Example.com', prenom: 'Quelqu\'un', role: 'aidant' }));
    assert.equal((await lire('families', F, 'invites', 'quelqu.un@example.com')).role, 'aidant');
  });

  test('refusé : une personne aidée invite', async () => {
    await assertFails(setDoc(ref('x', 'invites', 'z@example.com'), {
      email: 'z@example.com', prenom: 'Z', role: 'aidant', invitePar: 'x', creeLe: serverTimestamp(),
    }));
  });

  test('refusé : invitation mal formée', async () => {
    const base = { email: 'z@example.com', prenom: 'Z', role: 'frere', invitePar: 'aid', creeLe: serverTimestamp() };
    await assertFails(setDoc(ref('aid', 'invites', 'Z@example.com'), { ...base, email: 'Z@example.com' }), 'majuscules');
    await assertFails(setDoc(ref('aid', 'invites', 'z@example.com'), { ...base, role: 'admin' }), 'rôle inconnu');
    await assertFails(setDoc(ref('aid', 'invites', 'z@example.com'), { ...base, email: 'autre@example.com' }), 'adresse différente');
    await assertFails(setDoc(ref('aid', 'invites', 'z@example.com'), { ...base, prenom: '' }), 'prénom vide');
    await assertFails(setDoc(ref('aid', 'invites', 'pas-une-adresse'), { ...base, email: 'pas-une-adresse' }), 'adresse invalide');
    await assertFails(setDoc(ref('aid', 'invites', 'z@example.com'), { ...base, invitePar: 'aid2' }), 'au nom d\'un autre');
    await assertFails(setDoc(ref('aid', 'invites', 'z@example.com'), { ...base, creeLe: Timestamp.now() }), 'date inventée');
  });

  test('refusé : modifier une invitation (même un aidant)', async () => {
    await assertFails(updateDoc(ref('aid', 'invites', 'nouveau@example.com'), { role: 'aidant' }));
  });

  test('autorisé : un aidant annule, la personne invitée refuse', async () => {
    await assertSucceeds(faire('aid', A.annulerInvitation, 'nouveau@example.com'));
    await remplir();
    await assertSucceeds(deleteDoc(ref('n1', 'invites', 'nouveau@example.com')));
  });

  test('refusé : une personne aidée ou extérieure supprime une invitation', async () => {
    await assertFails(deleteDoc(ref('x', 'invites', 'nouveau@example.com')));
    await assertFails(deleteDoc(ref('ext', 'invites', 'nouveau@example.com')));
  });
});

// =============================================================================
describe('membres : arrivée d\'une personne invitée', () => {
  const inv = { id: 'nouveau@example.com', prenom: 'Nouveau', role: 'frere' };
  const rejoindre = (uid, invitation = inv) => A.rejoindre(invitation, uid, () => `ev-${uid}`);

  test('autorisé : rejoindre avec le rôle et le prénom de l\'invitation', async () => {
    await assertSucceeds(envoyer('n1', rejoindre('n1')));
    const m = await lire('families', F, 'members', 'n1');
    assert.equal(m.role, 'frere');
    assert.equal(await lire('families', F, 'invites', 'nouveau@example.com'), null);
  });

  test('refusé : se donner un autre rôle que celui de l\'invitation', async () => {
    await assertFails(envoyer('n1', rejoindre('n1', { ...inv, role: 'aidant' })));
  });

  test('refusé : changer le prénom choisi par l\'aidant', async () => {
    await assertFails(envoyer('n1', rejoindre('n1', { ...inv, prenom: 'Autre' })));
  });

  test('refusé : garder l\'invitation (elle doit être consommée)', async () => {
    await assertFails(envoyer('n1', rejoindre('n1').filter((o) => o.col !== 'invites')));
  });

  test('refusé : adresse non vérifiée', async () => {
    await assertFails(envoyer('nv', rejoindre('nv')));
  });

  test('refusé : rejoindre sans invitation', async () => {
    await assertFails(envoyer('ext', A.rejoindre({ id: 'exterieur@example.com', prenom: 'E', role: 'aidant' }, 'ext', () => 'ev')));
  });

  test('refusé : créer la fiche de quelqu\'un d\'autre', async () => {
    await assertFails(setDoc(ref('n1', 'members', 'autre'), fiche('autre', 'Nouveau', 'frere', { rejointLe: serverTimestamp() })));
  });
});

// =============================================================================
describe('membres : modifications', () => {
  test('autorisé : la personne aidée choisit son objectif et mémorise la fête vue', async () => {
    await assertSucceeds(faire('x', A.choisirObjectif, 'r3'));
    await assertSucceeds(faire('x', A.marquerFeteVue, Date.now()));
    await assertSucceeds(updateDoc(ref('x', 'members', 'x'), { objectif: null }));
  });

  test('refusé : objectif archivé ou inconnu', async () => {
    await assertFails(updateDoc(ref('x', 'members', 'x'), { objectif: 'r2' }));
    await assertFails(updateDoc(ref('x', 'members', 'x'), { objectif: 'inconnue' }));
  });

  test('refusé : fête vue avec une valeur incorrecte', async () => {
    await assertFails(updateDoc(ref('x', 'members', 'x'), { fetesVuesJusqua: 'hier' }));
    await assertFails(updateDoc(ref('x', 'members', 'x'), { fetesVuesJusqua: -5 }));
  });

  test('refusé : changer son rôle ou son prénom (personne aidée comme aidant)', async () => {
    await assertFails(updateDoc(ref('x', 'members', 'x'), { role: 'aidant' }));
    await assertFails(updateDoc(ref('x', 'members', 'x'), { prenom: 'Autre' }));
    await assertFails(updateDoc(ref('aid', 'members', 'aid'), { role: 'frere' }));
    await assertFails(updateDoc(ref('aid', 'members', 'x'), { role: 'aidant' }));
    await assertFails(updateDoc(ref('aid', 'members', 'x'), { prenom: 'Autre' }));
  });

  test('refusé : toucher à la fiche d\'une autre personne aidée', async () => {
    await assertFails(updateDoc(ref('y', 'members', 'x'), { objectif: 'r1' }));
  });

  test('refusé : se donner des étoiles ou effacer ses dépenses', async () => {
    await assertFails(updateDoc(ref('x', 'members', 'x'), { gagnees: 100 }));
    await assertFails(updateDoc(ref('x', 'members', 'x'), { gagnees: increment(5) }));
    await assertFails(updateDoc(ref('x', 'members', 'x'), { depensees: 0 }));
    await assertFails(updateDoc(ref('x', 'members', 'x'), { depensees: increment(-3), derniereDemande: 'd1' }));
  });

  test('refusé : un aidant change un compteur sans validation', async () => {
    await assertFails(updateDoc(ref('aid', 'members', 'x'), { gagnees: increment(5), derniereValidation: 'inventee' }));
    await assertFails(updateDoc(ref('aid', 'members', 'x'), { gagnees: 0 }));
    await assertFails(updateDoc(ref('aid', 'members', 'x'), { depensees: 0 }));
  });
});

describe('membres : retrait', () => {
  test('autorisé : un aidant retire une personne aidée (et ses données)', async () => {
    await assertSucceeds(faire('aid', A.retirerMembre, 'x'));
    assert.equal(await lire('families', F, 'members', 'x'), null);
    assert.equal(await lire('families', F, 'validations', 'v0'), null);
    assert.equal(await lire('families', F, 'redemptions', 'd1'), null);
    assert.equal(await lire('families', F, 'tasks', 't1'), null);
  });

  test('autorisé : un aidant retire un autre aidant', async () => {
    await assertSucceeds(faire('aid', A.retirerMembre, 'aid2'));
  });

  test('refusé : un aidant se retire lui-même', async () => {
    await assertFails(deleteDoc(ref('aid', 'members', 'aid')));
  });

  test('refusé : une personne aidée retire quelqu\'un', async () => {
    await assertFails(deleteDoc(ref('x', 'members', 'y')));
    await assertFails(deleteDoc(ref('x', 'members', 'x')));
  });
});

// =============================================================================
describe('missions : création et suppression', () => {
  const saisie = { titre: 'Arroser', icone: 'plante', etoiles: 3, etapes: 'Remplir\nArroser', quotidienne: true };

  test('autorisé : un aidant crée une mission pour une ou deux personnes aidées', async () => {
    await assertSucceeds(faire('aid', A.creerMissions, saisie, ['x', 'y']));
  });

  test('refusé : une personne aidée crée une mission', async () => {
    await assertFails(setDoc(ref('x', 'tasks', 'tx'), mission('x', { creeePar: 'x', creeeLe: serverTimestamp() })));
  });

  test('refusé : missions mal formées', async () => {
    const m = (x) => mission('x', { creeeLe: serverTimestamp(), ...x });
    const essai = (x, raison) => assertFails(setDoc(ref('aid', 'tasks', 'tx'), m(x)), raison);
    await assertSucceeds(setDoc(ref('aid', 'tasks', 'tok'), m({})), 'témoin correct');
    await essai({ pour: 'aid2' }, 'pour un aidant');
    await essai({ pour: 'inconnu' }, 'pour une personne inconnue');
    await essai({ etoiles: 6 }, '6 étoiles');
    await essai({ etoiles: 0 }, '0 étoile');
    await essai({ etoiles: 2.5 }, 'étoiles non entières');
    await essai({ titre: '' }, 'titre vide');
    await essai({ titre: 'x'.repeat(61) }, 'titre trop long');
    await essai({ icone: 'burger' }, 'icône de récompense');
    await essai({ etapes: Array(13).fill('e'), cochees: Array(13).fill(false) }, '13 étapes');
    await essai({ etapes: ['ok', 'y'.repeat(81)] }, 'étape trop longue');
    await essai({ etapes: ['ok', 5] }, 'étape non texte');
    await essai({ cochees: [true, false] }, 'étape déjà cochée');
    await essai({ cochees: [false] }, 'cases en nombre différent');
    await essai({ statut: 'ok' }, 'déjà validée');
    await essai({ creeeLe: Timestamp.now() }, 'date inventée');
    await essai({ creeePar: 'aid2' }, 'au nom d\'un autre');
    await essai({ valideePar: 'aid' }, 'champ de validation rempli');
    await essai({ extra: 1 }, 'champ inconnu');
  });

  test('autorisé : un aidant supprime une mission, les étoiles restent', async () => {
    await assertSucceeds(faire('aid', A.supprimerMission, 'tq'));
    assert.equal((await lire('families', F, 'members', 'x')).gagnees, 10);
  });

  test('refusé : une personne aidée supprime une mission', async () => {
    await assertFails(deleteDoc(ref('x', 'tasks', 't1')));
  });
});

describe('missions : ce que fait la personne aidée', () => {
  test('autorisé : cocher puis décocher une étape de SA mission', async () => {
    await assertSucceeds(faire('x', A.cocherEtape, 't1', 0));
    await assertSucceeds(faire('x', A.cocherEtape, 't1', 0));
  });

  test('refusé : cocher une étape de la mission d\'un autre', async () => {
    await assertFails(updateDoc(ref('y', 'tasks', 't1'), { cochees: [true, false] }));
  });

  test('refusé : cocher n\'importe comment', async () => {
    await assertFails(updateDoc(ref('x', 'tasks', 't1'), { cochees: [true] }), 'nombre de cases');
    await assertFails(updateDoc(ref('x', 'tasks', 't1'), { cochees: [1, 0] }), 'pas des vrai/faux');
    await assertFails(updateDoc(ref('x', 'tasks', 't2'), { cochees: [false, false] }), 'mission en attente');
  });

  test('autorisé : « J\'ai fini » quand tout est coché', async () => {
    await faire('x', A.cocherEtape, 't1', 0);
    await faire('x', A.cocherEtape, 't1', 1);
    await assertSucceeds(faire('x', A.terminerMission, 't1'));
    assert.equal((await lire('families', F, 'tasks', 't1')).statut, 'wait');
  });

  test('refusé : « J\'ai fini » avec des étapes non cochées, ou tout cocher en même temps', async () => {
    await assertFails(updateDoc(ref('x', 'tasks', 't1'), { statut: 'wait' }));
    await assertFails(updateDoc(ref('x', 'tasks', 't1'), { statut: 'wait', cochees: [true, true] }));
  });

  test('refusé : se valider soi-même ou changer ses étoiles', async () => {
    await assertFails(updateDoc(ref('x', 'tasks', 't2'), { statut: 'ok' }));
    await assertFails(updateDoc(ref('x', 'tasks', 't1'), { etoiles: 5 }));
    await assertFails(updateDoc(ref('x', 'tasks', 't1'), { titre: 'Autre' }));
    await assertFails(updateDoc(ref('x', 'tasks', 't1'), { pour: 'y' }));
  });
});

describe('missions quotidiennes', () => {
  test('autorisé : remise à zéro d\'une mission validée un jour précédent (personne aidée ou aidant)', async () => {
    await assertSucceeds(faire('x', A.remisesAZero));
    const t = await lire('families', F, 'tasks', 'tq');
    assert.equal(t.statut, 'todo');
    assert.deepEqual(t.cochees, [false, false]);
    assert.equal((await lire('families', F, 'members', 'x')).gagnees, 10, 'étoiles gardées');
    await remplir();
    await assertSucceeds(faire('aid', A.remisesAZero));
  });

  test('refusé : remise à zéro le jour même, ou d\'une mission non quotidienne', async () => {
    await assertFails(updateDoc(ref('x', 'tasks', 'tq2'), { statut: 'todo', cochees: [false, false] }), 'le jour même');
    await assertFails(updateDoc(ref('aid', 'tasks', 'tq2'), { statut: 'todo', cochees: [false, false] }), 'le jour même (aidant)');
    await marquerValidee('t3');
    await assertFails(updateDoc(ref('aid', 'tasks', 't3'), { statut: 'todo', cochees: [false, false] }), 'non quotidienne');
    await assertFails(updateDoc(ref('x', 'tasks', 'tq'), { statut: 'todo', cochees: [false, true] }), 'étapes restées cochées');
    await assertFails(updateDoc(ref('y', 'tasks', 'tq'), { statut: 'todo', cochees: [false, false] }), 'mission d\'un autre');
  });
});

/** Met une mission à « validée il y a 2 jours », sans les règles (préparation). */
function marquerValidee(id) {
  return sansRegles((d) => updateDoc(doc(d, 'families', F, 'tasks', id), {
    statut: 'ok', valideePar: 'aid', valideeLe: Timestamp.fromMillis(Date.now() - 2 * JOUR),
  }));
}

// =============================================================================
describe('validation par un aidant', () => {
  test('autorisé : « C\'est fait ✓ » sur une mission en attente', async () => {
    await assertSucceeds(faire('aid', A.validerMission, 't2'));
    assert.equal((await lire('families', F, 'tasks', 't2')).statut, 'ok');
    assert.equal((await lire('families', F, 'members', 'x')).gagnees, 13);
  });

  test('autorisé : validation directe d\'une mission à faire', async () => {
    await assertSucceeds(faire('aid', A.validerMission, 't3'));
    assert.equal((await lire('families', F, 'members', 'y')).gagnees, 2);
  });

  test('autorisé : deux aidants valident en même temps (compteur sans écrasement)', async () => {
    const o1 = await ops('aid', A.validerMission, 't1');
    const o2 = await ops('aid2', A.validerMission, 't2');
    await Promise.all([assertSucceeds(envoyer('aid', o1)), assertSucceeds(envoyer('aid2', o2))]);
    assert.equal((await lire('families', F, 'members', 'x')).gagnees, 15);
  });

  test('refusé : une personne aidée valide', async () => {
    await assertFails(envoyer('x', await ops('aid', A.validerMission, 't2')));
  });

  test('refusé : valider sans créer de validation, ou sans augmenter le compteur', async () => {
    const o = await ops('aid', A.validerMission, 't2');
    await assertFails(envoyer('aid', o.filter((x) => x.col !== 'validations')), 'sans validation');
    await assertFails(envoyer('aid', o.filter((x) => x.col !== 'members')), 'sans compteur');
    await assertFails(envoyer('aid', o.filter((x) => x.col !== 'tasks')), 'sans changer la mission');
  });

  test('refusé : validation tricheuse (plus d\'étoiles, autre personne, compteur gonflé)', async () => {
    const base = await ops('aid', A.validerMission, 't2');
    const changer = (col, champs) => base.map((o) => (o.col === col ? { ...o, donnees: { ...o.donnees, ...champs } } : o));
    await assertFails(envoyer('aid', changer('validations', { etoiles: 5 })), 'étoiles différentes');
    await assertFails(envoyer('aid', changer('validations', { pour: 'y' })), 'autre personne');
    await assertFails(envoyer('aid', changer('members', { gagnees: A.incrementer(30) })), 'compteur gonflé');
    await assertFails(envoyer('aid', changer('validations', { le: Timestamp.now() })), 'date inventée');
  });

  test('refusé : valider deux fois la même mission', async () => {
    await faire('aid', A.validerMission, 't2');
    const { HORODATAGE, incrementer } = A;
    await assertFails(envoyer('aid', [
      { op: 'creer', col: 'validations', id: 'v-bis', donnees: { missionId: 't2', pour: 'x', titre: 'Vaisselle', icone: 'vaisselle', etoiles: 3, par: 'aid', le: HORODATAGE } },
      { op: 'modifier', col: 'tasks', id: 't2', donnees: { statut: 'ok', valideePar: 'aid', valideeLe: HORODATAGE, derniereValidation: 'v-bis' } },
      { op: 'modifier', col: 'members', id: 'x', donnees: { gagnees: incrementer(3), derniereValidation: 'v-bis' } },
    ]));
  });

  test('autorisé : « Pas encore », sans perdre d\'étoiles', async () => {
    await assertSucceeds(faire('aid', A.pasEncore, 't2'));
    const t = await lire('families', F, 'tasks', 't2');
    assert.equal(t.statut, 'todo');
    assert.deepEqual(t.cochees, [false, false]);
    assert.equal((await lire('families', F, 'members', 'x')).gagnees, 10);
  });

  test('refusé : « Pas encore » en gardant les cases cochées, ou par la personne aidée', async () => {
    await assertFails(updateDoc(ref('aid', 'tasks', 't2'), { statut: 'todo' }));
    await assertFails(updateDoc(ref('x', 'tasks', 't2'), { statut: 'todo', cochees: [false, false] }));
  });

  test('refusé : un aidant modifie le contenu d\'une mission', async () => {
    await assertFails(updateDoc(ref('aid', 'tasks', 't1'), { etoiles: 5 }));
    await assertFails(updateDoc(ref('aid', 'tasks', 't1'), { pour: 'y' }));
  });
});

describe('validations : modification et suppression', () => {
  test('refusé : modifier une validation (même un aidant)', async () => {
    await assertFails(updateDoc(ref('aid', 'validations', 'v0'), { etoiles: 1 }));
  });

  test('refusé : supprimer une validation d\'une personne aidée toujours là', async () => {
    await assertFails(deleteDoc(ref('aid', 'validations', 'v0')));
    await assertFails(deleteDoc(ref('x', 'validations', 'v0')));
  });

  test('autorisé : supprimer les validations d\'une personne déjà retirée', async () => {
    await faire('aid', A.retirerMembre, 'y');
    const o = (await ops('aid', A.retirerMembre, 'x')).filter((x) => x.col === 'members');
    await envoyer('aid', o);
    await assertSucceeds(deleteDoc(ref('aid', 'validations', 'v0')));
  });

  test('refusé : créer une validation sans mission', async () => {
    await assertFails(setDoc(ref('aid', 'validations', 'vz'), {
      missionId: 'inexistante', pour: 'x', titre: 'X', icone: 'lit', etoiles: 1, par: 'aid', le: serverTimestamp(),
    }));
  });
});

// =============================================================================
describe('récompenses', () => {
  test('autorisé : un aidant ajoute, modifie, archive et remet une récompense', async () => {
    await assertSucceeds(faire('aid', A.ajouterRecompense, { titre: 'Bowling', icone: 'bowling', prix: 12 }));
    await assertSucceeds(faire('aid', A.modifierRecompense, 'r1', { titre: 'Grande glace', icone: 'glace', prix: 6 }));
    await assertSucceeds(faire('aid', A.archiverRecompense, 'r1', true));
    await assertSucceeds(faire('aid', A.archiverRecompense, 'r1', false));
  });

  test('refusé : une personne aidée ajoute ou modifie une récompense', async () => {
    await assertFails(setDoc(ref('x', 'rewards', 'rz'), { titre: 'Z', icone: 'jeu', prix: 1, archivee: false, creeeLe: serverTimestamp() }));
    await assertFails(updateDoc(ref('x', 'rewards', 'r1'), { prix: 1 }));
  });

  test('refusé : récompenses mal formées', async () => {
    const r = (x) => ({ titre: 'Z', icone: 'jeu', prix: 10, archivee: false, creeeLe: serverTimestamp(), ...x });
    await assertFails(setDoc(ref('aid', 'rewards', 'rz'), r({ prix: 100 })), 'prix 100');
    await assertFails(setDoc(ref('aid', 'rewards', 'rz'), r({ prix: 0 })), 'prix 0');
    await assertFails(setDoc(ref('aid', 'rewards', 'rz'), r({ icone: 'plante' })), 'icône de mission');
    await assertFails(setDoc(ref('aid', 'rewards', 'rz'), r({ titre: 'x'.repeat(41) })), 'nom trop long');
    await assertFails(setDoc(ref('aid', 'rewards', 'rz'), r({ archivee: true })), 'déjà archivée');
    await assertFails(updateDoc(ref('aid', 'rewards', 'r1'), { prix: 0 }), 'modification à 0');
    await assertFails(updateDoc(ref('aid', 'rewards', 'r1'), { creeeLe: Timestamp.now() }), 'date de création');
  });

  test('refusé : supprimer une récompense hors suppression de la famille', async () => {
    await assertFails(deleteDoc(ref('aid', 'rewards', 'r1')));
  });
});

// =============================================================================
describe('demandes de récompense', () => {
  test('autorisé : « Je veux » quand il y a assez d\'étoiles', async () => {
    await assertSucceeds(faire('x', A.demanderRecompense, 'r1'));
    assert.equal((await lire('families', F, 'members', 'x')).depensees, 8);
  });

  test('refusé : pas assez d\'étoiles (même en trichant avec l\'appli)', async () => {
    // y a 0 étoile : on fabrique les écritures que l'appli refuserait.
    const { HORODATAGE, incrementer } = A;
    await assertFails(envoyer('y', [
      { op: 'creer', col: 'redemptions', id: 'dz', donnees: { recompenseId: 'r1', titre: 'Glace', icone: 'glace', prix: 5, statut: 'asked', pour: 'y', demandeeLe: HORODATAGE, donneePar: null, donneeLe: null } },
      { op: 'modifier', col: 'members', id: 'y', donnees: { depensees: incrementer(5), derniereDemande: 'dz' } },
    ]));
    // x a 7 étoiles : la récompense à 50 est refusée.
    await assertFails(envoyer('x', [
      { op: 'creer', col: 'redemptions', id: 'dz', donnees: { recompenseId: 'r3', titre: 'Cinéma', icone: 'cinema', prix: 50, statut: 'asked', pour: 'x', demandeeLe: HORODATAGE, donneePar: null, donneeLe: null } },
      { op: 'modifier', col: 'members', id: 'x', donnees: { depensees: incrementer(50), derniereDemande: 'dz' } },
    ]));
  });

  test('refusé : demande tricheuse', async () => {
    const base = await ops('x', A.demanderRecompense, 'r1');
    const changer = (col, champs) => base.map((o) => (o.col === col ? { ...o, donnees: { ...o.donnees, ...champs } } : o));
    await assertFails(envoyer('x', changer('redemptions', { prix: 1 })), 'prix plus bas');
    await assertFails(envoyer('x', changer('members', { depensees: A.incrementer(1) })), 'compteur trop bas');
    await assertFails(envoyer('x', base.filter((o) => o.col !== 'members')), 'sans compteur');
    await assertFails(envoyer('x', changer('redemptions', { statut: 'given' })), 'déjà donnée');
    await assertFails(envoyer('x', changer('redemptions', { pour: 'y' })), 'pour un autre');
    await assertFails(envoyer('x', changer('redemptions', { titre: 'Autre' })), 'titre différent');
  });

  test('refusé : récompense archivée', async () => {
    const { HORODATAGE, incrementer } = A;
    await assertFails(envoyer('x', [
      { op: 'creer', col: 'redemptions', id: 'dz', donnees: { recompenseId: 'r2', titre: 'Vieux jeu', icone: 'jeu', prix: 2, statut: 'asked', pour: 'x', demandeeLe: HORODATAGE, donneePar: null, donneeLe: null } },
      { op: 'modifier', col: 'members', id: 'x', donnees: { depensees: incrementer(2), derniereDemande: 'dz' } },
    ]));
  });

  test('refusé : un aidant fait une demande', async () => {
    await assertFails(envoyer('aid', await ops('x', A.demanderRecompense, 'r1')));
  });

  test('autorisé : un aidant marque la récompense donnée', async () => {
    await assertSucceeds(faire('aid', A.donnerRecompense, 'd1'));
    assert.equal((await lire('families', F, 'redemptions', 'd1')).statut, 'given');
  });

  test('refusé : la personne aidée se la marque donnée, ou retour en arrière', async () => {
    await assertFails(updateDoc(ref('x', 'redemptions', 'd1'), { statut: 'given', donneePar: 'x', donneeLe: serverTimestamp() }));
    await faire('aid', A.donnerRecompense, 'd1');
    await assertFails(updateDoc(ref('aid', 'redemptions', 'd1'), { statut: 'asked' }));
  });

  test('refusé : supprimer une demande (cela rendrait des étoiles)', async () => {
    await assertFails(deleteDoc(ref('aid', 'redemptions', 'd1')));
    await assertFails(deleteDoc(ref('x', 'redemptions', 'd1')));
  });
});

// =============================================================================
describe('historique', () => {
  test('autorisé : un aidant écrit un événement, une personne aidée « mission terminée »', async () => {
    await assertSucceeds(setDoc(ref('aid', 'events', 'ea'), evt('aid', 'Aidant A')));
    await assertSucceeds(setDoc(ref('x', 'events', 'ex'), evt('x', 'Aidé X', { type: 'mission_terminee' })));
  });

  test('refusé : une personne aidée écrit un événement d\'aidant', async () => {
    await assertFails(setDoc(ref('x', 'events', 'ex'), evt('x', 'Aidé X', { type: 'mission_validee', etoiles: 50 })));
  });

  test('refusé : se faire passer pour quelqu\'un d\'autre', async () => {
    await assertFails(setDoc(ref('x', 'events', 'ex'), evt('aid', 'Aidant A', { type: 'mission_terminee' })), 'autre auteur');
    await assertFails(setDoc(ref('x', 'events', 'ex'), evt('x', 'Aidant A', { type: 'mission_terminee' })), 'autre nom');
  });

  test('refusé : événement mal formé, ou par une personne hors de la famille', async () => {
    await assertFails(setDoc(ref('aid', 'events', 'ea'), evt('aid', 'Aidant A', { le: Timestamp.now() })), 'date inventée');
    await assertFails(setDoc(ref('aid', 'events', 'ea'), evt('aid', 'Aidant A', { type: 'inconnu' })), 'type inconnu');
    await assertFails(setDoc(ref('aid', 'events', 'ea'), evt('aid', 'Aidant A', { titre: 'x'.repeat(61) })), 'titre trop long');
    await assertFails(setDoc(ref('aid', 'events', 'ea'), { ...evt('aid', 'Aidant A'), extra: true }), 'champ inconnu');
    await assertFails(setDoc(ref('ext', 'events', 'ee'), evt('ext', 'Extérieur')), 'hors famille');
  });

  test('refusé : modifier ou effacer l\'historique', async () => {
    await assertFails(updateDoc(ref('aid', 'events', 'e0'), { titre: 'Autre' }));
    await assertFails(deleteDoc(ref('aid', 'events', 'e0')));
  });
});
