// Petit moteur de gabarits : tout ce qui est interpolé est échappé,
// sauf ce qui est explicitement marqué comme sûr avec raw() ou produit par html``.

class Html {
  constructor(texte) {
    this.texte = texte;
  }
  toString() {
    return this.texte;
  }
}

const ENTITES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const echapper = (v) => String(v).replace(/[&<>"']/g, (c) => ENTITES[c]);

export const raw = (texte) => new Html(String(texte));

function rendre(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (v instanceof Html) return v.texte;
  if (Array.isArray(v)) return v.map(rendre).join('');
  return echapper(v);
}

export function html(morceaux, ...valeurs) {
  let sortie = morceaux[0];
  valeurs.forEach((v, i) => {
    sortie += rendre(v) + morceaux[i + 1];
  });
  return new Html(sortie);
}

export function monter(element, contenu) {
  element.innerHTML = rendre(contenu);
  return element;
}

export function fragment(contenu) {
  const t = document.createElement('template');
  t.innerHTML = rendre(contenu);
  return t.content;
}
