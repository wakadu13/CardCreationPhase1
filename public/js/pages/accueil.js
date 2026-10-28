import { EXEMPLES } from '/shared/exemples.js';
import { actualiser, naviguer } from '../app.js';
import { api } from '../api.js';
import { rendreCarte, rendreInclinable } from '../carte.js';
import { etat, formatDate } from '../etat.js';
import { html, monter } from '../html.js';
import { pendant, toast } from '../ui.js';

export const titre = 'Bienvenue';

function formulaireConnexion() {
  return html`<form class="auth__form" data-form="connexion" novalidate>
    <div class="erreur-formulaire" role="alert"></div>
    <div class="champ">
      <label for="cx-id">Identifiant</label>
      <input id="cx-id" name="identifiant" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required />
    </div>
    <div class="champ">
      <label for="cx-mdp">Mot de passe</label>
      <input id="cx-mdp" name="motDePasse" type="password" autocomplete="current-password" required />
    </div>
    <button class="btn btn--bloc" type="submit">Se connecter</button>
    <p class="auth__note">
      Pas encore de compte ? Ils sont créés par les organisateurs pour les participants choisis : demande-leur tes identifiants.
    </p>
  </form>`;
}

function phases() {
  const c = etat.serveur.campagne;
  const dates =
    c.debut && c.fin
      ? `Du ${formatDate(c.debut, { timeStyle: undefined })} au ${formatDate(c.fin, { timeStyle: undefined })}`
      : c.fin
        ? `Jusqu’au ${formatDate(c.fin, { timeStyle: undefined })}`
        : 'Dates annoncées par les organisateurs';
  return html`<section class="phases" aria-labelledby="titre-phases">
    <h2 id="titre-phases" class="sr-only">Déroulé</h2>
    <div class="phase phase--active">
      <span class="phase__num mono">Phase 1 · 1 semaine</span>
      <h3>Campagne de création</h3>
      <p>Signe le certificat de consentement, puis conçois jusqu’à <strong>${etat.serveur.limiteCartes} cartes</strong>. Une carte qui va trop loin se signale.</p>
      <span class="puce puce--or">${dates}</span>
    </div>
    <div class="phase">
      <span class="phase__num mono">Phase 2 · 2 semaines</span>
      <h3>Le jeu</h3>
      <p>Les cartes de la phase 1 s’affrontent, filière contre filière. Des fenêtres d’ajout de cartes seront annoncées à l’avance.</p>
      <span class="puce">Bientôt</span>
    </div>
  </section>`;
}

export function afficher(main) {
  monter(
    main,
    html`<section class="accueil">
        <div class="accueil__texte">
          <p class="surtitre">Salon-de-Provence · Phase 1</p>
          <h1 class="titre-pochoir">${etat.serveur.nomJeu}</h1>
          <p class="accueil__accroche">
            Le jeu de cartes de la promo, fait par la promo. Pendant une semaine, chacun conçoit ses cartes&nbsp;:
            un nom, une filière, des points de vie, des attaques… et beaucoup d’autodérision.
          </p>
          <ol class="etapes">
            <li><span class="etapes__num">1</span><span><strong>Connecte-toi</strong> avec les identifiants reçus des organisateurs</span></li>
            <li><span class="etapes__num">2</span><span><strong>Signe le certificat</strong> de consentement</span></li>
            <li><span class="etapes__num">3</span><span><strong>Conçois jusqu’à ${etat.serveur.limiteCartes} cartes</strong> dans l’atelier</span></li>
          </ol>
          <div class="panneau panneau--hud auth">
            <h2 class="auth__titre">Connexion</h2>
            <div id="auth-corps">${formulaireConnexion()}</div>
          </div>
        </div>
        <div class="accueil__vitrine" aria-label="Exemples de cartes">
          <svg class="fumees" viewBox="0 0 600 600" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
            <g fill="none" stroke-linecap="round" stroke-width="14">
              <path d="M-40 560C140 520 330 420 470 170S620 -10 660 -40" stroke="#2c56c4" opacity=".55" />
              <path d="M-40 590C150 552 350 450 494 196S646 18 690 -14" stroke="#f2f2f2" opacity=".5" />
              <path d="M-40 620C160 584 370 480 518 222S672 46 720 12" stroke="#d52b36" opacity=".55" />
            </g>
          </svg>
          <div class="eventail">
            ${EXEMPLES.map((c, i) => html`<div class="eventail__carte eventail__carte--${i}">${rendreCarte(c, { largeur: 260, numero: i + 1 })}</div>`)}
          </div>
          <p class="vitrine__legende mono">Cartes d’exemple · survole-les</p>
        </div>
      </section>
      ${phases()}`,
  );

  main.querySelectorAll('.eventail__carte').forEach((el) => rendreInclinable(el, 12));

  const corps = main.querySelector('#auth-corps');
  corps.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const erreur = form.querySelector('.erreur-formulaire');
    const donnees = Object.fromEntries(new FormData(form));
    erreur.textContent = '';
    await pendant(form.querySelector('[type=submit]'), async () => {
      try {
        await api('/connexion', { methode: 'POST', corps: donnees });
        await actualiser();
        toast('Connexion réussie. Bon vol !');
        naviguer('/');
      } catch (err) {
        erreur.textContent = err.message;
      }
    });
  });
}
