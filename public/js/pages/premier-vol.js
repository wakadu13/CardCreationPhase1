import { actualiser, naviguer } from '../app.js';
import { api } from '../api.js';
import { utilisateur } from '../etat.js';
import { html, monter } from '../html.js';
import { pendant, toast } from '../ui.js';

export const titre = 'Premier vol';

// Première connexion : remplacer le mot de passe provisoire donné par les organisateurs.
export function afficher(racine) {
  const u = utilisateur();
  const prenom = (u.nomComplet ?? u.identifiant).split(' ')[0];

  monter(
    racine,
    html`<div class="premier-vol">
      <div class="entete-page">
        <div>
          <p class="surtitre">Premier vol</p>
          <h1>Bienvenue ${prenom}</h1>
          <p>
            Ton compte a été créé par les organisateurs avec un mot de passe provisoire.
            Choisis maintenant ton mot de passe personnel : tu seras le ou la seule à le connaître.
          </p>
        </div>
      </div>
      <form class="panneau panneau--hud" novalidate>
        <p class="discret petit">Identifiant : <strong class="mono">@${u.identifiant}</strong></p>
        <div class="erreur-formulaire" role="alert"></div>
        <div class="champ">
          <label for="pv-nouveau">Nouveau mot de passe</label>
          <input id="pv-nouveau" name="nouveau" type="password" autocomplete="new-password" minlength="8" required />
          <span class="champ__aide">8 caractères minimum.</span>
        </div>
        <div class="champ">
          <label for="pv-confirmation">Confirme le mot de passe</label>
          <input id="pv-confirmation" name="confirmation" type="password" autocomplete="new-password" minlength="8" required />
        </div>
        <button class="btn btn--bloc" type="submit">Enregistrer et continuer</button>
      </form>
    </div>`,
  );

  const form = racine.querySelector('form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erreur = form.querySelector('.erreur-formulaire');
    erreur.textContent = '';
    if (form.nouveau.value !== form.confirmation.value) {
      erreur.textContent = 'Les deux mots de passe ne sont pas identiques.';
      return;
    }
    await pendant(form.querySelector('[type=submit]'), async () => {
      try {
        await api('/moi/mot-de-passe', { methode: 'POST', corps: { nouveau: form.nouveau.value } });
        await actualiser();
        toast('Mot de passe enregistré.');
        naviguer('/');
      } catch (err) {
        erreur.textContent = err.message;
      }
    });
  });
}
