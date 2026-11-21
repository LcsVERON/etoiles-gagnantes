// js/erreurs.js — messages compréhensibles pour les erreurs de Firebase.

const MESSAGES = {
  'permission-denied': 'Le serveur a refusé cette action. Recharge l\'appli.',
  unavailable: 'Pas de connexion au serveur. Ce sera envoyé plus tard.',
  'auth/invalid-email': 'Adresse e-mail non valable.',
  'auth/invalid-action-code': 'Ce lien de connexion ne marche plus. Demande un nouveau lien.',
  'auth/expired-action-code': 'Ce lien de connexion a expiré. Demande un nouveau lien.',
  'auth/network-request-failed': 'Pas de connexion Internet.',
  'auth/popup-blocked': 'La fenêtre de connexion a été bloquée. Autorise les fenêtres pour ce site, ou utilise le lien par e-mail.',
  'auth/unauthorized-domain': 'Ce site n\'est pas autorisé dans la console Firebase (Authentication → Paramètres → Domaines autorisés).',
  'auth/unauthorized-continue-uri': 'Ce site n\'est pas autorisé dans la console Firebase (Authentication → Paramètres → Domaines autorisés).',
  'auth/operation-not-allowed': 'Ce mode de connexion n\'est pas activé dans la console Firebase.',
  'auth/too-many-requests': 'Trop d\'essais. Attends quelques minutes.',
  'auth/quota-exceeded': 'Trop de liens envoyés aujourd\'hui (limite gratuite). Réessaie demain, ou connecte-toi avec Google.',
};

export function messageErreur(e) {
  return MESSAGES[e?.code] || e?.message || 'Ça n\'a pas marché. Réessaie.';
}
