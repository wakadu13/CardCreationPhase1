import { FILIERES, MOTIFS_SIGNALEMENT } from '/shared/regles.js';
import { actualiser, naviguer } from '../app.js';
import { api } from '../api.js';
import { rendreCarte, rendreInclinable } from '../carte.js';
import { etat, formatDate, formatRebours, statutCampagne, utilisateur } from '../etat.js';
import { html, monter } from '../html.js';
import { icone } from '../icones.js';
import { enBloc, estVide } from '../textes.js';
import { confirmer, toast } from '../ui.js';

export const titre = 'Mes cartes';

const nomMotif = (id) => MOTIFS_SIGNALEMENT.find((m) => m.id === id)?.nom ?? id;

function emplacement(carte, ouverte) {
  const masquee = carte.statut === 'masquee';
  const s = carte.signalements;
  return html`<div class="alveole">
    <div class="alveole__carte">${rendreCarte(carte, { largeur: 236 })}</div>
    ${masquee
      ? html`<div class="alveole__alerte">
          <strong>Carte masquée</strong>
          <p>
            ${carte.masqueePar === 'organisation'
              ? 'Les organisateurs l’ont masquée suite aux signalements.'
              : `Elle a reçu ${s.total} signalement${s.total > 1 ? 's' : ''}.`}
            Personne d’autre ne la voit. Tu peux la supprimer pour libérer la place.
          </p>
          ${s.total > 0 && html`<ul>${Object.entries(s.motifs).map(([m, n]) => html`<li>${nomMotif(m)} · ${n}</li>`)}</ul>`}
        </div>`
      : s.total > 0 &&
        html`<p class="alveole__info">${icone('drapeau')} ${s.total} signalement${s.total > 1 ? 's' : ''} (masquage à ${etat.serveur.seuilSignalements})</p>`}
    ${carte.enRelecture && !masquee && html`<p class="alveole__info alveole__info--relecture">${icone('oeil')} En relecture : visible de tous dès qu’un autre éditeur l’aura validée.</p>`}
    <div class="groupe-boutons alveole__actions">
      ${ouverte && !masquee && html`<a class="btn btn--petit btn--secondaire" href="#/atelier/${carte.id}">${icone('crayon')} Modifier</a>`}
      ${ouverte && html`<button type="button" class="btn btn--petit btn--secondaire" data-dupliquer="${carte.id}" title="Créer une variante">${icone('copier')} Dupliquer</button>`}
      <button type="button" class="btn btn--petit btn--secondaire" data-supprimer="${carte.id}" data-nom="${carte.nom}">${icone('poubelle')} Supprimer</button>
    </div>
  </div>`;
}

function alveoleVide(index, statut) {
  const contenu = html`<span class="alveole-vide__num mono">${index ? `Emplacement ${index}` : 'Nouvelle carte'}</span>
    <span class="alveole-vide__plus">${icone('plus')}</span>
    <span class="alveole-vide__texte">${statut === 'ouverte' ? 'Concevoir une carte' : statut === 'a-venir' ? 'Ouverture prochaine' : 'Campagne terminée'}</span>`;
  return statut === 'ouverte'
    ? html`<a class="alveole-vide" href="#/atelier">${contenu}</a>`
    : html`<div class="alveole-vide alveole-vide--fermee">${contenu}</div>`;
}

function panneauCampagne(stats) {
  const c = etat.serveur.campagne;
  const statut = statutCampagne();
  const max = Math.max(1, ...Object.values(stats.parFiliere));
  return html`<aside class="pile hangar__cote">
    <div class="panneau panneau--hud">
      <p class="surtitre">Campagne</p>
      ${statut === 'ouverte' &&
      (c.fin
        ? html`<p class="rebours-grand mono" data-rebours="${c.fin}">${formatRebours(c.fin)}</p>
            <p class="discret petit">avant la clôture, le ${formatDate(c.fin)}</p>`
        : html`<p class="rebours-grand rebours-grand--texte">Ouverte</p><p class="discret petit">Date de clôture à venir.</p>`)}
      ${statut === 'a-venir' &&
      html`<p class="rebours-grand mono" data-rebours="${c.debut}">${formatRebours(c.debut)}</p>
        <p class="discret petit">avant l’ouverture, le ${formatDate(c.debut)}</p>`}
      ${statut === 'terminee' && html`<p class="rebours-grand rebours-grand--texte">Terminée</p><p class="discret petit">Les cartes sont prêtes pour la phase 2.</p>`}
    </div>
    <div class="panneau">
      <h2>Tableau de bord</h2>
      <dl class="chiffres">
        <div><dt>Cartes</dt><dd class="mono">${stats.cartes}</dd></div>
        <div><dt>Créateurs</dt><dd class="mono">${stats.createurs}</dd></div>
        <div><dt>Signataires</dt><dd class="mono">${stats.signataires}</dd></div>
      </dl>
      <h3 class="petit-titre">Cartes par filière</h3>
      <ul class="barres">
        ${FILIERES.map(
          (f) => html`<li style="--c:${f.couleur}">
            <span class="barres__nom" title="${f.domaine}"><span class="pastille-filiere forme-${f.forme}"></span>${f.nom}</span>
            <span class="barres__piste"><span class="barres__valeur" style="width:${(stats.parFiliere[f.id] / max) * 100}%"></span></span>
            <span class="barres__n mono">${stats.parFiliere[f.id]}</span>
          </li>`,
        )}
      </ul>
    </div>
  </aside>`;
}

async function charger(main) {
  const [{ cartes, limite }, stats] = await Promise.all([api('/cartes/miennes'), api('/stats')]);
  const statut = statutCampagne();
  const u = utilisateur();
  const prenom = (u.nomComplet ?? u.identifiant).split(' ')[0];
  const sansLimite = !limite || limite <= 0;
  const restantes = sansLimite ? 1 : limite - cartes.length;

  monter(
    main,
    html`<div class="entete-page">
        <div>
          <p class="surtitre">Atelier de @${u.identifiant} · éditeur de cartes</p>
          <h1>Salut ${prenom}</h1>
          <p>
            ${cartes.length === 0
              ? `Aucune carte pour l’instant. ${sansLimite ? 'Conçois autant de cartes que la promo en mérite.' : `Tu peux en concevoir jusqu’à ${limite}.`}`
              : sansLimite
                ? `${cartes.length} carte${cartes.length > 1 ? 's' : ''} conçue${cartes.length > 1 ? 's' : ''}. Pas de limite : à toi de jouer.`
                : restantes > 0
                  ? `${cartes.length} carte${cartes.length > 1 ? 's' : ''} sur ${limite}. Encore ${restantes} emplacement${restantes > 1 ? 's' : ''} libre${restantes > 1 ? 's' : ''}.`
                  : `Limite atteinte : ${limite} cartes sur ${limite}. Supprime une carte pour en concevoir une autre.`}
          </p>
        </div>
        <div class="groupe-boutons">
          ${statut === 'ouverte' && restantes > 0 && html`<a class="btn" href="#/atelier">${icone('plus')} Nouvelle carte</a>`}
          <a class="btn btn--secondaire" href="#/galerie">Voir la galerie</a>
        </div>
      </div>
      ${!estVide('hangar.message') &&
      html`<aside class="mot-organisation panneau" aria-label="Message des organisateurs">
        <p class="surtitre">Message des organisateurs</p>
        <div class="texte-riche">${enBloc('hangar.message')}</div>
      </aside>`}
      <div class="hangar">
        <section aria-label="Mes cartes">
          ${!sansLimite &&
          html`<div class="jauge-quota" role="img" aria-label="${cartes.length} cartes sur ${limite}">
            ${Array.from({ length: limite }, (_, i) => html`<span class="${i < cartes.length ? 'est-pleine' : ''}"></span>`)}
          </div>`}
          <div class="alveoles">
            ${cartes.map((c) => emplacement(c, statut === 'ouverte'))}
            ${Array.from({ length: Math.max(0, restantes) }, (_, i) => alveoleVide(sansLimite ? null : cartes.length + i + 1, statut))}
          </div>
        </section>
        ${panneauCampagne(stats)}
      </div>`,
  );

  main.querySelectorAll('.alveole__carte').forEach((el) => rendreInclinable(el, 8));
}

export async function afficher(main) {
  await charger(main);
  main.addEventListener('click', async (ev) => {
    const dupliquer = ev.target.closest('[data-dupliquer]');
    if (dupliquer) {
      try {
        const copie = await api(`/cartes/${dupliquer.dataset.dupliquer}/dupliquer`, { methode: 'POST', corps: {} });
        toast(`« ${copie.nom} » créée : à toi de la modifier.`);
        await actualiser();
        naviguer(`/atelier/${copie.id}`);
      } catch (err) {
        toast(err.message, 'erreur');
      }
      return;
    }
    const bouton = ev.target.closest('[data-supprimer]');
    if (!bouton) return;
    const ok = await confirmer({
      titre: 'Supprimer la carte ?',
      message: `« ${bouton.dataset.nom} » sera définitivement supprimée. ${
        statutCampagne() === 'ouverte' ? 'Tu pourras en concevoir une autre à la place.' : 'La campagne étant fermée, tu ne pourras pas la remplacer.'
      }`,
      bouton: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/cartes/${bouton.dataset.supprimer}`, { methode: 'DELETE' });
      toast('Carte supprimée.');
      await actualiser();
      await charger(main);
    } catch (err) {
      toast(err.message, 'erreur');
    }
  });
}
