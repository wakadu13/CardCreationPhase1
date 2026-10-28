import { EXEMPLES } from '/shared/exemples.js';
import { ATTAQUE, BONUS_AVANTAGE, BUDGET, CYCLE, EFFETS, FILIERES, LIMITE_CARTES, PV, avantageContre, calculerCout, filiere } from '/shared/regles.js';
import { rendreCarte, rendreInclinable } from '../carte.js';
import { etat } from '../etat.js';
import { html, monter, raw } from '../html.js';
import { dessinIcone, icone } from '../icones.js';
import { enBloc, enLigne, estVide, texte } from '../textes.js';

export const titre = 'Règles du jeu';

// Schéma du cycle : trois filières en triangle, une flèche vers la filière dominée.
function schemaCycle() {
  const positions = { [CYCLE[0]]: [170, 62], [CYCLE[1]]: [292, 250], [CYCLE[2]]: [48, 250] };
  const R = 38;
  const fleches = CYCLE.map((id) => {
    const [x1, y1] = positions[id];
    const [x2, y2] = positions[avantageContre(id)];
    const d = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / d;
    const uy = (y2 - y1) / d;
    const [ax, ay, bx, by] = [x1 + ux * (R + 8), y1 + uy * (R + 8), x2 - ux * (R + 12), y2 - uy * (R + 12)];
    const [mx, my] = [(x1 + x2) / 2, (y1 + y2) / 2];
    return `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" class="cycle__fleche" marker-end="url(#cycle-pointe)"/>
      <g transform="translate(${mx.toFixed(1)} ${my.toFixed(1)})"><rect x="-21" y="-12" width="42" height="24" rx="12" class="cycle__bulle"/><text y="5" class="cycle__bonus">+${BONUS_AVANTAGE}</text></g>`;
  });
  const noeuds = CYCLE.map((id) => {
    const f = filiere(id);
    const [x, y] = positions[id];
    return `<g transform="translate(${x} ${y})">
      <circle r="${R}" fill="${f.couleur}" class="cycle__noeud"/>
      <g color="#fff" transform="translate(-17 -24) scale(1.42)">${dessinIcone(f.icone)}</g>
      <text y="25" class="cycle__nom">${f.nom}</text>
    </g>`;
  });
  return raw(`<svg viewBox="0 0 340 300" class="cycle" role="img" aria-label="${CYCLE.map((id) => filiere(id).nom).join(' domine ')} domine ${filiere(CYCLE[0]).nom}">
    <defs><marker id="cycle-pointe" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" class="cycle__pointe"/></marker></defs>
    ${fleches.join('')}${noeuds.join('')}
  </svg>`);
}

const signe = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

export function afficher(racine) {
  const exemple = EXEMPLES[1];
  const cout = calculerCout(exemple);
  const seuil = etat.serveur.seuilSignalements;
  const sectionLibre = !estVide('regles.sectionTitre') || !estVide('regles.sectionTexte');

  monter(
    racine,
    html`<div class="entete-page">
        <div>
          <p class="surtitre">Briefing</p>
          <h1>Règles du jeu</h1>
          <div class="texte-riche">${enBloc('regles.intro')}</div>
        </div>
      </div>

      <div class="regles">
        <nav class="regles__sommaire panneau" aria-label="Sommaire">
          <p class="surtitre">Sommaire</p>
          <ol>
            <li><a href="#/regles" data-ancre="deroule">Déroulé</a></li>
            <li><a href="#/regles" data-ancre="budget">Budget de puissance</a></li>
            <li><a href="#/regles" data-ancre="filieres">Filières et cycle</a></li>
            <li><a href="#/regles" data-ancre="effets">Effets d’attaque</a></li>
            <li><a href="#/regles" data-ancre="moderation">Signalements</a></li>
            ${sectionLibre && html`<li><a href="#/regles" data-ancre="infos">${texte('regles.sectionTitre') || 'Informations'}</a></li>`}
          </ol>
        </nav>

        <div class="regles__contenu pile">
          <section class="panneau" id="deroule">
            <h2>Déroulé</h2>
            <ol class="frise">
              <li>
                <span class="mono">Phase 1 · 1 semaine</span>
                <strong>Campagne de création</strong>
                <p>Chaque participant signe le certificat de consentement, puis conçoit au plus ${LIMITE_CARTES} cartes. Modification et suppression libres jusqu’à la clôture.</p>
              </li>
              <li>
                <span class="mono">Phase 2 · 2 semaines</span>
                <strong>Le jeu</strong>
                <p>Les cartes de la phase 1 s’affrontent. Le jeu se joue en plusieurs manches ; des fenêtres d’ajout de cartes sont fixées à l’avance (${LIMITE_CARTES} cartes maximum par personne et par fenêtre).</p>
              </li>
            </ol>
          </section>

          <section class="panneau" id="budget">
            <h2>Budget de puissance : ${BUDGET} points</h2>
            <div class="regles__budget">
              <div>
                <p>Comme dans un devis de masse avant le décollage, tout se paie. Une carte ne peut pas dépasser ${BUDGET} points.</p>
                <div class="table-defilante"><table class="tableau">
                  <thead><tr><th scope="col">Élément</th><th scope="col">Règle</th><th scope="col">Coût</th></tr></thead>
                  <tbody>
                    <tr><th scope="row">Points de vie</th><td>${PV.min} à ${PV.max}, par paliers de ${PV.pas}</td><td class="mono">PV ÷ 2</td></tr>
                    <tr><th scope="row">Attaques</th><td>${ATTAQUE.min} ou ${ATTAQUE.max} par carte</td><td class="mono">voir ci-dessous</td></tr>
                    <tr><th scope="row">Dégâts</th><td>0 à ${ATTAQUE.degatsMax}, ${ATTAQUE.degatsParEnergie} max par énergie</td><td class="mono">dégâts ÷ 2</td></tr>
                    <tr><th scope="row">Énergie</th><td>${ATTAQUE.energieMin} à ${ATTAQUE.energieMax} jetons</td><td class="mono">−5 par jeton après le 1er</td></tr>
                    <tr><th scope="row">Effet</th><td>un par attaque</td><td class="mono">selon l’effet</td></tr>
                  </tbody>
                </table></div>
                <p class="discret petit">Une attaque coûte toujours au moins ${ATTAQUE.coutMin} points. Exemple : 60 dégâts pour 2 énergies = 30 − 5 = 25 points.</p>
              </div>
              <figure class="regles__exemple">
                <div data-inclinable>${rendreCarte(exemple, { largeur: 240, numero: 2 })}</div>
                <figcaption>
                  <ul class="budget__detail">
                    <li><span>${exemple.pv} PV</span><span class="mono">${cout.pv}</span></li>
                    ${exemple.attaques.map((a, i) => html`<li><span>${a.nom}</span><span class="mono">${cout.attaques[i]}</span></li>`)}
                    <li class="budget__reste"><span>Total</span><span class="mono">${cout.total} / ${BUDGET}</span></li>
                  </ul>
                </figcaption>
              </figure>
            </div>
          </section>

          <section class="panneau" id="filieres">
            <h2>Filières et cycle des forces</h2>
            <p>Elles jouent le rôle des types : chaque carte appartient à l’une des trois filières, qui lui donne sa couleur et son emblème.</p>
            <ul class="liste-filieres">
              ${FILIERES.map(
                (f) => html`<li style="--c:${f.couleur}"><span class="choix-filiere__icone">${icone(f.icone)}</span>
                  <span class="choix-filiere__nom">${f.nom}<small>${f.domaine}</small></span></li>`,
              )}
            </ul>
            <div class="regles__cycle">
              ${schemaCycle()}
              <div>
                <p>
                  Comme à pierre-feuille-ciseaux, chaque filière en domine une autre :
                  <strong>${CYCLE.map((id) => filiere(id).nom).join(' > ')} > ${filiere(CYCLE[0]).nom}</strong>.
                  Une attaque portée contre la filière qu’on domine inflige <strong>${BONUS_AVANTAGE} dégâts de plus</strong>.
                  Chaque carte a donc un avantage et une faiblesse, indiqués en bas de la carte.
                </p>
                <ul class="liste-cycle">
                  ${CYCLE.map((id) => {
                    const f = filiere(id);
                    const cible = filiere(avantageContre(id));
                    return html`<li>
                      <strong><span class="pastille-filiere" style="--c:${f.couleur}"></span> ${f.nom} domine ${cible.nom}</strong>
                      ${!estVide(`cycle.${id}`) && html`<span>${enLigne(`cycle.${id}`)}</span>`}
                    </li>`;
                  })}
                </ul>
              </div>
            </div>
          </section>

          <section class="panneau" id="effets">
            <h2>Effets d’attaque</h2>
            <p>Les effets sont choisis dans cette liste pour pouvoir être appliqués automatiquement pendant le jeu. Le texte libre de l’attaque, lui, sert à faire rire.</p>
            <div class="table-defilante"><table class="tableau">
              <thead><tr><th scope="col">Effet</th><th scope="col">Ce qu’il fait</th><th scope="col">Coût</th></tr></thead>
              <tbody>
                ${EFFETS.map(
                  (e) => html`<tr><th scope="row">${e.nom}</th><td>${e.texte || '—'}</td><td class="mono ${e.cout < 0 ? 'texte-succes' : ''}">${signe(e.cout)}</td></tr>`,
                )}
              </tbody>
            </table></div>
            <p class="discret petit">Un coût négatif est un handicap : il rend des points à dépenser ailleurs.</p>
          </section>

          <section class="panneau" id="moderation">
            <h2>Signalements</h2>
            <ul class="liste-puces">
              <li>Seules les personnes choisies par les organisateurs ont un compte. Le certificat de consentement est la protection de base.</li>
              <li>Chaque carte a un bouton <strong>Signaler</strong>. Un signalement par personne et par carte, anonyme pour l’auteur.</li>
              <li>Au bout de <strong>${seuil} signalements</strong>, la carte est masquée automatiquement pour tout le monde sauf son auteur.</li>
              <li>Les organisateurs examinent chaque signalement : ils peuvent masquer une carte, la réafficher en classant les signalements, ou la supprimer.</li>
              <li>L’auteur d’une carte masquée voit les motifs et peut la supprimer pour en concevoir une autre. Une carte masquée ne peut plus être modifiée.</li>
            </ul>
          </section>

          ${sectionLibre &&
          html`<section class="panneau" id="infos">
            <h2>${texte('regles.sectionTitre') || 'Informations'}</h2>
            <div class="texte-riche">${enBloc('regles.sectionTexte')}</div>
          </section>`}
        </div>
      </div>`,
  );

  rendreInclinable(racine.querySelector('[data-inclinable]'), 10);
  racine.querySelector('.regles__sommaire').addEventListener('click', (ev) => {
    const lien = ev.target.closest('[data-ancre]');
    if (!lien) return;
    ev.preventDefault();
    racine.querySelector(`#${lien.dataset.ancre}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
