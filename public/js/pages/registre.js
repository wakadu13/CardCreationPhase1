import { api } from '../api.js';
import { formatDate } from '../etat.js';
import { html, monter } from '../html.js';

export const titre = 'Registre des signataires';

const normaliser = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

// Bande patronymique : NOM en capitales, prénom ensuite (comme sur une tenue).
function bande(nomComplet) {
  const morceaux = nomComplet.trim().split(/\s+/);
  if (morceaux.length < 2) return nomComplet.toUpperCase();
  const prenom = morceaux.shift();
  return `${morceaux.join(' ').toUpperCase()} ${prenom}`;
}

export async function afficher(racine) {
  const signataires = await api('/registre');

  monter(
    racine,
    html`<div class="entete-page">
        <div>
          <p class="surtitre">Registre</p>
          <h1>Les signataires</h1>
          <p>
            Ces ${signataires.length} personne${signataires.length > 1 ? 's ont' : ' a'} signé le certificat de consentement :
            ce sont les seules qu’on peut mettre en scène sur une carte. Pas sur la liste ? Pas sur une carte.
          </p>
        </div>
        <div class="champ champ--compact registre__recherche">
          <label for="reg-recherche" class="sr-only">Rechercher</label>
          <input id="reg-recherche" type="search" placeholder="Rechercher un nom…" />
        </div>
      </div>
      <ul class="registre"></ul>`,
  );

  const liste = racine.querySelector('.registre');
  const rendre = (q = '') => {
    const filtre = normaliser(q.trim());
    const visibles = signataires.filter((s) => !filtre || normaliser(`${s.nomComplet} ${s.identifiant}`).includes(filtre));
    monter(
      liste,
      visibles.length
        ? visibles.map(
            (s) => html`<li class="ecusson ${s.aJour ? '' : 'ecusson--ancien'}">
              <span class="ecusson__bande">${bande(s.nomComplet)}</span>
              <span class="ecusson__infos">
                <span class="mono">@${s.identifiant}</span>
                <span>${s.nbCartes} carte${s.nbCartes > 1 ? 's' : ''}</span>
              </span>
              <span class="ecusson__date">${s.aJour ? `Signé le ${formatDate(s.signeLe, { timeStyle: undefined })}` : 'Doit re-signer la nouvelle version'}</span>
            </li>`,
          )
        : html`<li class="vide">Personne ne correspond à « ${q} ».</li>`,
    );
  };
  racine.querySelector('#reg-recherche').addEventListener('input', (ev) => rendre(ev.target.value));
  rendre();
}
