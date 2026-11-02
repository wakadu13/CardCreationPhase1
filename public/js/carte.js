import { BONUS_AVANTAGE, avantageContre, effet, faiblesseContre, filiere } from '/shared/regles.js';
import { etat } from './etat.js';
import { html, raw } from './html.js';
import { cielParDefaut, icone } from './icones.js';

const FILIERE_INCONNUE = { nom: 'Filière ?', couleur: '#6b7a90', icone: 'avion' };

function rendreAttaque(a) {
  const e = effet(a.effet);
  const jetons = Array.from({ length: a.energie || 0 }, () => raw('<span class="jeton"></span>'));
  return html`<div class="attaque">
    <div class="attaque__ligne">
      <span class="attaque__cout" role="img" aria-label="${a.energie} énergie${a.energie > 1 ? 's' : ''}">${jetons}</span>
      <span class="attaque__nom">${a.nom || 'Nom de l’attaque'}</span>
      <span class="attaque__degats">${a.degats > 0 ? a.degats : ''}</span>
    </div>
    ${(e?.texte || a.texte) && html`<p class="attaque__texte">${e?.texte}${e?.texte && a.texte ? ' ' : ''}${a.texte && html`<em>${a.texte}</em>`}</p>`}
  </div>`;
}

// Pastille d'une filière (couleur + emblème) pour la ligne Avantage / Faiblesse.
function pastille(id) {
  const f = filiere(id);
  if (!f) return '';
  return html`<span class="carte__type" style="--t:${f.couleur}" title="${f.nom} · ${f.domaine}">${icone(f.icone)}</span><b>${f.nom}</b>`;
}

// Ligne façon « faiblesse / résistance » : qui on domine, qui nous domine.
function rendreTactique(id) {
  if (!filiere(id)) return '';
  return html`<div class="carte__tactique">
    <span class="carte__tactique-cote"><span class="carte__tactique-lib">Avantage</span>${pastille(avantageContre(id))}<span class="carte__bonus">+${BONUS_AVANTAGE}</span></span>
    <span class="carte__tactique-cote"><span class="carte__tactique-lib">Faiblesse</span>${pastille(faiblesseContre(id))}<span class="carte__bonus carte__bonus--subi">+${BONUS_AVANTAGE}</span></span>
  </div>`;
}

// Rendu HTML d'une carte. `c` suit le format de l'API (ou un brouillon de l'atelier).
export function rendreCarte(c, { largeur = 300, numero = c.id, classe = '', voile = true } = {}) {
  const f = filiere(c.filiere) ?? FILIERE_INCONNUE;
  const nom = c.nom || 'Nom de la carte';
  const marque = etat.serveur?.promo || 'Phase 1';
  const cadrage = `object-position:${c.imageX}% ${c.imageY}%;transform:scale(${c.imageZoom});transform-origin:${c.imageX}% ${c.imageY}%`;
  return html`<article class="carte ${c.statut === 'masquee' ? 'carte--masquee' : ''} ${classe}" style="--w:${largeur}px;--c:${f.couleur}" aria-label="Carte ${nom}">
    <div class="carte__corps">
      <header class="carte__tete">
        <span class="carte__sous-titre">${c.sousTitre}</span>
        <h3 class="carte__nom ${[...nom].length > 17 ? 'carte__nom--long' : ''}">${nom}</h3>
        <span class="carte__pv"><small>PV</small>${c.pv}</span>
        <span class="carte__embleme" title="${f.nom} · ${f.domaine ?? ''}">${icone(f.icone)}</span>
      </header>
      <div class="carte__visuel">
        <span class="carte__numero">${numero ? `N° ${String(numero).padStart(3, '0')}` : 'Prototype'}</span>
        ${c.image ? html`<img src="${c.image}" alt="" loading="lazy" decoding="async" style="${cadrage}">` : cielParDefaut()}
      </div>
      <div class="carte__galon"><span>${f.nom}${f.domaine && html`<span class="carte__domaine"> · ${f.domaine}</span>`}</span></div>
      <div class="carte__carnet">
        ${(c.attaques ?? []).map(rendreAttaque)}
        ${c.description && html`<p class="carte__description">${c.description}</p>`}
      </div>
      ${rendreTactique(c.filiere)}
      <footer class="carte__pied">
        <span class="carte__auteur">${c.auteur ? `@${c.auteur}` : 'Conception en cours'}</span>
        <span class="carte__marque">${marque}<span class="jeton"></span></span>
      </footer>
    </div>
    ${voile && c.statut === 'masquee' && html`<div class="carte__voile"><strong>Masquée</strong><span>après signalements</span></div>`}
  </article>`;
}

// Dos de carte : motif de jetons, cocarde et nom du jeu.
export function rendreDos({ largeur = 300, classe = '' } = {}) {
  const nom = etat.serveur?.nomJeu ?? 'Les As de Salon';
  const promo = etat.serveur?.promo || 'Salon-de-Provence';
  return html`<article class="carte carte--dos ${classe}" style="--w:${largeur}px" aria-label="Dos de carte">
    <div class="carte__corps carte-dos">
      <div class="carte-dos__cadre">
        <span class="carte-dos__titre">${nom}</span>
        <span class="carte-dos__cocarde"></span>
        <span class="carte-dos__promo">${promo}</span>
      </div>
    </div>
  </article>`;
}

let bibliothequeImage = null;
// Charge html-to-image (version autonome servie par le site) à la première demande.
function chargerBibliothequeImage() {
  if (window.htmlToImage) return Promise.resolve(window.htmlToImage);
  bibliothequeImage ??= new Promise((resoudre, rejeter) => {
    const s = document.createElement('script');
    s.src = '/lib/html-to-image/html-to-image.js';
    s.onload = () => resoudre(window.htmlToImage);
    s.onerror = () => rejeter(new Error('Outil d’export indisponible.'));
    document.head.append(s);
  });
  return bibliothequeImage;
}

// Capture l'élément .carte en PNG (3× la taille affichée, pour l'impression). Renvoie une data URL.
async function capturerCarte(element) {
  const lib = await chargerBibliothequeImage();
  const carte = element.classList.contains('carte') ? element : element.querySelector('.carte');
  const transformation = carte.style.transform;
  carte.style.transform = 'none';
  carte.classList.remove('est-inclinee');
  try {
    return await lib.toPng(carte, { pixelRatio: 3, cacheBust: true, style: { boxShadow: 'none', transform: 'none' } });
  } finally {
    carte.style.transform = transformation;
  }
}

// Octets du PNG (pour un ZIP).
export async function capturerCarteEnPng(element) {
  const url = await capturerCarte(element);
  const binaire = atob(url.split(',')[1]);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return octets;
}

// Télécharge l'élément .carte en PNG.
export async function telechargerCarteEnImage(element, nomFichier) {
  const url = await capturerCarte(element);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nomFichier}.png`;
  document.body.append(a);
  a.click();
  a.remove();
}

const mouvementReduit = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Inclinaison 3D et reflet qui suit la souris.
export function rendreInclinable(element, angle = 10) {
  if (!element || mouvementReduit()) return;
  // La carte est recherchée à chaque événement : elle peut être redessinée (aperçu de l'atelier).
  const trouver = () => (element.classList.contains('carte') ? element : element.querySelector('.carte'));
  const zone = element;
  zone.addEventListener('pointermove', (ev) => {
    const carte = trouver();
    if (ev.pointerType === 'touch' || !carte) return;
    const r = carte.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
    carte.style.transform = `perspective(1000px) rotateY(${(x - 0.5) * 2 * angle}deg) rotateX(${(0.5 - y) * 2 * angle}deg)`;
    carte.style.setProperty('--hx', `${x * 100}%`);
    carte.style.setProperty('--hy', `${y * 100}%`);
    carte.classList.add('est-inclinee');
  });
  zone.addEventListener('pointerleave', () => {
    const carte = trouver();
    if (!carte) return;
    carte.style.transform = '';
    carte.classList.remove('est-inclinee');
  });
}
