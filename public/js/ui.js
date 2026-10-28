import { html, monter } from './html.js';

let zoneToasts = null;

export function toast(message, type = 'succes') {
  if (!zoneToasts) {
    zoneToasts = document.createElement('div');
    zoneToasts.className = 'toasts';
    zoneToasts.setAttribute('role', 'status');
    zoneToasts.setAttribute('aria-live', 'polite');
    document.body.append(zoneToasts);
  }
  const el = document.createElement('div');
  el.className = `toast ${type === 'erreur' ? 'toast--erreur' : ''}`;
  el.textContent = message;
  zoneToasts.append(el);
  setTimeout(() => el.remove(), type === 'erreur' ? 6000 : 3500);
}

// Ouvre une boîte de dialogue modale. Retourne l'élément <dialog> (retiré du DOM à la fermeture).
export function ouvrirDialogue({ titre, contenu, actions = '', large = false, surFermeture } = {}) {
  const d = document.createElement('dialog');
  if (large) d.classList.add('dialogue--large');
  d.setAttribute('aria-labelledby', 'dialogue-titre');
  monter(
    d,
    html`<div class="dialogue__entete">
        <h2 id="dialogue-titre">${titre}</h2>
        <button type="button" class="bouton-fermer" data-fermer aria-label="Fermer">×</button>
      </div>
      <div class="dialogue__corps">${contenu}</div>
      ${actions && html`<div class="dialogue__actions">${actions}</div>`}`,
  );
  d.addEventListener('click', (ev) => {
    if (ev.target === d || ev.target.closest('[data-fermer]')) d.close();
  });
  // Un lien cliqué dans la boîte de dialogue change de page : on la ferme.
  const fermerSurNavigation = () => d.close();
  window.addEventListener('hashchange', fermerSurNavigation);
  d.addEventListener('close', () => {
    window.removeEventListener('hashchange', fermerSurNavigation);
    d.remove();
    surFermeture?.();
  });
  document.body.append(d);
  d.showModal();
  return d;
}

export function confirmer({ titre, message, bouton = 'Confirmer', danger = false }) {
  return new Promise((resoudre) => {
    let ok = false;
    const d = ouvrirDialogue({
      titre,
      contenu: html`<p>${message}</p>`,
      actions: html`<button type="button" class="btn btn--secondaire" data-fermer>Annuler</button>
        <button type="button" class="btn ${danger ? 'btn--danger' : ''}" data-ok>${bouton}</button>`,
      surFermeture: () => resoudre(ok),
    });
    d.querySelector('[data-ok]').addEventListener('click', () => {
      ok = true;
      d.close();
    });
  });
}

// Désactive un bouton pendant une action asynchrone.
export async function pendant(bouton, action) {
  if (!bouton) return action();
  const texte = bouton.innerHTML;
  bouton.disabled = true;
  bouton.setAttribute('aria-busy', 'true');
  try {
    return await action();
  } finally {
    bouton.disabled = false;
    bouton.removeAttribute('aria-busy');
    bouton.innerHTML = texte;
  }
}

export const chargement = (texte = 'Chargement') =>
  html`<div class="chargement"><div class="radar-chargement" aria-hidden="true"></div>${texte}…</div>`;
