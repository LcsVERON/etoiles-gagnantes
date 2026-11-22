# Étoiles gagnantes

Application web familiale (PWA) pour encourager une personne en situation de
handicap au quotidien. La famille lui envoie des **missions** découpées en
petites étapes ; quand une mission est faite et vérifiée, elle gagne des
**étoiles**, qu'elle échange contre des **récompenses** qu'elle a choisies.

- Côté personne aidée : écrans en **FALC** (Facile à lire et à comprendre),
  gros boutons, police Atkinson Hyperlegible, une action par écran, fêtes à
  chaque réussite. On ne retire jamais d'étoiles (pas de punition).
- Côté famille (aidants) : valider les missions (« C'est fait ✓ » ou « Pas
  encore »), créer des missions (avec image, étapes, option « chaque jour »),
  gérer les récompenses, inviter les membres, voir l'historique.
- Plusieurs aidants et plusieurs personnes aidées par famille.
- Fonctionne **hors connexion** et s'installe sur l'écran d'accueil.
- **Mode démo** sans compte : ajouter `#demo` à l'adresse.

## Technique

- HTML, CSS et JavaScript (modules ES), **sans framework ni compilation**.
- **Firebase** (plan gratuit) : Authentication (lien par e-mail, Google) et
  Cloud Firestore (temps réel, copie locale hors connexion). Pas de Cloud
  Functions.
- Sécurité : règles Firestore strictes et testées, CSP sans `unsafe-inline`,
  SDK Firebase copié localement (version figée).
- Hébergement : GitHub Pages.

```
index.html, css/, fonts/, icons/       interface
js/logique.js                          calculs purs (solde, transitions…)
js/actions.js                          ce que fait chaque bouton
js/donnees/                            stockage démo et Firebase
js/vues/                               écrans
js/vendor/firebase/                    SDK Firebase (copie locale)
sw.js, manifest.webmanifest            PWA
firestore.rules, firestore.indexes.json
tests/                                 tests (node --test, émulateur Firestore)
docs/modele-donnees.md                 modèle de données et droits
```

## Lancer en local

Prérequis : Node.js 20 ou plus, Java 21 (émulateurs), Firebase CLI.

```
npm install
npm test                 # tests rapides
npm run test:regles      # règles de sécurité (émulateur Firestore)

python3 -m http.server 8001
# démo : http://localhost:8001/#demo
```

Avec les émulateurs (`npm run emulateurs` dans un autre terminal), l'appli
ouverte sur `http://localhost:8001` utilise automatiquement Firebase en local.

## Configuration

`js/firebase-config.js` contient des valeurs d'exemple à remplacer par la
configuration d'un projet Firebase. Ces valeurs ne sont pas secrètes : ce sont
les règles de sécurité et la connexion qui protègent les données.

## Licences

- Police Atkinson Hyperlegible © Braille Institute of America, SIL Open Font
  License 1.1 (`fonts/OFL.txt`).
- SDK Firebase © Google LLC, Apache 2.0.
