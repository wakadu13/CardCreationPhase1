import { raw } from './html.js';

// Emblèmes des filières (dessins originaux, grille 24×24).
const TRAIT = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

const DESSINS = {
  avion:
    '<path fill="currentColor" d="M12 1.8c.75 0 1.25 1.3 1.25 3.2v4.1l8.25 4.8v2.15l-8.25-2.6v4.65l2.6 1.9v1.75L12 20.6l-3.85 1.15V20l2.6-1.9v-4.65L2.5 16.05V13.9l8.25-4.8V5c0-1.9.5-3.2 1.25-3.2z"/>',
  cle: `<g ${TRAIT}><circle cx="12" cy="12" r="6" stroke-width="2.4"/><circle cx="12" cy="12" r="2.1" stroke-width="2"/></g><path stroke="currentColor" stroke-width="3.2" d="M12 2.3v3.4M12 18.3v3.4M2.3 12h3.4M18.3 12h3.4M5.1 5.1l2.4 2.4M16.5 16.5l2.4 2.4M5.1 18.9l2.4-2.4M16.5 7.5l2.4-2.4"/>`,
  radar: `<path fill="currentColor" opacity=".35" d="M12 12 18.36 5.64A9 9 0 0 1 21 12z"/><g ${TRAIT} stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18.36 5.64"/></g><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="15.6" cy="15.2" r="1.3" fill="currentColor"/>`,
  bouclier: `<g ${TRAIT} stroke-width="2"><path d="M12 2.5l8 3v6c0 5-3.4 8.7-8 10.5-4.6-1.8-8-5.5-8-10.5v-6z"/><path d="M8 9.8l4 2.9 4-2.9M8 13.8l4 2.9 4-2.9"/></g>`,
  puce: `<g ${TRAIT} stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="1.5"/><path d="M9.5 2.5V6M14.5 2.5V6M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5"/></g><rect x="9.5" y="9.5" width="5" height="5" rx=".6" fill="currentColor"/>`,
  groupe: `<g ${TRAIT} stroke-width="1.9"><circle cx="9" cy="8.2" r="3.3"/><path d="M2.8 20c0-3.6 2.8-6.2 6.2-6.2s6.2 2.6 6.2 6.2"/><circle cx="16.8" cy="9.4" r="2.6"/><path d="M16 14.1c3.1-.1 5.4 2.3 5.4 5.6"/></g>`,
  tampon: `<g ${TRAIT} stroke-width="1.9"><circle cx="12" cy="4.6" r="2.2"/><path d="M10.6 6.7 10 11h4l-.6-4.3"/><path d="M4.5 16.2v-2.1c0-1.7 1.3-3 3-3h9c1.7 0 3 1.3 3 3v2.1z"/><path d="M5 19.8h14"/></g>`,

  // Icônes d'interface
  plus: `<path ${TRAIT} stroke-width="2.2" d="M12 5v14M5 12h14"/>`,
  crayon: `<path ${TRAIT} stroke-width="2" d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>`,
  poubelle: `<path ${TRAIT} stroke-width="2" d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/>`,
  drapeau: `<path ${TRAIT} stroke-width="2" d="M5 21V4M5 4h11l-2 4 2 4H5"/>`,
  imprimer: `<path ${TRAIT} stroke-width="2" d="M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>`,
  telecharger: `<path ${TRAIT} stroke-width="2" d="M12 4v11M7 10l5 5 5-5M5 20h14"/>`,
  menu: `<path ${TRAIT} stroke-width="2" d="M4 7h16M4 12h16M4 17h16"/>`,
  verifie: `<path ${TRAIT} stroke-width="2.4" d="M5 12.5l4.5 4.5L19 7.5"/>`,
  croix: `<path ${TRAIT} stroke-width="2.4" d="M6 6l12 12M18 6 6 18"/>`,
  image: `<g ${TRAIT} stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 8"/></g>`,
  oeil: `<g ${TRAIT} stroke-width="2"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></g>`,
  cadenas: `<g ${TRAIT} stroke-width="2"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></g>`,
  copier: `<g ${TRAIT} stroke-width="2"><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9.5a1 1 0 0 0 1 1h3.5"/></g>`,
  masquer: `<g ${TRAIT} stroke-width="2"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></g>`,
  reglages: `<g ${TRAIT} stroke-width="2"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></g>`,
  megaphone: `<g ${TRAIT} stroke-width="2"><path d="M4 10v4h3l7 4V6L7 10z"/><path d="M17.5 9a4 4 0 0 1 0 6M7 14l1.5 5h2.5l-1-4.5"/></g>`,
  retour: `<path ${TRAIT} stroke-width="2" d="M10 6l-6 6 6 6M4 12h16"/>`,
};

export const dessinIcone = (nom) => DESSINS[nom] ?? '';

export function icone(nom, classe = '') {
  return raw(`<svg viewBox="0 0 24 24" class="icone ${classe}" aria-hidden="true" focusable="false">${DESSINS[nom] ?? ''}</svg>`);
}

// Insigne : cocarde tricolore portée par des ailes dorées.
export function logo() {
  return raw(`<svg viewBox="0 0 120 48" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="or-aile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6e2a0"/><stop offset=".55" stop-color="#d3ab4f"/><stop offset="1" stop-color="#9c7629"/>
    </linearGradient>
  </defs>
  <g id="aile-g" fill="url(#or-aile)" stroke="#5e450f" stroke-width=".6" stroke-linejoin="round">
    <path d="M47 17.5C34 15 18 11.5 3 9.5c3.5 3 7 4.6 11 5.6-4.2.4-7.7 0-10.8-.8 3.2 3.2 7.2 4.9 11.6 5.6-3.9.7-7.3.6-10.2 0 3.3 3 7.4 4.5 11.8 4.8-3.3 1-6.4 1.2-9.1.9 4.5 3.7 11.6 5.1 18.8 4.8L47 30z"/>
    <path fill="none" stroke="#7b5b17" stroke-width=".7" opacity=".7" d="M44 20.5 16 16M44 24 17 21.5M44 27.5 20 26.5"/>
  </g>
  <use href="#aile-g" transform="matrix(-1 0 0 1 120 0)"/>
  <circle cx="60" cy="24" r="14" fill="#1f3f96" stroke="#e9cd7f" stroke-width="1.6"/>
  <circle cx="60" cy="24" r="9.2" fill="#f7f5ef"/>
  <circle cx="60" cy="24" r="4.6" fill="#d52b36"/>
</svg>`);
}

// Illustration par défaut d'une carte : ciel de nuit et fumées tricolores.
export function cielParDefaut() {
  return raw(`<div class="carte__ciel"><svg viewBox="0 0 200 110" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <g fill="#fff" opacity=".55"><circle cx="22" cy="14" r=".8"/><circle cx="58" cy="28" r=".6"/><circle cx="94" cy="10" r=".9"/><circle cx="132" cy="22" r=".6"/><circle cx="176" cy="12" r=".8"/><circle cx="186" cy="40" r=".5"/><circle cx="40" cy="48" r=".5"/></g>
  <g fill="none" stroke-linecap="round" stroke-width="4.5">
    <path d="M-12 96C40 92 92 76 134 38" stroke="#3a62cc" opacity=".75"/>
    <path d="M-12 103C42 100 96 84 141 45" stroke="#f4f4f4" opacity=".8"/>
    <path d="M-12 110C44 108 100 92 148 52" stroke="#e1434e" opacity=".75"/>
  </g>
  <g fill="#e9eef7">
    <path transform="translate(136 36) rotate(48) scale(.42) translate(-12 -12)" d="M12 1.8c.75 0 1.25 1.3 1.25 3.2v4.1l8.25 4.8v2.15l-8.25-2.6v4.65l2.6 1.9v1.75L12 20.6l-3.85 1.15V20l2.6-1.9v-4.65L2.5 16.05V13.9l8.25-4.8V5c0-1.9.5-3.2 1.25-3.2z"/>
    <path transform="translate(143 43) rotate(48) scale(.42) translate(-12 -12)" d="M12 1.8c.75 0 1.25 1.3 1.25 3.2v4.1l8.25 4.8v2.15l-8.25-2.6v4.65l2.6 1.9v1.75L12 20.6l-3.85 1.15V20l2.6-1.9v-4.65L2.5 16.05V13.9l8.25-4.8V5c0-1.9.5-3.2 1.25-3.2z"/>
    <path transform="translate(150 50) rotate(48) scale(.42) translate(-12 -12)" d="M12 1.8c.75 0 1.25 1.3 1.25 3.2v4.1l8.25 4.8v2.15l-8.25-2.6v4.65l2.6 1.9v1.75L12 20.6l-3.85 1.15V20l2.6-1.9v-4.65L2.5 16.05V13.9l8.25-4.8V5c0-1.9.5-3.2 1.25-3.2z"/>
  </g>
</svg><span class="carte__ciel-texte">Illustration à venir</span></div>`);
}
