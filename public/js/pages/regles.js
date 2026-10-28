import { EXEMPLES } from '/shared/exemples.js';
import { ATTAQUE, BUDGET, EFFETS, FILIERES, LIMITE_CARTES, PV, calculerCout } from '/shared/regles.js';
import { rendreCarte, rendreInclinable } from '../carte.js';
import { etat } from '../etat.js';
import { html, monter } from '../html.js';
import { icone } from '../icones.js';

export const titre = 'Règles du jeu';

const signe = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

export function afficher(racine) {
  const exemple = EXEMPLES[1];
  const cout = calculerCout(exemple);
  const seuil = etat.serveur.seuilSignalements;

  monter(
    racine,
    html`<div class="entete-page">
        <div>
          <p class="surtitre">Briefing</p>
          <h1>Règles du jeu</h1>
          <p>L’humour est libre, l’équilibre est garanti : chaque carte reçoit le même budget de puissance, quelle que soit la personne qui la conçoit.</p>
        </div>
      </div>

      <div class="regles">
        <nav class="regles__sommaire panneau" aria-label="Sommaire">
          <p class="surtitre">Sommaire</p>
          <ol>
            <li><a href="#/regles" data-ancre="deroule">Déroulé</a></li>
            <li><a href="#/regles" data-ancre="budget">Budget de puissance</a></li>
            <li><a href="#/regles" data-ancre="filieres">Filières</a></li>
            <li><a href="#/regles" data-ancre="effets">Effets d’attaque</a></li>
            <li><a href="#/regles" data-ancre="moderation">Signalements</a></li>
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
            <h2>Filières</h2>
            <p>Elles jouent le rôle des types : chaque carte appartient à l’une des trois filières, qui lui donne sa couleur et son emblème.
              Les forces et faiblesses entre filières seront dévoilées avec la phase 2.</p>
            <ul class="liste-filieres">
              ${FILIERES.map(
                (f) => html`<li style="--c:${f.couleur}"><span class="choix-filiere__icone">${icone(f.icone)}</span>
                  <span class="choix-filiere__nom">${f.nom}<small>${f.domaine}</small></span></li>`,
              )}
            </ul>
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
