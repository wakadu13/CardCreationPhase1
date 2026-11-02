import { actualiser, naviguer } from '../app.js';
import { api } from '../api.js';
import { utilisateur } from '../etat.js';
import { html, monter } from '../html.js';
import { confirmer, pendant, toast } from '../ui.js';

export const titre = 'Mon compte';

export function afficher(racine) {
  const u = utilisateur();
  monter(
    racine,
    html`<div class="entete-page">
        <div>
          <p class="surtitre">Compte</p>
          <h1>@${u.identifiant}</h1>
          <p>
            ${u.estAdmin
              ? 'Compte organisateur.'
              : u.certificatValide
                ? `Certificat signé au nom de ${u.nomComplet}.`
                : 'Certificat pas encore signé.'}
          </p>
        </div>
        ${!u.estAdmin && u.certificatValide && html`<a class="btn btn--secondaire" href="#/certificat">Voir mon certificat</a>`}
      </div>
      <div class="grille-2">
        <form class="panneau" data-form="mdp" novalidate>
          <h2>Changer de mot de passe</h2>
          <div class="erreur-formulaire" role="alert"></div>
          <div class="champ">
            <label for="mdp-actuel">Mot de passe actuel</label>
            <input id="mdp-actuel" name="actuel" type="password" autocomplete="current-password" required />
          </div>
          <div class="champ">
            <label for="mdp-nouveau">Nouveau mot de passe</label>
            <input id="mdp-nouveau" name="nouveau" type="password" autocomplete="new-password" minlength="8" required />
            <span class="champ__aide">8 caractères minimum. Tes autres appareils seront déconnectés.</span>
          </div>
          <button class="btn" type="submit">Mettre à jour</button>
        </form>

        <form class="panneau zone-danger" data-form="suppression" novalidate>
          <h2>${u.estAdmin ? 'Supprimer mon compte' : 'Retirer mon consentement'}</h2>
          <p>
            ${u.estAdmin
              ? 'Supprime définitivement ce compte organisateur. Impossible s’il est le dernier.'
              : 'Supprime définitivement ton compte, tes cartes, tes signalements et ton certificat. Tu disparais aussi du registre. Tu ne pourras plus te connecter sans un nouveau compte créé par les organisateurs.'}
          </p>
          <div class="erreur-formulaire" role="alert"></div>
          <div class="champ">
            <label for="sup-mdp">Confirme avec ton mot de passe</label>
            <input id="sup-mdp" name="motDePasse" type="password" autocomplete="current-password" required />
          </div>
          <button class="btn btn--danger" type="submit">Supprimer mon compte</button>
        </form>
      </div>`,
  );

  racine.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const erreur = form.querySelector('.erreur-formulaire');
    erreur.textContent = '';
    const donnees = Object.fromEntries(new FormData(form));

    if (form.dataset.form === 'mdp') {
      await pendant(form.querySelector('[type=submit]'), async () => {
        try {
          await api('/moi/mot-de-passe', { methode: 'POST', corps: donnees });
          form.reset();
          toast('Mot de passe mis à jour.');
        } catch (err) {
          erreur.textContent = err.message;
        }
      });
      return;
    }

    const ok = await confirmer({
      titre: 'Supprimer définitivement ?',
      message: 'Ton compte, tes cartes et ton certificat seront effacés. Cette action est irréversible.',
      bouton: 'Tout supprimer',
      danger: true,
    });
    if (!ok) return;
    await pendant(form.querySelector('[type=submit]'), async () => {
      try {
        await api('/moi', { methode: 'DELETE', corps: donnees });
        await actualiser();
        toast('Compte supprimé. Merci d’avoir participé.');
        naviguer('/');
      } catch (err) {
        erreur.textContent = err.message;
      }
    });
  });
}
