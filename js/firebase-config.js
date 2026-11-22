// js/firebase-config.js — configuration du projet Firebase.
//
// À REMPLACER par la configuration de ton projet (console Firebase →
// Paramètres du projet → Vos applications → Configuration). Voir
// DEVELOPPEMENT.md.
//
// Ces valeurs ne sont pas secrètes : elles identifient le projet, comme une
// adresse. N'importe qui peut les lire dans le code d'une appli web. Ce qui
// protège réellement les données, ce sont les règles de sécurité
// (firestore.rules) et la connexion (Firebase Authentication).

export const firebaseConfig = {
  apiKey: 'AIzaSyBImIJr_IAVES7PBV_Coa0GO5dUHojrmb8',
  authDomain: 'etoiles-gagnantes.firebaseapp.com',
  projectId: 'etoiles-gagnantes',
  appId: '1:194964362295:web:b86c1d6cc0b56372315bb2',
};

/** Vrai quand les valeurs d'exemple ont été remplacées. */
export const configurationComplete = Object.values(firebaseConfig)
  .every((v) => typeof v === 'string' && v.length > 0 && !v.includes('REMPLACER'));

/**
 * En local (http://localhost ou http://127.0.0.1), l'appli utilise les
 * émulateurs (npm run emulateurs) et jamais le vrai projet : on peut tout
 * essayer sans toucher aux vraies données.
 */
export const utiliserEmulateurs = ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname);

/** Configuration utilisée avec les émulateurs (projet fictif « demo- »). */
export const configEmulateurs = {
  apiKey: 'cle-emulateur',
  authDomain: 'demo-etoiles.firebaseapp.com',
  projectId: 'demo-etoiles',
  appId: 'demo-etoiles',
};

export const EMULATEURS = {
  auth: 'http://127.0.0.1:9099',
  firestore: { host: '127.0.0.1', port: 8080 },
};
