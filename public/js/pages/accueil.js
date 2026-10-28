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
  </form>`;
}

function formulaireInscription() {
  return html`<form class="auth__form" data-form="inscription" novalidate>
    <div class="erreur-formulaire" role="alert"></div>
    <div class="champ">
      <label for="in-id">Identifiant</label>
      <input id="in-id" name="identifiant" type="text" autocomplete="username" autocapitalize="none" spellcheck="false"
        minlength="3" maxlength="24" required />
      <span class="champ__aide">Visible par tous sur tes cartes. 3 à 24 caractères : lettres, chiffres, point, tirets.</span>
    </div>
    <div class="champ">
      <label for="in-mdp">Mot de passe</label>
      <input id="in-mdp" name="motDePasse" type="password" autocomplete="new-password" minlength="8" required />
      <span class="champ__aide">8 caractères minimum.</span>
    </div>
    ${etat.serveur.inscriptionAvecCode &&
    html`<div class="champ">
      <label for="in-code">Code d’accès de la promo</label>
      <input id="in-code" name="codeAcces" type="text" autocomplete="off" required />
      <span class="champ__aide">Communiqué par les organisateurs.</span>
    </div>`}
    <button class="btn btn--bloc" type="submit">Créer mon compte</button>
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
  let onglet = 'connexion';

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
            <li><span class="etapes__num">1</span><span><strong>Signe le certificat</strong> de consentement</span></li>
            <li><span class="etapes__num">2</span><span><strong>Conçois jusqu’à ${etat.serveur.limiteCartes} cartes</strong> dans l’atelier</span></li>
            <li><span class="etapes__num">3</span><span><strong>Prépare-toi</strong> pour la phase de jeu</span></li>
          </ol>
          <div class="panneau panneau--hud auth">
            <div class="onglets" role="tablist">
              <button type="button" role="tab" id="tab-connexion" aria-selected="true" aria-controls="auth-corps" data-onglet="connexion">Connexion</button>
              <button type="button" role="tab" id="tab-inscription" aria-selected="false" aria-controls="auth-corps" data-onglet="inscription">Inscription</button>
            </div>
            <div id="auth-corps" role="tabpanel">${formulaireConnexion()}</div>
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
  main.querySelector('.onglets').addEventListener('click', (ev) => {
    const bouton = ev.target.closest('[data-onglet]');
    if (!bouton || bouton.dataset.onglet === onglet) return;
    onglet = bouton.dataset.onglet;
    main.querySelectorAll('[data-onglet]').forEach((b) => b.setAttribute('aria-selected', String(b === bouton)));
    corps.setAttribute('aria-labelledby', bouton.id);
    monter(corps, onglet === 'connexion' ? formulaireConnexion() : formulaireInscription());
    corps.querySelector('input')?.focus();
  });

  corps.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const erreur = form.querySelector('.erreur-formulaire');
    const donnees = Object.fromEntries(new FormData(form));
    erreur.textContent = '';
    await pendant(form.querySelector('[type=submit]'), async () => {
      try {
        await api(form.dataset.form === 'connexion' ? '/connexion' : '/inscription', { methode: 'POST', corps: donnees });
        await actualiser();
        toast(form.dataset.form === 'connexion' ? 'Connexion réussie. Bon vol !' : 'Compte créé. Dernière étape : le certificat.');
        naviguer('/');
      } catch (err) {
        erreur.textContent = err.message;
      }
    });
  });
}
