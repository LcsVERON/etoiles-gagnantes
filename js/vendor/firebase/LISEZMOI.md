# SDK Firebase (copie locale)

Version : **13.2.0** (paquet npm « firebase », identique aux fichiers de
https://www.gstatic.com/firebasejs/13.2.0/).

Fichiers copiés par `npm run copier-firebase` (outils/copier-firebase.mjs).
Seule modification : l'adresse gstatic des `import` est remplacée par `./`.

## Empreintes (pour vérifier que rien n'a été modifié)

Une empreinte SHA-256 n'est pas une clé ni un secret : c'est une « signature »
calculée à partir du contenu exact d'un fichier. Un seul caractère modifié
donne une empreinte complètement différente.

| Fichier | Original (identique à gstatic.com) | Copie dans ce dossier |
|---|---|---|
| firebase-app.js | `a67a49aeb0937561e6405f721cf486dc3085e73763716e8233082417be769d40` | `55b1168a4116436b26c56a87fec434fdda8f9378afa635362f8847113859baa4` |
| firebase-auth.js | `f29ff093124d9173c0fce1882d595ebfd4edfb84615fd8d6a55f4579acf3756b` | `3a5f68e53e9187b80a4c205dc523bfe8507f2a94c4ef6304d9160336f516322c` |
| firebase-firestore.js | `91fc835471b67a821c3e966dc33a69f0cfe011999650bc85abf727aae5751eea` | `6c49b103476714edb91b825ae412b9a5bcca800c88344b5cfd6b441875a2b438` |

Vérifier la copie :

    sha256sum js/vendor/firebase/*.js

Vérifier l'original auprès de Google (exemple) :

    curl -s https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js | sha256sum

Licence : Apache-2.0 (Google LLC) — https://github.com/firebase/firebase-js-sdk
