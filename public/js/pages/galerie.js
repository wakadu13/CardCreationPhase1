import { BONUS_AVANTAGE, FILIERES, MOTIFS_SIGNALEMENT, avantageContre, faiblesseContre, filiere } from '/shared/regles.js';
import { api } from '../api.js';
import { rendreCarte, rendreInclinable } from '../carte.js';
import { etat, formatDate, statutCampagne } from '../etat.js';
import { html, monter } from '../html.js';
import { icone } from '../icones.js';
import { enBloc } from '../textes.js';
import { ouvrirDialogue, pendant, toast } from '../ui.js';

export const titre = 'Galerie';

const TRIS = {
  recentes: { nom: 'Plus récentes', f: (a, b) => b.id - a.id },
  anciennes: { nom: 'Plus anciennes', f: (a, b) => a.id - b.id },
  pv: { nom: 'Plus de PV', f: (a, b) => b.pv - a.pv },
  degats: { nom: 'Plus de dégâts', f: (a, b) => maxDegats(b) - maxDegats(a) },
  nom: { nom: 'Nom (A → Z)', f: (a, b) => a.nom.localeCompare(b.nom, 'fr') },
};

const maxDegats = (c) => Math.max(0, ...c.attaques.map((a) => a.degats));
const normaliser = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

function dialogueSignalement(carte, surSucces) {
  const d = ouvrirDialogue({
    titre: 'Signaler cette carte',
    contenu: html`<form class="pile" data-signalement novalidate>
      <p class="discret">
        Ton signalement est anonyme pour l’auteur. Au bout de ${etat.serveur.seuilSignalements} signalements, la carte
        « ${carte.nom} » est masquée automatiquement.
      </p>
      <fieldset>
        <legend>Motif</legend>
        <div class="pile pile--serree">
          ${MOTIFS_SIGNALEMENT.map(
            (m) => html`<label class="case"><input type="radio" name="motif" value="${m.id}" /><span>${m.nom}</span></label>`,
          )}
        </div>
      </fieldset>
      <div class="champ">
        <label for="sig-commentaire">Précision (facultatif)</label>
        <textarea id="sig-commentaire" name="commentaire" maxlength="300" rows="3"></textarea>
      </div>
      <div class="erreur-formulaire" role="alert"></div>
    </form>`,
    actions: html`<button type="button" class="btn btn--secondaire" data-fermer>Annuler</button>
      <button type="button" class="btn btn--danger" data-envoyer>${icone('drapeau')} Envoyer le signalement</button>`,
  });
  const form = d.querySelector('form');
  d.querySelector('[data-envoyer]').addEventListener('click', async (ev) => {
    const erreur = form.querySelector('.erreur-formulaire');
    const motif = form.querySelector('input[name=motif]:checked')?.value;
    if (!motif) {
      erreur.textContent = 'Choisis un motif.';
      return;
    }
    await pendant(ev.currentTarget, async () => {
      try {
        const r = await api(`/cartes/${carte.id}/signalements`, {
          methode: 'POST',
          corps: { motif, commentaire: form.commentaire.value },
        });
        d.close();
        toast(r.masquee ? 'Merci. La carte a atteint le seuil : elle est maintenant masquée.' : 'Merci, ton signalement est enregistré.');
        surSucces(r);
      } catch (err) {
        erreur.textContent = err.message;
      }
    });
  });
}

function dialogueCarte(carte, surChangement) {
  const f = filiere(carte.filiere);
  const ouverte = statutCampagne() === 'ouverte';
  const d = ouvrirDialogue({
    titre: carte.nom,
    large: true,
    contenu: html`<div class="detail-carte">
      <div class="detail-carte__visuel" data-inclinable>${rendreCarte(carte, { largeur: 340 })}</div>
      <div class="detail-carte__infos">
        <dl class="fiche">
          <div><dt>Filière</dt><dd><span class="pastille-filiere" style="--c:${f?.couleur}"></span> ${f?.nom} · ${f?.domaine}</dd></div>
          <div><dt>Avantage / faiblesse</dt><dd>+${BONUS_AVANTAGE} contre ${filiere(avantageContre(carte.filiere))?.nom} · subit +${BONUS_AVANTAGE} face à ${filiere(faiblesseContre(carte.filiere))?.nom}</dd></div>
          <div><dt>Conçue par</dt><dd>@${carte.auteur}</dd></div>
          <div><dt>Numéro</dt><dd class="mono">N° ${String(carte.id).padStart(3, '0')}</dd></div>
          <div><dt>Créée le</dt><dd>${formatDate(carte.creeLe)}</dd></div>
        </dl>
        ${carte.estAMoi
          ? html`<p class="discret">C’est l’une de tes cartes.</p>
              <div class="groupe-boutons">
                ${ouverte && carte.statut === 'visible' && html`<a class="btn btn--secondaire" href="#/atelier/${carte.id}">${icone('crayon')} Modifier</a>`}
                <a class="btn btn--secondaire" href="#/hangar">Voir mon hangar</a>
              </div>`
          : carte.signaleeParMoi
            ? html`<p class="puce puce--danger">${icone('drapeau')} Tu as signalé cette carte</p>`
            : html`<p class="discret petit">Cette carte va trop loin ? Le signalement est anonyme.</p>
                <button type="button" class="btn btn--secondaire" data-signaler>${icone('drapeau')} Signaler</button>`}
      </div>
    </div>`,
  });
  rendreInclinable(d.querySelector('[data-inclinable]'), 10);
  d.querySelector('[data-signaler]')?.addEventListener('click', () => {
    d.close();
    dialogueSignalement(carte, surChangement);
  });
}

export async function afficher(racine) {
  let cartes = await api('/cartes');
  const filtres = { filiere: 'toutes', recherche: '', tri: 'recentes', miennes: false };

  monter(
    racine,
    html`<div class="entete-page">
        <div>
          <p class="surtitre">Galerie de la promo</p>
          <h1>Toutes les cartes</h1>
          <div class="texte-riche">${enBloc('galerie.intro')}</div>
        </div>
      </div>
      <div class="barre-filtres panneau">
        <div class="filtres-filieres" role="group" aria-label="Filtrer par filière">
          <button type="button" class="filtre" data-filiere="toutes" aria-pressed="true">Toutes</button>
          ${FILIERES.map(
            (f) => html`<button type="button" class="filtre" data-filiere="${f.id}" aria-pressed="false" style="--c:${f.couleur}">
              <span class="pastille-filiere"></span>${f.nom} <span class="filtre__domaine">${f.domaine}</span>
            </button>`,
          )}
        </div>
        <div class="filtres-ligne">
          <div class="champ champ--compact">
            <label for="gal-recherche" class="sr-only">Rechercher</label>
            <input id="gal-recherche" type="search" placeholder="Rechercher un nom, un auteur, une attaque…" />
          </div>
          <div class="champ champ--compact">
            <label for="gal-tri" class="sr-only">Trier</label>
            <select id="gal-tri">${Object.entries(TRIS).map(([k, t]) => html`<option value="${k}">${t.nom}</option>`)}</select>
          </div>
          <label class="case case--compacte"><input type="checkbox" id="gal-miennes" /><span>Mes cartes</span></label>
        </div>
      </div>
      <p class="resultat-galerie mono" aria-live="polite"></p>
      <div class="grille-cartes"></div>`,
  );

  const grille = racine.querySelector('.grille-cartes');
  const resultat = racine.querySelector('.resultat-galerie');

  function rendreGrille() {
    const q = normaliser(filtres.recherche.trim());
    const liste = cartes
      .filter((c) => filtres.filiere === 'toutes' || c.filiere === filtres.filiere)
      .filter((c) => !filtres.miennes || c.estAMoi)
      .filter(
        (c) =>
          !q ||
          normaliser([c.nom, c.sousTitre, c.auteur, c.description, ...c.attaques.map((a) => a.nom)].join(' ')).includes(q),
      )
      .sort(TRIS[filtres.tri].f);
    resultat.textContent = `${liste.length} carte${liste.length > 1 ? 's' : ''}`;
    if (liste.length === 0) {
      monter(
        grille,
        html`<div class="vide grille-cartes__vide">
          ${cartes.length === 0
            ? html`<h2>Hangar vide</h2><p>Aucune carte pour l’instant. Sois le premier ou la première !</p>
                <a class="btn" href="#/atelier">${icone('plus')} Concevoir une carte</a>`
            : html`<p>Aucune carte ne correspond à ces filtres.</p>`}
        </div>`,
      );
      return;
    }
    monter(
      grille,
      liste.map(
        (c) => html`<button type="button" class="carte-bouton" data-carte="${c.id}" aria-label="Voir la carte ${c.nom}, par ${c.auteur}">
          ${rendreCarte(c, { largeur: 220 })}
        </button>`,
      ),
    );
  }

  async function recharger() {
    cartes = await api('/cartes');
    rendreGrille();
  }

  racine.addEventListener('click', (ev) => {
    const filtre = ev.target.closest('[data-filiere]');
    if (filtre) {
      filtres.filiere = filtre.dataset.filiere;
      racine.querySelectorAll('[data-filiere]').forEach((b) => b.setAttribute('aria-pressed', String(b === filtre)));
      rendreGrille();
      return;
    }
    const bouton = ev.target.closest('[data-carte]');
    if (bouton) {
      const carte = cartes.find((c) => c.id === Number(bouton.dataset.carte));
      if (carte) dialogueCarte(carte, () => recharger().catch((err) => toast(err.message, 'erreur')));
    }
  });
  racine.querySelector('#gal-recherche').addEventListener('input', (ev) => {
    filtres.recherche = ev.target.value;
    rendreGrille();
  });
  racine.querySelector('#gal-tri').addEventListener('change', (ev) => {
    filtres.tri = ev.target.value;
    rendreGrille();
  });
  racine.querySelector('#gal-miennes').addEventListener('change', (ev) => {
    filtres.miennes = ev.target.checked;
    rendreGrille();
  });

  rendreGrille();
}
