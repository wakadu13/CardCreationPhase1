import { COMBAT } from '/shared/combat.js';
import { EFFETS, filiere } from '/shared/regles.js';
import { html, monter } from '../html.js';
import { icone } from '../icones.js';

export const titre = 'Système de combat';

const nomEffet = (id) => EFFETS.find((e) => e.id === id)?.nom ?? id;

// Petite carte « jeton » de l'exemple de main
function carteExemple(c) {
  const f = filiere(c.filiere);
  return html`<div class="mini-carte" style="--c:${f.couleur}">
    <span class="mini-carte__filiere">${icone(f.icone)} ${f.nom}</span>
    <strong>${c.nom}</strong>
    <span class="mini-carte__chiffres"><span>PV ${c.pv}</span><span>${c.degats} dégâts</span></span>
  </div>`;
}

export function afficher(racine) {
  const p = COMBAT.partie;
  monter(
    racine,
    html`<div class="entete-page">
        <div>
          <p class="surtitre">Phase 2 · proposition</p>
          <h1>${COMBAT.titre}</h1>
          <p>${COMBAT.resume}</p>
        </div>
        <a class="btn btn--secondaire" href="#/regles">${icone('retour')} Règles</a>
      </div>

      <div class="combat pile">
        <section class="panneau panneau--hud">
          <h2>La formule</h2>
          <div class="formule">
            <span class="formule__bloc formule__bloc--jetons"><small>Jetons</small>${COMBAT.score.jetons}</span>
            <span class="formule__x">×</span>
            <span class="formule__bloc formule__bloc--mult"><small>Multiplicateur</small>${COMBAT.score.multiplicateur}</span>
            <span class="formule__x">=</span>
            <span class="formule__bloc formule__bloc--score"><small>Score</small>à comparer à la mise</span>
          </div>
        </section>

        <div class="grille-2">
          <section class="panneau">
            <h2>Une partie</h2>
            <dl class="fiche fiche--combat">
              <div><dt>Joueurs</dt><dd>${p.joueurs}</dd></div>
              <div><dt>Paquet</dt><dd>${p.paquet}</dd></div>
              <div><dt>Par manche</dt><dd>${p.mainsParManche} mains, ${p.defaussesParManche} défausses, ${p.taillemain} cartes en main, on joue ${p.carteParMain}</dd></div>
              <div><dt>Victoire</dt><dd>${p.victoire}</dd></div>
            </dl>
          </section>

          <section class="panneau">
            <h2>Les mises</h2>
            <ol class="mises">
              ${p.manches.map(
                (m) => html`<li class="mise ${m.nom.startsWith('Boss') ? 'mise--boss' : ''}">
                  <span class="mise__ante mono">Ante ${m.ante}</span>
                  <strong>${m.nom}</strong>
                  <span class="mise__cible mono">${m.cible}</span>
                  ${m.regle && html`<span class="mise__regle">${m.regle}</span>`}
                </li>`,
              )}
            </ol>
          </section>
        </div>

        <section class="panneau">
          <h2>Les combinaisons</h2>
          <p class="discret">Comme les mains au poker, mais avec les filières. Les bonus s’additionnent au multiplicateur.</p>
          <div class="table-defilante">
            <table class="tableau">
              <thead><tr><th scope="col">Main</th><th scope="col">Condition</th><th scope="col">Multiplicateur</th><th scope="col">Exemple</th></tr></thead>
              <tbody>
                ${COMBAT.combinaisons.map(
                  (c) => html`<tr><th scope="row">${c.nom}</th><td>${c.condition}</td><td class="mono texte-succes">${c.mult}</td><td class="discret">${c.exemple}</td></tr>`,
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div class="grille-2">
          <section class="panneau">
            <h2>Le cycle en combat</h2>
            <p>${COMBAT.cycle.regle}</p>
            <p class="discret"><em>${COMBAT.cycle.exemple}</em></p>
          </section>
          <section class="panneau">
            <h2>Les effets des cartes</h2>
            <ul class="liste-puces">
              ${COMBAT.effets.map((e) => html`<li><strong>${nomEffet(e.id)}</strong> : ${e.action}</li>`)}
            </ul>
          </section>
        </div>

        <section class="panneau panneau--hud">
          <h2>Exemple de main · mise ${COMBAT.exemple.mise}</h2>
          <div class="main-exemple">${COMBAT.exemple.main.map(carteExemple)}</div>
          <ol class="calcul">
            ${COMBAT.exemple.detail.map((l) => html`<li class="mono">${l}</li>`)}
          </ol>
        </section>

        <section class="panneau">
          <h2>À régler par l’organisation</h2>
          <ul class="liste-puces">
            ${COMBAT.reglages.map((r) => html`<li>${r}</li>`)}
          </ul>
        </section>
      </div>`,
  );
}
