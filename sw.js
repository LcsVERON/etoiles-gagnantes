// sw.js — service worker : permet d'ouvrir l'appli sans connexion.
//
// Stratégie « réseau d'abord » pour les fichiers de l'appli :
//   - en ligne : on prend toujours la dernière version (pas de numéro de
//     version à changer à chaque mise en ligne) et on met la copie à jour ;
//   - hors connexion, ou si le réseau ne répond pas en 3 secondes : on sert
//     la copie gardée sur l'appareil.
// Les échanges avec Firebase et Google (autres domaines) ne sont JAMAIS
// interceptés : Firestore gère lui-même le hors connexion.
//
// FICHIERS : tout ce qu'il faut pour démarrer hors connexion. Un test
// (tests/pwa.test.js) vérifie que cette liste est complète et exacte.

const CACHE = 'etoiles-gagnantes';
const DELAI_RESEAU = 3000;

const FICHIERS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'mentions-legales.html',
  'confidentialite.html',
  'css/app.css',
  'fonts/atkinson-hyperlegible-400.woff2',
  'fonts/atkinson-hyperlegible-700.woff2',
  'icons/apple-touch-icon.png',
  'icons/icone-192.png',
  'icons/icone-512.png',
  'icons/icone-adaptable-512.png',
  'icons/icone-adaptable.svg',
  'icons/icone.svg',
  'js/actions.js',
  'js/app.js',
  'js/erreurs.js',
  'js/firebase-config.js',
  'js/html.js',
  'js/icones.js',
  'js/logique.js',
  'js/ui.js',
  'js/donnees/demo.js',
  'js/donnees/firebase.js',
  'js/donnees/lots.js',
  'js/donnees/memoire.js',
  'js/vendor/firebase/firebase-app.js',
  'js/vendor/firebase/firebase-auth.js',
  'js/vendor/firebase/firebase-firestore.js',
  'js/vues/accueil.js',
  'js/vues/famille.js',
  'js/vues/frere.js',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' : on ignore le cache HTTP pour partir de fichiers frais.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FICHIERS.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  // Efface les caches d'autres noms (anciennes versions éventuelles).
  e.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase, Google : pas touché
  e.respondWith(reseauPuisCopie(e, req, url));
});

/** Clé de cache : l'adresse sans paramètres (ex. ?mode=signIn&oobCode=… du lien e-mail). */
function cle(url) {
  const u = new URL(url);
  u.search = '';
  u.hash = '';
  return u.href;
}

async function reseauPuisCopie(evenement, req, url) {
  const cache = await caches.open(CACHE);
  const reseau = fetch(req).then((rep) => {
    if (rep.ok && rep.type === 'basic') cache.put(cle(url), rep.clone());
    return rep;
  });
  // Même si on répond avec la copie, la mise à jour continue en arrière-plan.
  evenement.waitUntil(reseau.catch(() => {}));

  const attente = new Promise((resoudre) => { setTimeout(() => resoudre(null), DELAI_RESEAU); });
  try {
    const rep = await Promise.race([reseau, attente]);
    if (rep) return rep;
  } catch {
    // pas de réseau : on passe à la copie
  }
  const copie = await cache.match(cle(url))
    || (req.mode === 'navigate' ? await cache.match(new URL('./', self.location).href) : null);
  if (copie) return copie;
  return reseau; // ni réseau rapide ni copie : on attend le réseau (ou son erreur)
}
