import { actualiser, naviguer } from '../app.js';
import { api } from '../api.js';
import { etat, formatDate, utilisateur } from '../etat.js';
import { html, monter, raw } from '../html.js';
import { icone } from '../icones.js';
import { pendant, toast } from '../ui.js';

export const titre = 'Certificat de consentement';

function sceau() {
  const nom = etat.serveur.nomJeu.toUpperCase();
  return raw(`<svg class="sceau" viewBox="0 0 120 120" aria-hidden="true">
    <defs><path id="sceau-cercle" d="M60 60m-45 0a45 45 0 1 1 90 0a45 45 0 1 1-90 0"/></defs>
    <circle cx="60" cy="60" r="57" fill="none" stroke="#8d6c25" stroke-width="2"/>
    <circle cx="60" cy="60" r="52" fill="none" stroke="#8d6c25" stroke-width=".8"/>
    <text font-family="Barlow Condensed, sans-serif" font-weight="700" font-size="10.5" letter-spacing="2.6" fill="#6d5219">
      <textPath href="#sceau-cercle">FAIRE FACE · ${nom.replace(/[<&>"]/g, '')} · CONSENTEMENT ·</textPath>
    </text>
    <circle cx="60" cy="60" r="31" fill="#1f3f96" stroke="#d3ab4f" stroke-width="2"/>
    <circle cx="60" cy="60" r="20.5" fill="#f7f5ef"/>
    <circle cx="60" cy="60" r="10" fill="#d52b36"/>
  </svg>`);
}

function enteteDocument(sousTitre) {
  return html`<div class="document__entete">
    ${sceau()}
    <div>
      <p class="document__surtitre">${etat.serveur.nomJeu} · ${etat.serveur.promo || 'Phase 1'}</p>
      <h2 class="document__titre">Certificat de consentement</h2>
      <p class="document__version mono">${sousTitre}</p>
    </div>
  </div>`;
}

function vueSignature(data) {
  const u = utilisateur();
  const s = data.signature;
  return html`<div class="entete-page sans-impression">
      <div>
        <p class="surtitre">Signé</p>
        <h1>Ton certificat</h1>
        <p>Tu peux l’imprimer ou l’enregistrer en PDF. Pour retirer ton consentement, supprime ton compte depuis la page Compte.</p>
      </div>
      <div class="groupe-boutons">
        <button type="button" class="btn btn--secondaire" data-imprimer>${icone('imprimer')} Imprimer</button>
        <a class="btn" href="#/hangar">Aller au hangar</a>
      </div>
    </div>
    <article class="document document--signe">
      ${enteteDocument(`Version ${s.version} · N° ${s.numero}`)}
      <p class="document__intro">
        Je soussigné(e) <strong>${s.nomComplet}</strong>, identifiant <strong>@${u.identifiant}</strong>,
        certifie avoir lu et accepté chacun des engagements suivants&nbsp;:
      </p>
      <ol class="clauses clauses--signees">
        ${data.clauses.map((c) => html`<li>${icone('verifie', 'clauses__coche')}<span><strong>${c.titre}.</strong> ${c.texte}</span></li>`)}
      </ol>
      <div class="document__pied">
        <div>
          <span class="document__libelle">Signature électronique</span>
          <span class="document__signature">${s.nomComplet}</span>
          <span class="mono petit">Le ${formatDate(s.signeLe)}</span>
        </div>
        <span class="tampon" aria-hidden="true">Bon pour<br />la cohésion</span>
      </div>
    </article>`;
}

function vueFormulaire(data) {
  const ancienne = data.signature && !data.signature.valide;
  const aujourdhui = formatDate(new Date().toISOString(), { timeStyle: undefined });
  return html`<div class="entete-page">
      <div>
        <p class="surtitre">Avant d’entrer au hangar</p>
        <h1>Certificat de consentement</h1>
        <p>
          C’est la protection de base du jeu&nbsp;: tout le monde accepte les mêmes règles avant de créer ou de voir la moindre carte.
          Lis chaque engagement et coche-le.
        </p>
      </div>
    </div>
    ${ancienne &&
    html`<p class="erreur-formulaire">Le certificat a été mis à jour (version ${data.version}). Relis-le et signe à nouveau pour continuer.</p>`}
    <form class="document" novalidate>
      ${enteteDocument(`Version ${data.version}`)}
      <p class="document__intro">Je soussigné(e), participant(e) au jeu, m’engage sur chacun des points suivants&nbsp;:</p>
      <ol class="clauses">
        ${data.clauses.map(
          (c) => html`<li>
            <label class="case">
              <input type="checkbox" name="accords" value="${c.id}" />
              <span><strong>${c.titre}.</strong> ${c.texte}</span>
            </label>
          </li>`,
        )}
      </ol>
      <div class="document__pied document__pied--formulaire">
        <div class="champ signature">
          <label for="cert-nom">Prénom et nom</label>
          <input id="cert-nom" name="nomComplet" type="text" autocomplete="name" maxlength="80" required
            value="${data.signature?.nomComplet ?? ''}" placeholder="Ex. Camille Martin" />
          <span class="champ__aide">Ton nom apparaîtra dans le registre des signataires, visible par les participants. Fait le ${aujourdhui}.</span>
        </div>
        <div>
          <div class="erreur-formulaire" role="alert"></div>
          <button class="btn" type="submit" disabled>Signer le certificat</button>
          <p class="champ__aide progression-clauses" aria-live="polite"></p>
        </div>
      </div>
    </form>`;
}

export async function afficher(main) {
  const data = await api('/certificat');
  if (data.signature?.valide) {
    monter(main, vueSignature(data));
    main.querySelector('[data-imprimer]').addEventListener('click', () => window.print());
    return;
  }
  monter(main, vueFormulaire(data));
  const form = main.querySelector('form');
  const bouton = form.querySelector('[type=submit]');
  const progression = form.querySelector('.progression-clauses');

  const majEtat = () => {
    const coches = form.querySelectorAll('input[name=accords]:checked').length;
    const nomOk = form.nomComplet.value.trim().length >= 3;
    bouton.disabled = coches < data.clauses.length || !nomOk;
    progression.textContent =
      coches < data.clauses.length
        ? `${coches} / ${data.clauses.length} engagements cochés`
        : nomOk
          ? 'Tout est prêt.'
          : 'Écris ton prénom et ton nom pour signer.';
  };
  form.addEventListener('input', majEtat);
  majEtat();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erreur = form.querySelector('.erreur-formulaire');
    erreur.textContent = '';
    const accords = [...form.querySelectorAll('input[name=accords]:checked')].map((i) => i.value);
    await pendant(bouton, async () => {
      try {
        await api('/certificat', { methode: 'POST', corps: { nomComplet: form.nomComplet.value, accords } });
        await actualiser();
        toast('Certificat signé. Bienvenue au hangar !');
        naviguer('/hangar');
      } catch (err) {
        erreur.textContent = err.message;
      }
    });
  });
}
