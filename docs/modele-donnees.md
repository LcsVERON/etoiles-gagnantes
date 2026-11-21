# Modèle de données (Cloud Firestore)

Toutes les données d'une famille sont rangées sous `families/{familyId}`.
Les règles d'accès sont dans [`firestore.rules`](../firestore.rules), testées
par [`tests/regles/`](../tests/regles/).

Vocabulaire : un **aidant** gère la famille ; une **personne aidée** (rôle
`frere` dans le code) fait les missions et gagne des étoiles. Une famille peut
compter plusieurs aidants et plusieurs personnes aidées.

## Vue d'ensemble

```
families/{familyId}                     nom, creeeLe, creeePar, (suppression)
├── members/{uid}                       fiche de chaque membre (+ compteurs d'étoiles)
├── invites/{email}                     invitations en attente
├── tasks/{taskId}                      missions
├── validations/{validationId}          une ligne par mission validée
├── rewards/{rewardId}                  récompenses (communes à la famille)
├── redemptions/{redemptionId}          demandes de récompense
└── events/{eventId}                    historique
```

Les dates marquées « serveur » sont écrites avec `serverTimestamp()` : les
règles vérifient qu'elles valent l'heure du serveur.

## Détail des documents

### `families/{familyId}`
| Champ | Type | Remarque |
|---|---|---|
| `nom` | texte 1–40 | |
| `creeeLe` | date serveur | |
| `creeePar` | uid | le premier aidant |
| `suppression` | booléen, facultatif | `true` pendant la suppression complète |

### `members/{uid}` — l'identifiant est l'uid Firebase Authentication
| Champ | Type | Remarque |
|---|---|---|
| `uid` | uid | recopie de l'identifiant (pour retrouver sa famille à la connexion) |
| `prenom` | texte 1–30 | choisi par l'aidant dans l'invitation, non modifiable |
| `role` | `aidant` \| `frere` | vient de l'invitation, non modifiable |
| `objectif` | id de récompense ou null | choisi par la personne aidée |
| `fetesVuesJusqua` | entier (ms) ou null | date de la dernière validation déjà fêtée |
| `rejointLe` | date serveur | |
| `gagnees` | entier ≥ 0 | somme des étoiles de ses validations |
| `depensees` | entier ≥ 0 | somme des prix de ses demandes |
| `derniereValidation` | id ou null | dernière validation ayant augmenté `gagnees` |
| `derniereDemande` | id ou null | dernière demande ayant augmenté `depensees` |

### `invites/{email}` — l'identifiant est l'adresse en minuscules
| Champ | Type |
|---|---|
| `email` | même valeur que l'identifiant |
| `prenom` | texte 1–30 |
| `role` | `aidant` \| `frere` |
| `invitePar` | uid de l'aidant |
| `creeLe` | date serveur |

### `tasks/{taskId}` — missions
| Champ | Type | Remarque |
|---|---|---|
| `titre` | texte 1–60 | |
| `icone` | clé de la bibliothèque d'icônes | liste fermée |
| `etoiles` | entier 1–5 | |
| `etapes` | liste de 0 à 12 textes de 1–80 | |
| `cochees` | liste de booléens | une case par étape |
| `statut` | `todo` \| `wait` \| `ok` | à faire, en attente de vérification, validée |
| `quotidienne` | booléen | revient « à faire » chaque jour |
| `pour` | uid d'une personne aidée | |
| `creeePar`, `creeeLe` | uid, date serveur | |
| `valideePar`, `valideeLe` | uid, date serveur (ou null) | dernière validation |
| `derniereValidation` | id ou null | |

Le titre, l'icône, les étoiles, les étapes et la personne ne changent jamais
après la création.

### `validations/{validationId}` — une ligne par mission validée
`missionId`, `pour`, `titre`, `icone`, `etoiles`, `par` (aidant), `le` (date
serveur). C'est une recopie exacte de la mission au moment de la validation.
Elle n'est jamais modifiée.

### `rewards/{rewardId}` — récompenses
`titre` (1–40), `icone` (liste fermée), `prix` (entier 1–99), `archivee`
(booléen), `creeeLe` (date serveur). Une récompense ne se supprime pas : on
l'archive.

### `redemptions/{redemptionId}` — demandes de récompense
`recompenseId`, `titre`, `icone`, `prix` (prix au moment de la demande),
`statut` (`asked` | `given`), `pour`, `demandeeLe` (date serveur),
`donneePar`, `donneeLe`.

### `events/{eventId}` — historique
`type` (liste fermée), `titre`, `etoiles` (ou null), `auteurUid`, `auteurNom`
(= prénom de l'auteur), `pourNom` (prénom de la personne aidée concernée),
`le` (date serveur). Jamais modifié.

## Différences avec le modèle proposé au départ, et pourquoi

1. **Collection `validations`.** Si les étoiles gagnées venaient des missions
   au statut « validée », remettre à zéro une mission quotidienne, ou
   supprimer une mission, ferait perdre des étoiles. Chaque validation est
   donc gardée à part, et ne se modifie jamais.

2. **Compteurs `gagnees` et `depensees` dans la fiche de la personne aidée.**
   Les règles Firestore ne savent pas additionner des documents. Sans
   compteurs, elles ne pourraient pas refuser une demande de récompense faite
   sans assez d'étoiles. Il faudrait aussi relire toutes les validations à
   chaque ouverture, ce qui grossit avec les années et entame le quota
   gratuit.
   - Chaque compteur change **dans le même lot** (tout ou rien) qu'une
     validation (`gagnees`) ou une demande (`depensees`).
   - Les règles vérifient que l'augmentation correspond exactement aux étoiles
     de la validation ou au prix de la demande, et que `gagnees − depensees`
     reste positif ou nul.
   - Le solde n'est pas stocké : il est calculé à partir des deux compteurs.
   - L'appli utilise `increment()` : deux aidants qui valident en même temps
     ne s'écrasent pas.
   - Les tests de `js/logique.js` vérifient que les compteurs donnent
     toujours le même solde que le recalcul complet.

3. **Champ `pour`** sur les missions, validations et demandes : il peut y
   avoir plusieurs personnes aidées, chacune avec ses missions et son solde.
   Le catalogue de récompenses reste commun.

4. **`cochees` est une liste de booléens**, et non une liste de numéros
   d'étapes. Les règles peuvent ainsi vérifier simplement sa taille et son
   contenu.

5. **`uid` dans les fiches et `email` dans les invitations.** À la connexion,
   l'appli retrouve sa famille (« quelle fiche porte mon uid ? ») ou son
   invitation (« quelle invitation porte mon adresse vérifiée ? ») par une
   recherche dans toutes les familles. Les règles limitent ces recherches à
   ses propres documents.

6. **Champ `suppression` sur la famille.** Une suppression complète peut
   demander plusieurs lots (500 écritures maximum par lot). La famille est
   d'abord marquée « en suppression », ce qui autorise à effacer l'historique,
   les récompenses, les validations et les demandes. Hors de ce cas, ces
   données ne peuvent pas être effacées.

## Ce que chaque rôle peut faire

| Action | Personne aidée | Aidant |
|---|---|---|
| Lire les données de la famille | oui | oui |
| Lire les invitations | la sienne seulement | oui |
| Cocher / décocher une étape | ses missions | non |
| « J'ai fini » (todo → wait) | ses missions, tout coché | non |
| Remettre à zéro une mission quotidienne d'un jour passé | ses missions | oui |
| Valider (wait → ok, ou todo → ok) | non | oui, avec validation + compteur |
| « Pas encore » (wait → todo) | non | oui, étapes décochées |
| Créer / supprimer une mission | non | oui |
| Choisir son objectif, mémoriser la fête vue | sa fiche | non |
| Demander une récompense | pour elle, prix actuel, solde suffisant | non |
| Marquer une récompense donnée | non | oui |
| Ajouter / modifier / archiver une récompense | non | oui |
| Inviter / annuler une invitation | non | oui |
| Retirer un membre | non | oui, sauf soi-même |
| Écrire dans l'historique | ses propres actions | ses propres actions |
| Tout supprimer | non | oui |

## Limites connues (acceptées)

- **« Une seule demande en cours par récompense »** est vérifié par l'appli,
  pas par les règles. Le risque est faible : le solde reste toujours vérifié.
- **Le changement de jour des missions quotidiennes** est calculé par les
  règles en heure de Paris approximée (UTC + 1 h). En été, la remise à zéro
  n'est donc possible qu'à partir de 1 h du matin ; l'appli réessaie
  automatiquement.
- **Un aidant qui retire une personne aidée efface ses étoiles.** Si cette
  personne est réinvitée, elle repart de zéro. L'appli demande une
  confirmation qui le dit clairement.
