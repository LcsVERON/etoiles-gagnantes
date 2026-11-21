// js/ui.js — petits éléments d'interface communs : message bref (toast),
// fête, demande de confirmation. Aucun HTML inline : tout est créé par le DOM.

import { html, brut, remplir } from './html.js';
import { ETOILE_FETE } from './icones.js';

/** Message bref en haut de l'écran, lu aussi par les lecteurs d'écran. */
export function toast(message) {
  document.querySelectorAll('.toast').forEach((t) => t.remove()); // un seul à la fois
  const d = document.createElement('div');
  d.className = 'toast';
  d.setAttribute('role', 'status');
  d.textContent = message;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 3200);
}

// Une seule boîte de dialogue à la fois : les suivantes attendent leur tour.
let file = Promise.resolve();

function ouvrir(construire) {
  const resultat = file.then(() => new Promise((resoudre) => {
    const dlg = document.getElementById('dialogue');
    let fini = false;
    const fermer = (valeur) => {
      if (fini) return;
      fini = true;
      dlg.close();
      resoudre(valeur);
    };
    // Touche Échap ou bouton « retour » d'Android : on ferme proprement.
    dlg.oncancel = (e) => { e.preventDefault(); fermer(false); };
    construire(dlg, fermer);
    dlg.showModal();
    dlg.querySelector('[autofocus]')?.focus();
  }));
  file = resultat.catch(() => {});
  return resultat;
}

/** Grande fête : étoile, titre, phrase et bouton « Super ! ». */
export function fete({ titre, ligne, bouton = 'Super !' }) {
  return ouvrir((dlg, fermer) => {
    dlg.className = 'party';
    remplir(dlg, html`<div class="box">${brut(ETOILE_FETE)}<h1 id="dlgTitre">${titre}</h1><p class="ligne">${ligne}</p><button class="big" type="button" autofocus>${bouton}</button></div>`);
    dlg.setAttribute('aria-labelledby', 'dlgTitre');
    dlg.querySelector('button').addEventListener('click', () => fermer(true), { once: true });
  });
}

/** Confirmation (vue famille). Renvoie true si on confirme. */
export function confirmer({ titre, texte, oui, non = 'Annuler', danger = false }) {
  return ouvrir((dlg, fermer) => {
    dlg.className = 'confirm';
    remplir(dlg, html`<div class="box"><h2 id="dlgTitre">${titre}</h2><p>${texte}</p>
      <div class="acts"><button type="button" class="${danger ? 'danger' : 'yes'}" data-r="1">${oui}</button><button type="button" class="no" data-r="0" autofocus>${non}</button></div></div>`);
    dlg.setAttribute('aria-labelledby', 'dlgTitre');
    dlg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => fermer(b.dataset.r === '1'), { once: true }));
  });
}

/** Applique les largeurs de jauges (attribut data-largeur, en %), sans style inline dans le HTML. */
export function appliquerLargeurs(racine = document) {
  racine.querySelectorAll('[data-largeur]').forEach((el) => {
    el.style.width = `${Math.max(0, Math.min(100, Number(el.dataset.largeur) || 0))}%`;
  });
}
