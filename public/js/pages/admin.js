import { MOTIFS_SIGNALEMENT } from '/shared/regles.js';
import { api } from '../api.js';
import { rendreCarte } from '../carte.js';
import { formatDate } from '../etat.js';
import { html, monter } from '../html.js';
import { icone } from '../icones.js';
import { confirmer, toast } from '../ui.js';

export const titre = 'Organisation';

const nomMotif = (id) => MOTIFS_SIGNALEMENT.find((m) => m.id === id)?.nom ?? id;

async function charger(racine) {
  const { seuil, cartes } = await api('/admin/signalements');
  monter(
    racine,
    html`<div class="entete-page">
        <div>
          <p class="surtitre">Espace organisateurs</p>
          <h1>Signalements</h1>
          <p>
            Personne ne trie les cartes : ici, on n’intervient qu’en cas d’abus. Une carte est masquée automatiquement à ${seuil} signalements.
            « Rétablir » écarte les signalements actuels (les mêmes personnes ne pourront pas re-signaler).
          </p>
        </div>
        <a class="btn btn--secondaire" href="/api/admin/export" download>${icone('telecharger')} Exporter les cartes (JSON)</a>
      </div>
      ${cartes.length === 0
        ? html`<div class="vide"><p>Aucun signalement en cours. Ciel dégagé.</p></div>`
        : html`<ul class="liste-admin">
            ${cartes.map(
              (c) => html`<li class="panneau admin-carte">
                ${rendreCarte({ ...c, statut: 'visible' }, { largeur: 200 })}
                <div class="admin-carte__infos">
                  <div class="groupe-boutons">
                    <span class="puce ${c.statut === 'masquee' ? 'puce--danger' : ''}">${c.statut === 'masquee' ? 'Masquée' : 'Visible'}</span>
                    <span class="puce">${c.signalements.length} / ${seuil} signalements</span>
                    <span class="puce mono">@${c.auteur}</span>
                  </div>
                  <ul class="liste-signalements">
                    ${c.signalements.map(
                      (s) => html`<li>
                        <strong>${nomMotif(s.motif)}</strong> <span class="discret petit">par @${s.par}, le ${formatDate(s.le)}</span>
                        ${s.commentaire && html`<p>${s.commentaire}</p>`}
                      </li>`,
                    )}
                  </ul>
                  <div class="groupe-boutons">
                    <button type="button" class="btn btn--petit btn--secondaire" data-retablir="${c.id}">${icone('oeil')} Rétablir</button>
                    <button type="button" class="btn btn--petit btn--danger" data-supprimer-admin="${c.id}" data-nom="${c.nom}">${icone('poubelle')} Supprimer</button>
                  </div>
                </div>
              </li>`,
            )}
          </ul>`}`,
  );
}

export async function afficher(racine) {
  await charger(racine);
  racine.addEventListener('click', async (ev) => {
    const retablir = ev.target.closest('[data-retablir]');
    const supprimer = ev.target.closest('[data-supprimer-admin]');
    try {
      if (retablir) {
        await api(`/admin/cartes/${retablir.dataset.retablir}/retablir`, { methode: 'POST', corps: {} });
        toast('Carte rétablie.');
      } else if (supprimer) {
        const ok = await confirmer({
          titre: 'Supprimer la carte ?',
          message: `« ${supprimer.dataset.nom} » sera supprimée définitivement. À réserver aux contenus graves.`,
          bouton: 'Supprimer',
          danger: true,
        });
        if (!ok) return;
        await api(`/admin/cartes/${supprimer.dataset.supprimerAdmin}`, { methode: 'DELETE' });
        toast('Carte supprimée.');
      } else {
        return;
      }
      await charger(racine);
    } catch (err) {
      toast(err.message, 'erreur');
    }
  });
}
