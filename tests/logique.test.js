// Tests des fonctions pures de js/logique.js — lancer avec : node --test tests/
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logique.js';

// Dates construites en heure locale : les tests ne dépendent pas du fuseau.
const le = (j, h = 10, min = 0) => new Date(2026, 10, j, h, min); // novembre 2026
const MAINTENANT = le(21, 9);

const mission = (x = {}) => ({
  id: 'm1', titre: 'Ranger', icone: 'chambre', etoiles: 3,
  etapes: ['A', 'B'], cochees: [false, false], statut: 'todo', quotidienne: false, ...x,
});

describe('calculerSolde', () => {
  test('vide → 0', () => {
    assert.equal(L.calculerSolde(), 0);
    assert.equal(L.calculerSolde({}), 0);
  });

  test('somme des validations moins les demandes et récompenses données', () => {
    const validations = [{ etoiles: 3 }, { etoiles: 2 }, { etoiles: 5 }];
    const demandes = [{ prix: 4, statut: 'asked' }, { prix: 3, statut: 'given' }];
    assert.equal(L.calculerSolde({ validations, demandes }), 3);
  });

  test('utilise le prix figé dans la demande, pas le prix actuel', () => {
    // la récompense a pu changer de prix depuis : seule la demande compte
    assert.equal(L.calculerSolde({ validations: [{ etoiles: 10 }], demandes: [{ prix: 8, statut: 'given' }] }), 2);
  });

  test('ignore les statuts inconnus et les valeurs invalides', () => {
    const validations = [{ etoiles: 3 }, { etoiles: -5 }, { etoiles: '4' }, { etoiles: 1.5 }, {}];
    const demandes = [{ prix: 2, statut: 'annulee' }, { prix: -1, statut: 'asked' }];
    assert.equal(L.calculerSolde({ validations, demandes }), 3);
  });

  test('ne dépend pas des missions : une remise à zéro ne retire rien', () => {
    const validations = [{ missionId: 'm1', etoiles: 2 }];
    const avant = L.calculerSolde({ validations, demandes: [] });
    // la mission m1 repasse à « todo » : les validations ne bougent pas
    assert.equal(L.calculerSolde({ validations, demandes: [] }), avant);
  });
});

describe('soldeMembre', () => {
  test('gagnées − dépensées, valeurs invalides ignorées', () => {
    assert.equal(L.soldeMembre({ gagnees: 12, depensees: 10 }), 2);
    assert.equal(L.soldeMembre({ gagnees: 3 }), 3);
    assert.equal(L.soldeMembre({ gagnees: '3', depensees: -1 }), 0);
    assert.equal(L.soldeMembre(null), 0);
  });
});

describe('Encore N étoiles', () => {
  test('etoilesManquantes', () => {
    assert.equal(L.etoilesManquantes(7, 10), 3);
    assert.equal(L.etoilesManquantes(10, 10), 0);
    assert.equal(L.etoilesManquantes(15, 10), 0);
    assert.equal(L.etoilesManquantes(-2, 10), 10, 'un solde négatif compte comme 0');
  });

  test('texteEncore : pluriel et objectif atteint', () => {
    assert.equal(L.texteEncore(7, 10), 'Encore 3 étoiles');
    assert.equal(L.texteEncore(9, 10), 'Encore 1 étoile');
    assert.equal(L.texteEncore(10, 10), 'Tu peux l\'avoir !');
    assert.equal(L.texteEncore(12, 10), 'Tu peux l\'avoir !');
  });
});

describe('étapes', () => {
  test('basculerEtape coche puis décoche, sans modifier l\'original', () => {
    const c = [false, false, false];
    const c2 = L.basculerEtape(c, 1);
    assert.deepEqual(c2, [false, true, false]);
    assert.deepEqual(c, [false, false, false]);
    assert.deepEqual(L.basculerEtape(c2, 1), [false, false, false]);
  });

  test('basculerEtape ignore un index invalide', () => {
    assert.deepEqual(L.basculerEtape([true], 3), [true]);
    assert.deepEqual(L.basculerEtape([true], -1), [true]);
    assert.deepEqual(L.basculerEtape([true], 0.5), [true]);
  });

  test('peutTerminer seulement si tout est coché', () => {
    assert.equal(L.peutTerminer(mission()), false);
    assert.equal(L.peutTerminer(mission({ cochees: [true, false] })), false);
    assert.equal(L.peutTerminer(mission({ cochees: [true, true] })), true);
    assert.equal(L.peutTerminer(mission({ etapes: [], cochees: [] })), true, 'mission sans étape');
    assert.equal(L.peutTerminer(mission({ cochees: [true, true], statut: 'wait' })), false);
    assert.equal(L.peutTerminer(mission({ cochees: [true] })), false, 'tableau incohérent');
  });
});

describe('transitions de statut des missions', () => {
  const quotidienneHier = mission({ quotidienne: true, statut: 'ok', valideeLe: le(20, 18) });
  const quotidienneAujourdhui = mission({ quotidienne: true, statut: 'ok', valideeLe: le(21, 8) });

  test('frère : todo → wait seulement si tout est coché', () => {
    assert.equal(L.transitionMissionAutorisee('frere', mission({ cochees: [true, true] }), 'wait', MAINTENANT), true);
    assert.equal(L.transitionMissionAutorisee('frere', mission(), 'wait', MAINTENANT), false);
  });

  test('frère : ne peut pas valider ni renvoyer', () => {
    const w = mission({ statut: 'wait', cochees: [true, true] });
    assert.equal(L.transitionMissionAutorisee('frere', w, 'ok', MAINTENANT), false);
    assert.equal(L.transitionMissionAutorisee('frere', w, 'todo', MAINTENANT), false);
    assert.equal(L.transitionMissionAutorisee('frere', mission(), 'ok', MAINTENANT), false);
  });

  test('aidant : wait → ok et wait → todo', () => {
    const w = mission({ statut: 'wait' });
    assert.equal(L.transitionMissionAutorisee('aidant', w, 'ok', MAINTENANT), true);
    assert.equal(L.transitionMissionAutorisee('aidant', w, 'todo', MAINTENANT), true);
  });

  test('aidant : validation directe depuis todo, mais pas de retour arrière depuis ok', () => {
    assert.equal(L.transitionMissionAutorisee('aidant', mission(), 'ok', MAINTENANT), true);
    assert.equal(L.transitionMissionAutorisee('aidant', mission({ statut: 'wait' }), 'wait', MAINTENANT), false);
    assert.equal(L.transitionMissionAutorisee('aidant', mission({ statut: 'ok' }), 'todo', MAINTENANT), false);
    assert.equal(L.transitionMissionAutorisee('aidant', mission({ statut: 'ok' }), 'wait', MAINTENANT), false);
  });

  test('remise à zéro quotidienne : ok → todo pour tous, seulement un jour suivant', () => {
    for (const role of ['frere', 'aidant']) {
      assert.equal(L.transitionMissionAutorisee(role, quotidienneHier, 'todo', MAINTENANT), true, role);
      assert.equal(L.transitionMissionAutorisee(role, quotidienneAujourdhui, 'todo', MAINTENANT), false, role);
    }
  });

  test('rôle ou statut inconnu → refusé', () => {
    assert.equal(L.transitionMissionAutorisee('inconnu', mission({ statut: 'wait' }), 'ok', MAINTENANT), false);
    assert.equal(L.transitionMissionAutorisee('aidant', mission({ statut: 'wait' }), 'fini', MAINTENANT), false);
    assert.equal(L.transitionMissionAutorisee('aidant', mission({ statut: 'x' }), 'todo', MAINTENANT), false);
  });

  test('« Pas encore » décoche toutes les étapes', () => {
    assert.deepEqual(L.pasEncore(mission({ statut: 'wait', cochees: [true, true] })),
      { statut: 'todo', cochees: [false, false] });
  });
});

describe('remise à zéro des missions quotidiennes', () => {
  test('estARefaire', () => {
    const q = (x) => mission({ quotidienne: true, statut: 'ok', ...x });
    assert.equal(L.estARefaire(q({ valideeLe: le(20, 23, 59) }), le(21, 0, 1)), true, 'juste après minuit');
    assert.equal(L.estARefaire(q({ valideeLe: le(21, 0, 1) }), le(21, 23, 59)), false, 'même jour');
    assert.equal(L.estARefaire(q({ valideeLe: le(10) }), MAINTENANT), true, 'plusieurs jours après');
    assert.equal(L.estARefaire(q({ valideeLe: null }), MAINTENANT), false, 'date serveur inconnue');
    assert.equal(L.estARefaire(q({ valideeLe: le(20), quotidienne: false }), MAINTENANT), false, 'pas quotidienne');
    assert.equal(L.estARefaire(q({ valideeLe: le(20), statut: 'wait' }), MAINTENANT), false, 'en attente');
  });

  test('accepte un Timestamp Firestore (objet avec toMillis)', () => {
    const ts = { toMillis: () => le(20).getTime() };
    assert.equal(L.estARefaire(mission({ quotidienne: true, statut: 'ok', valideeLe: ts }), MAINTENANT), true);
  });

  test('remisesAZero ne touche que les missions concernées', () => {
    const missions = [
      mission({ id: 'a', quotidienne: true, statut: 'ok', valideeLe: le(20), etapes: ['x', 'y', 'z'], cochees: [true, true, true] }),
      mission({ id: 'b', quotidienne: true, statut: 'ok', valideeLe: le(21, 8) }),
      mission({ id: 'c', statut: 'ok', valideeLe: le(19) }),
      mission({ id: 'd', quotidienne: true, statut: 'wait', cochees: [true, true] }),
    ];
    assert.deepEqual(L.remisesAZero(missions, MAINTENANT), [
      { id: 'a', modif: { statut: 'todo', cochees: [false, false, false] } },
    ]);
  });
});

describe('liste et compteurs', () => {
  test('missionsDuFrere : à faire d\'abord, plus récentes en premier, validées masquées', () => {
    const ms = [
      mission({ id: 'w', statut: 'wait', creeeLe: le(21) }),
      mission({ id: 'old', statut: 'todo', creeeLe: le(1) }),
      mission({ id: 'ok', statut: 'ok', creeeLe: le(21) }),
      mission({ id: 'new', statut: 'todo', creeeLe: le(20) }),
      mission({ id: 'pending', statut: 'todo', creeeLe: null }),
    ];
    assert.deepEqual(L.missionsDuFrere(ms).map((m) => m.id), ['pending', 'new', 'old', 'w']);
  });

  test('compteurs', () => {
    const ms = [mission(), mission({ statut: 'wait' }), mission({ statut: 'ok' }), mission()];
    const ds = [{ statut: 'asked' }, { statut: 'given' }];
    assert.deepEqual(L.compteurs(ms, ds), { aFaire: 2, aValider: 2 });
  });
});

describe('plusieurs personnes aidées', () => {
  test('donneesAide sépare les missions et les soldes', () => {
    const etat = {
      membres: [{ id: 'x', gagnees: 6, depensees: 4 }, { id: 'y', gagnees: 2, depensees: 1 }],
      missions: [mission({ id: 'a', pour: 'x' }), mission({ id: 'b', pour: 'y' })],
      validations: [{ pour: 'x', etoiles: 5 }, { pour: 'y', etoiles: 2 }, { pour: 'x', etoiles: 1 }],
      demandes: [{ pour: 'x', prix: 4, statut: 'asked' }, { pour: 'y', prix: 1, statut: 'given' }],
    };
    const x = L.donneesAide(etat, 'x');
    assert.deepEqual(x.missions.map((m) => m.id), ['a']);
    assert.equal(x.solde, 2);
    assert.equal(L.donneesAide(etat, 'y').solde, 1);
    assert.equal(L.donneesAide({}, 'z').solde, 0);
  });
});

describe('récompenses et demandes', () => {
  const R = [
    { id: 'r1', titre: 'Cinéma', icone: 'cinema', prix: 15 },
    { id: 'r2', titre: 'Glace', icone: 'glace', prix: 10 },
    { id: 'r3', titre: 'Vieux', icone: 'jeu', prix: 2, archivee: true },
  ];

  test('recompensesActives : sans les archivées, triées par prix', () => {
    assert.deepEqual(L.recompensesActives(R).map((r) => r.id), ['r2', 'r1']);
  });

  test('objectifActuel : choisi, sinon la moins chère, sinon null', () => {
    assert.equal(L.objectifActuel(R, 'r1').id, 'r1');
    assert.equal(L.objectifActuel(R, 'r3').id, 'r2', 'objectif archivé → repli');
    assert.equal(L.objectifActuel(R, 'inconnu').id, 'r2');
    assert.equal(L.objectifActuel([], 'r1'), null);
  });

  test('peutDemander : assez d\'étoiles, pas archivée, pas déjà demandée', () => {
    assert.equal(L.peutDemander(R[1], 10, []), true);
    assert.equal(L.peutDemander(R[1], 9, []), false);
    assert.equal(L.peutDemander(R[2], 50, []), false);
    assert.equal(L.peutDemander(R[1], 30, [{ recompenseId: 'r2', statut: 'asked' }]), false);
    assert.equal(L.peutDemander(R[1], 30, [{ recompenseId: 'r2', statut: 'given' }]), true, 'déjà donnée une fois : on peut la redemander');
  });

  test('etatRecompense', () => {
    const ctx = { solde: 12, demandes: [], objectifId: 'r1' };
    assert.equal(L.etatRecompense(R[1], ctx), 'possible');
    assert.equal(L.etatRecompense(R[0], ctx), 'objectif');
    assert.equal(L.etatRecompense(R[0], { ...ctx, objectifId: 'r2' }), 'choisir');
    assert.equal(L.etatRecompense(R[1], { ...ctx, demandes: [{ recompenseId: 'r2', statut: 'asked' }] }), 'demandee');
  });

  test('preparerDemande fige le prix', () => {
    assert.deepEqual(L.preparerDemande(R[1]),
      { recompenseId: 'r2', titre: 'Glace', icone: 'glace', prix: 10, statut: 'asked' });
  });

  test('demander fait baisser le solde du prix, et rien d\'autre', () => {
    const validations = [{ etoiles: 12 }];
    const demandes = [{ ...L.preparerDemande(R[1]) }];
    assert.equal(L.calculerSolde({ validations, demandes }), 2);
    demandes[0].statut = 'given'; // « Récompense donnée » ne change pas le solde
    assert.equal(L.calculerSolde({ validations, demandes }), 2);
  });

  test('transitionDemandeAutorisee', () => {
    assert.equal(L.transitionDemandeAutorisee('aidant', 'asked', 'given'), true);
    assert.equal(L.transitionDemandeAutorisee('frere', 'asked', 'given'), false);
    assert.equal(L.transitionDemandeAutorisee('aidant', 'given', 'asked'), false);
  });
});

describe('fête « +N étoiles »', () => {
  const v = (id, j, etoiles) => ({ id, etoiles, le: le(j) });

  test('première ouverture : pas de fête, on mémorise la plus récente', () => {
    const r = L.feteAMontrer([v('a', 10, 2), v('b', 12, 3)], null);
    assert.deepEqual(r, { etoiles: 0, nouvelles: [], vuJusqua: le(12).getTime() });
    assert.deepEqual(L.feteAMontrer([], null), { etoiles: 0, nouvelles: [], vuJusqua: null });
  });

  test('fête la somme des nouvelles validations', () => {
    const r = L.feteAMontrer([v('a', 10, 2), v('b', 12, 3), v('c', 13, 1)], le(10).getTime());
    assert.equal(r.etoiles, 4);
    assert.deepEqual(r.nouvelles.map((x) => x.id), ['b', 'c']);
    assert.equal(r.vuJusqua, le(13).getTime());
  });

  test('pas deux fois la même fête', () => {
    const vs = [v('a', 10, 2), v('b', 12, 3)];
    const r1 = L.feteAMontrer(vs, le(9).getTime());
    assert.equal(r1.etoiles, 5);
    const r2 = L.feteAMontrer(vs, r1.vuJusqua);
    assert.equal(r2.etoiles, 0);
    assert.equal(r2.vuJusqua, r1.vuJusqua);
  });

  test('ignore les validations sans date serveur', () => {
    const r = L.feteAMontrer([{ id: 'x', etoiles: 4, le: null }], le(1).getTime());
    assert.equal(r.etoiles, 0);
    assert.equal(r.vuJusqua, le(1).getTime());
  });
});

describe('saisies des aidants', () => {
  test('decouperEtapes', () => {
    assert.deepEqual(L.decouperEtapes('  Un \n\n Deux  trois\r\nQuatre\n'), ['Un', 'Deux trois', 'Quatre']);
    assert.deepEqual(L.decouperEtapes(''), []);
    assert.deepEqual(L.decouperEtapes(undefined), []);
  });

  test('preparerMission accepte une mission correcte', () => {
    const r = L.preparerMission({ titre: ' Arroser  les plantes ', icone: 'plante', etoiles: 2, etapes: 'Remplir\nArroser', quotidienne: true });
    assert.equal(r.ok, true);
    assert.deepEqual(r.mission, {
      titre: 'Arroser les plantes', icone: 'plante', etoiles: 2,
      etapes: ['Remplir', 'Arroser'], cochees: [false, false], statut: 'todo', quotidienne: true,
    });
  });

  test('preparerMission refuse les saisies invalides', () => {
    const r = L.preparerMission({ titre: '  ', icone: 'virus', etoiles: 6, etapes: Array(13).fill('x') });
    assert.equal(r.ok, false);
    assert.deepEqual(Object.keys(r.erreurs).sort(), ['etapes', 'etoiles', 'icone', 'titre']);
    assert.equal(L.preparerMission({ titre: 'x'.repeat(61), icone: 'lit', etoiles: 1 }).ok, false);
    assert.equal(L.preparerMission({ titre: 'x', icone: 'lit', etoiles: 0 }).ok, false);
    assert.equal(L.preparerMission({ titre: 'x', icone: 'lit', etoiles: 2.5 }).ok, false);
    assert.equal(L.preparerMission({ titre: 'x', icone: 'lit', etoiles: 1, etapes: 'y'.repeat(81) }).ok, false);
    assert.equal(L.preparerMission({ titre: 'x', icone: 'burger', etoiles: 1 }).ok, false, 'icône de récompense');
  });

  test('preparerMission : quotidienne vaut false par défaut', () => {
    assert.equal(L.preparerMission({ titre: 'x', icone: 'lit', etoiles: 1 }).mission.quotidienne, false);
  });

  test('preparerRecompense', () => {
    assert.deepEqual(L.preparerRecompense({ titre: 'Bowling', icone: 'bowling', prix: '12' }),
      { ok: true, recompense: { titre: 'Bowling', icone: 'bowling', prix: 12, archivee: false } });
    for (const prix of [0, 100, 3.5, '', 'abc', null]) {
      assert.equal(L.preparerRecompense({ titre: 'B', icone: 'jeu', prix }).ok, false, `prix ${prix}`);
    }
    assert.equal(L.preparerRecompense({ titre: '', icone: 'jeu', prix: 3 }).ok, false);
    assert.equal(L.preparerRecompense({ titre: 'B', icone: 'plante', prix: 3 }).ok, false);
  });

  test('normaliserEmail et preparerInvitation', () => {
    assert.equal(L.normaliserEmail('  Prenom.Nom@Example.COM '), 'prenom.nom@example.com');
    assert.equal(L.normaliserEmail('pas-une-adresse'), null);
    assert.equal(L.normaliserEmail('a@b'), null);
    assert.equal(L.normaliserEmail('a/b@example.com'), null, 'pas de « / » (identifiant de document)');
    assert.deepEqual(L.preparerInvitation({ email: 'A@example.com', role: 'frere', prenom: ' Aidant A ' }),
      { ok: true, invitation: { email: 'a@example.com', role: 'frere', prenom: 'Aidant A' } });
    const r = L.preparerInvitation({ email: 'x', role: 'admin', prenom: '' });
    assert.deepEqual(Object.keys(r.erreurs).sort(), ['email', 'prenom', 'role']);
  });
});

describe('historique', () => {
  const auteur = { id: 'u1', prenom: 'Aidant A' };

  test('preparerEvenement donne une forme fixe', () => {
    assert.deepEqual(L.preparerEvenement('mission_validee', { titre: 'Ranger', etoiles: 3, auteur }),
      { type: 'mission_validee', titre: 'Ranger', etoiles: 3, auteurUid: 'u1', auteurNom: 'Aidant A', pourNom: '' });
    assert.deepEqual(L.preparerEvenement('famille_creee', { auteur }),
      { type: 'famille_creee', titre: '', etoiles: null, auteurUid: 'u1', auteurNom: 'Aidant A', pourNom: '' });
    assert.equal(L.preparerEvenement('famille_creee', { auteur: { uid: 'u2', prenom: 'B' } }).auteurUid, 'u2', 'accepte aussi uid');
  });

  test('preparerEvenement refuse un type inconnu ou un auteur manquant', () => {
    assert.throws(() => L.preparerEvenement('piratage', { auteur }));
    assert.throws(() => L.preparerEvenement('mission_creee', { titre: 'x' }));
  });

  test('preparerEvenement tronque les textes trop longs', () => {
    const e = L.preparerEvenement('mission_creee', { titre: 'x'.repeat(200), auteur: { uid: 'u', prenom: 'y'.repeat(50) } });
    assert.equal(e.titre.length, L.LIMITES.titreMission);
    assert.equal(e.auteurNom.length, L.LIMITES.prenom);
  });

  test('chaque type a une phrase', () => {
    for (const type of L.TYPES_EVENEMENT) {
      const txt = L.texteEvenement(L.preparerEvenement(type, { titre: 'T', etoiles: 2, auteur }));
      assert.ok(txt.length > 0, type);
    }
  });

  test('phrases principales', () => {
    const e = (type, x) => L.texteEvenement(L.preparerEvenement(type, { auteur, ...x }));
    assert.equal(e('mission_validee', { titre: 'Ranger', etoiles: 3 }), '« Ranger » validée, +3 étoiles');
    assert.equal(e('mission_validee', { titre: 'Ranger', etoiles: 1 }), '« Ranger » validée, +1 étoile');
    assert.equal(e('mission_pas_encore', { titre: 'Ranger' }), '« Ranger » : pas encore, renvoyée gentiment');
    assert.equal(e('recompense_demandee', { titre: 'Glace', etoiles: 10 }), 'Aidant A demande : Glace (−10 étoiles)');
    assert.equal(e('recompense_donnee', { titre: 'Glace' }), 'Récompense donnée : Glace');
    assert.equal(e('recompense_donnee', { titre: 'Glace', pourNom: 'Alex' }), 'Alex : récompense donnée : Glace');
    assert.equal(e('mission_validee', { titre: 'Ranger', etoiles: 2, pourNom: 'Alex' }), 'Alex : « Ranger » validée, +2 étoiles');
    assert.equal(e('mission_creee', { titre: 'Ranger', pourNom: 'Alex' }), 'Nouvelle mission pour Alex : « Ranger »');
    assert.equal(e('mission_supprimee', { titre: 'Ranger' }), 'Mission « Ranger » supprimée');
  });

  test('libelleJour et ligneHistorique', () => {
    assert.equal(L.libelleJour(le(21, 8), MAINTENANT), 'Aujourd\'hui');
    assert.equal(L.libelleJour(le(20, 23), MAINTENANT), 'Hier');
    assert.equal(L.libelleJour(le(3), MAINTENANT), 'Le 3 novembre');
    assert.equal(L.libelleJour(new Date(2026, 10, 30), new Date(2026, 11, 1)), 'Hier', 'changement de mois');
    assert.equal(L.libelleJour(null, MAINTENANT), 'À l\'instant');
    const evt = { ...L.preparerEvenement('mission_validee', { titre: 'Ranger', etoiles: 2, auteur }), le: le(20) };
    assert.equal(L.ligneHistorique(evt, MAINTENANT), 'Hier : « Ranger » validée, +2 étoiles');
  });
});
