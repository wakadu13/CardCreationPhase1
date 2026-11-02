import { BUDGET } from '/shared/regles.js';
import { etat } from './etat.js';
import { echapper, raw } from './html.js';

// Textes personnalisés par les organisateurs (voir shared/textes.js).

function variables() {
  const s = etat.serveur;
  return {
    nomJeu: s?.textes?.nomJeu ?? s?.nomJeu ?? '',
    promo: s?.promo ?? '',
    limiteCartes: s?.limiteCartes ?? '',
    seuil: s?.seuilSignalements ?? '',
    budget: BUDGET,
  };
}

const remplir = (source) => {
  const vars = variables();
  return String(source ?? '').replace(/\{(\w+)\}/g, (m, nom) => (nom in vars ? String(vars[nom]) : m));
};

// Mise en forme simple et sûre : le texte est d'abord échappé, puis on applique
// **gras**, *italique* et [lien](https://… ou #/page). Aucun HTML saisi n'est interprété.
function enLigneHtml(texte) {
  return echapper(texte)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?=\S)(.+?)(?<=\S)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|#\/)[^\s)]*)\)/g, (_m, libelle, url) => {
      const externe = url.startsWith('http');
      return `<a href="${url}"${externe ? ' target="_blank" rel="noopener noreferrer"' : ''}>${libelle}</a>`;
    });
}

export function formater(source, { enLigne = false } = {}) {
  const texte = remplir(source).trim();
  if (!texte) return '';
  if (enLigne) return raw(enLigneHtml(texte).replace(/\n/g, '<br>'));
  const blocs = texte.split(/\n\s*\n/).map((bloc) => {
    const lignes = bloc.split('\n');
    if (lignes.every((l) => /^\s*[-•]\s+/.test(l))) {
      return `<ul>${lignes.map((l) => `<li>${enLigneHtml(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`;
    }
    return `<p>${lignes.map(enLigneHtml).join('<br>')}</p>`;
  });
  return raw(blocs.join(''));
}

// Texte brut (sans mise en forme), variables remplacées : pour un titre, un attribut…
export const texte = (cle) => remplir(etat.serveur?.textes?.[cle] ?? '').replace(/\*\*|\*/g, '');

// Texte mis en forme, sur une ligne ou en paragraphes.
export const enLigne = (cle) => formater(etat.serveur?.textes?.[cle], { enLigne: true });
export const enBloc = (cle) => formater(etat.serveur?.textes?.[cle]);

export const estVide = (cle) => !remplir(etat.serveur?.textes?.[cle] ?? '').trim();
