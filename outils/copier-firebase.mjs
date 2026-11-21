// outils/copier-firebase.mjs — copie locale du SDK Firebase pour le navigateur.
//
// Le paquet npm « firebase » contient exactement les fichiers servis par
// https://www.gstatic.com/firebasejs/<version>/. On copie les trois modules
// utilisés dans js/vendor/firebase/, en remplaçant seulement l'adresse
// gstatic des « import » par un chemin local. Aucune autre transformation.
//
// Utilisation (après « npm install ») : npm run copier-firebase

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const MODULES = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'];
const source = new URL('../node_modules/firebase/', import.meta.url);
const cible = new URL('../js/vendor/firebase/', import.meta.url);

const version = JSON.parse(readFileSync(new URL('package.json', source), 'utf8')).version;
const prefixe = `https://www.gstatic.com/firebasejs/${version}/`;

mkdirSync(cible, { recursive: true });
const lignes = [];
for (const nom of MODULES) {
  const original = readFileSync(new URL(nom, source), 'utf8');
  if (!original.includes(prefixe) && nom !== 'firebase-app.js') {
    throw new Error(`${nom} : adresse ${prefixe} introuvable (version différente ?)`);
  }
  const copie = original.split(prefixe).join('./');
  if (/https:\/\/www\.gstatic\.com\/firebasejs\//.test(copie)) {
    throw new Error(`${nom} : il reste une adresse gstatic après remplacement`);
  }
  writeFileSync(new URL(nom, cible), copie);
  const sha = (texte) => createHash('sha256').update(texte).digest('hex');
  lignes.push(`| ${nom} | \`${sha(original)}\` | \`${sha(copie)}\` |`);
  console.log(`${nom} copié (${(copie.length / 1024).toFixed(0)} Ko)`);
}

writeFileSync(new URL('LISEZMOI.md', cible), `# SDK Firebase (copie locale)

Version : **${version}** (paquet npm « firebase », identique aux fichiers de
${prefixe}).

Fichiers copiés par \`npm run copier-firebase\` (outils/copier-firebase.mjs).
Seule modification : l'adresse gstatic des \`import\` est remplacée par \`./\`.

## Empreintes (pour vérifier que rien n'a été modifié)

Une empreinte SHA-256 n'est pas une clé ni un secret : c'est une « signature »
calculée à partir du contenu exact d'un fichier. Un seul caractère modifié
donne une empreinte complètement différente.

| Fichier | Original (identique à gstatic.com) | Copie dans ce dossier |
|---|---|---|
${lignes.join('\n')}

Vérifier la copie :

    sha256sum js/vendor/firebase/*.js

Vérifier l'original auprès de Google (exemple) :

    curl -s https://www.gstatic.com/firebasejs/${version}/firebase-app.js | sha256sum

Licence : Apache-2.0 (Google LLC) — https://github.com/firebase/firebase-js-sdk
`);
console.log(`SDK Firebase ${version} copié dans js/vendor/firebase/`);
