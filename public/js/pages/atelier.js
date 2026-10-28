import {
  ATTAQUE,
  BUDGET,
  CADRAGE,
  EFFETS,
  FILIERES,
  PV,
  TEXTES,
  calculerCout,
  coutAttaque,
  coutPv,
  degatsMaxPour,
  effet,
  validerCarte,
} from '/shared/regles.js';
import { actualiser, naviguer } from '../app.js';
import { api } from '../api.js';
import { rendreCarte, rendreInclinable } from '../carte.js';
import { etat, statutCampagne, utilisateur } from '../etat.js';
import { html, monter, raw } from '../html.js';
import { icone } from '../icones.js';
import { preparerImage } from '../image.js';
import { pendant, toast } from '../ui.js';

export const titre = 'Atelier de conception';

const nouvelleAttaque = () => ({ nom: '', energie: 1, degats: 20, effet: 'aucun', texte: '' });

const signe = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const pts = (n) => `${n} pt${Math.abs(n) > 1 ? 's' : ''}`;

// --- Jauge de puissance : cadran 240° façon instrument de bord -------------------

const ECHELLE = BUDGET * 1.2;
const angle = (v) => -120 + (240 * Math.min(Math.max(v, 0), ECHELLE)) / ECHELLE;
function point(deg, r) {
  const rad = (deg * Math.PI) / 180;
  return [100 + r * Math.sin(rad), 100 - r * Math.cos(rad)].map((n) => n.toFixed(2));
}
function arc(de, a, r) {
  const [x1, y1] = point(de, r);
  const [x2, y2] = point(a, r);
  return `M${x1} ${y1}A${r} ${r} 0 ${a - de > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

function jauge(total) {
  const surcharge = total > BUDGET;
  const graduations = [];
  for (let v = 0; v <= ECHELLE; v += 10) {
    const [x1, y1] = point(angle(v), v % 50 === 0 ? 62 : 66);
    const [x2, y2] = point(angle(v), 72);
    graduations.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${v % 50 === 0 ? 'jauge__grad--forte' : ''}"/>`);
  }
  const libelles = [0, 50, 100]
    .map((v) => {
      const [x, y] = point(angle(v), 50);
      return `<text x="${x}" y="${Number(y) + 4}" class="jauge__libelle">${v}</text>`;
    })
    .join('');
  return raw(`<svg viewBox="0 0 200 150" class="jauge ${surcharge ? 'jauge--surcharge' : ''}" role="img" aria-label="Puissance utilisée : ${total} sur ${BUDGET}">
    <path d="${arc(-120, 120, 80)}" class="jauge__piste"/>
    <path d="${arc(angle(BUDGET), 120, 80)}" class="jauge__zone-rouge"/>
    ${total > 0 ? `<path d="${arc(-120, angle(Math.min(total, BUDGET)), 80)}" class="jauge__valeur"/>` : ''}
    <g class="jauge__grads">${graduations.join('')}</g>
    ${libelles}
    <g transform="rotate(${angle(total).toFixed(2)} 100 100)" class="jauge__aiguille"><path d="M100 30 L104 100 L96 100Z"/></g>
    <circle cx="100" cy="100" r="7" class="jauge__moyeu"/>
    <text x="100" y="128" class="jauge__total">${total}</text>
    <text x="100" y="143" class="jauge__unite">/ ${BUDGET} · PUISSANCE</text>
  </svg>`);
}

// --- Sections du formulaire ---------------------------------------------------------

function champTexte({ nom, libelle, valeur, regle, aide, placeholder = '' }) {
  return html`<div class="champ">
    <div class="champ__ligne">
      <label for="ch-${nom}">${libelle}</label>
      <span class="compteur" data-compteur="${nom}" data-max="${regle.max}">${[...valeur].length}/${regle.max}</span>
    </div>
    <input id="ch-${nom}" name="${nom}" type="text" maxlength="${regle.max}" value="${valeur}" placeholder="${placeholder}" autocomplete="off" />
    ${aide && html`<span class="champ__aide">${aide}</span>`}
  </div>`;
}

function sectionIllustration(b) {
  return html`<legend class="panneau__legende"><span class="mono">02</span> Illustration</legend>
    <label class="depot" data-depot>
      <input type="file" name="fichier" accept="image/*" class="sr-only" />
      ${icone('image')}
      <span><strong>${b.image ? 'Changer d’image' : 'Choisir une image'}</strong><br /><span class="discret petit">ou glisse-la ici · JPEG, PNG, WebP</span></span>
    </label>
    <p class="champ__aide">
      Uniquement des personnes qui ont signé le certificat (voir le <a href="#/registre" target="_blank" rel="noopener">registre</a>),
      sur une photo prise avec leur accord. L’image est réduite et ses métadonnées (GPS…) sont retirées avant l’envoi.
    </p>
    ${b.image &&
    html`<div class="cadrage">
      <div class="champ">
        <label for="ch-imageX">Cadrage horizontal</label>
        <input id="ch-imageX" type="range" name="imageX" min="0" max="100" step="1" value="${b.imageX}" />
      </div>
      <div class="champ">
        <label for="ch-imageY">Cadrage vertical</label>
        <input id="ch-imageY" type="range" name="imageY" min="0" max="100" step="1" value="${b.imageY}" />
      </div>
      <div class="champ">
        <label for="ch-imageZoom">Zoom</label>
        <input id="ch-imageZoom" type="range" name="imageZoom" min="${CADRAGE.zoomMin}" max="${CADRAGE.zoomMax}" step="0.05" value="${b.imageZoom}" />
      </div>
      <button type="button" class="btn btn--petit btn--secondaire" data-retirer-image>${icone('croix')} Retirer l’image</button>
    </div>`}`;
}

function blocAttaque(a, i, total) {
  const max = degatsMaxPour(a.energie);
  return html`<div class="bloc-attaque" data-index="${i}">
    <div class="bloc-attaque__titre">
      <h3>Attaque ${i + 1}</h3>
      <span class="puce puce--or mono" data-cout-attaque="${i}">${pts(coutAttaque(a))}</span>
      ${total > ATTAQUE.min && html`<button type="button" class="btn btn--petit btn--secondaire" data-retirer-attaque="${i}">${icone('croix')} Retirer</button>`}
    </div>
    ${champTexte({ nom: `attaques.${i}.nom`, libelle: 'Nom de l’attaque', valeur: a.nom, regle: TEXTES.attaqueNom, placeholder: 'Ex. Passage bas' })}
    <div class="bloc-attaque__reglages">
      <fieldset>
        <legend>Énergie</legend>
        <div class="segments">
          ${Array.from({ length: ATTAQUE.energieMax - ATTAQUE.energieMin + 1 }, (_, k) => {
            const e = ATTAQUE.energieMin + k;
            return html`<label><input type="radio" name="attaques.${i}.energie" value="${e}" ${a.energie === e ? html`checked` : ''} /><span>${e}<span class="jeton jeton--mini"></span></span></label>`;
          })}
        </div>
      </fieldset>
      <div class="champ champ--degats">
        <div class="champ__ligne">
          <label for="ch-attaques.${i}.degats">Dégâts</label>
          <output class="mono" data-sortie="attaques.${i}.degats">${a.degats} / ${max} max</output>
        </div>
        <input id="ch-attaques.${i}.degats" type="range" name="attaques.${i}.degats" min="0" max="${max}" step="${ATTAQUE.degatsPas}" value="${a.degats}" />
      </div>
    </div>
    <div class="champ">
      <label for="ch-attaques.${i}.effet">Effet</label>
      <select id="ch-attaques.${i}.effet" name="attaques.${i}.effet">
        ${EFFETS.map(
          (e) => html`<option value="${e.id}" ${a.effet === e.id ? html`selected` : ''}>${e.nom} (${signe(e.cout)} pts)</option>`,
        )}
      </select>
      <span class="champ__aide" data-effet-texte="${i}">${effet(a.effet)?.texte || 'Pas d’effet particulier.'}</span>
    </div>
    ${champTexte({
      nom: `attaques.${i}.texte`,
      libelle: 'Petite phrase (facultatif)',
      valeur: a.texte,
      regle: TEXTES.attaqueTexte,
      placeholder: 'Ex. Les vaches s’en souviennent encore.',
    })}
  </div>`;
}

function sectionAttaques(b) {
  return html`<legend class="panneau__legende"><span class="mono">03</span> Attaques</legend>
    <p class="champ__aide">
      Chaque énergie au-delà de la première rend 5 points : une attaque lente coûte moins cher. Dégâts maximum : ${ATTAQUE.degatsParEnergie} par énergie.
    </p>
    ${b.attaques.map((a, i) => blocAttaque(a, i, b.attaques.length))}
    ${b.attaques.length < ATTAQUE.max &&
    html`<button type="button" class="btn btn--secondaire btn--bloc" data-ajouter-attaque>${icone('plus')} Ajouter une deuxième attaque</button>`}`;
}

function formulaire(b, libelleBouton) {
  return html`<div class="atelier__formulaire pile">
    <fieldset class="panneau">
      <legend class="panneau__legende"><span class="mono">01</span> Identité</legend>
      ${champTexte({ nom: 'nom', libelle: 'Nom de la carte', valeur: b.nom, regle: TEXTES.nom, placeholder: 'Ex. Caporal Café' })}
      ${champTexte({
        nom: 'sousTitre',
        libelle: 'Sous-titre (facultatif)',
        valeur: b.sousTitre,
        regle: TEXTES.sousTitre,
        placeholder: 'Ex. Carburant officiel de la promo',
      })}
      <fieldset>
        <legend>Filière</legend>
        <div class="choix-filieres">
          ${FILIERES.map(
            (f) => html`<label class="choix-filiere" style="--c:${f.couleur}">
              <input type="radio" name="filiere" value="${f.id}" ${b.filiere === f.id ? html`checked` : ''} />
              <span class="choix-filiere__icone">${icone(f.icone)}</span>
              <span class="choix-filiere__nom">${f.nom}<small>${f.domaine}</small></span>
            </label>`,
          )}
        </div>
      </fieldset>
      <div class="champ">
        <div class="champ__ligne">
          <label for="ch-pv">Points de vie</label>
          <output class="mono" data-sortie="pv">${b.pv} PV · ${pts(coutPv(b.pv))}</output>
        </div>
        <input id="ch-pv" type="range" name="pv" min="${PV.min}" max="${PV.max}" step="${PV.pas}" value="${b.pv}" />
        <span class="champ__aide">Chaque tranche de 10 PV coûte 5 points de puissance.</span>
      </div>
    </fieldset>

    <fieldset class="panneau" data-section="illustration">${sectionIllustration(b)}</fieldset>
    <fieldset class="panneau" data-section="attaques">${sectionAttaques(b)}</fieldset>

    <fieldset class="panneau">
      <legend class="panneau__legende"><span class="mono">04</span> Le mot de la fin</legend>
      <div class="champ">
        <div class="champ__ligne">
          <label for="ch-description">Description (facultatif)</label>
          <span class="compteur" data-compteur="description" data-max="${TEXTES.description.max}">${[...b.description].length}/${TEXTES.description.max}</span>
        </div>
        <textarea id="ch-description" name="description" maxlength="${TEXTES.description.max}" rows="2"
          placeholder="Ex. Ne vole pas, mais fait décoller tout le monde chaque matin.">${b.description}</textarea>
        <span class="champ__aide">Affichée en italique en bas de la carte. Humour oui, méchanceté non.</span>
      </div>
    </fieldset>

    <div class="panneau atelier__validation">
      <h2>Check-list prévol</h2>
      <div data-checklist></div>
      <label class="case confirmation">
        <input type="checkbox" name="confirmeSignataires" />
        <span>Les personnes représentées sur cette carte ont signé le certificat de consentement.</span>
      </label>
      <div class="erreur-formulaire" role="alert"></div>
      <button type="submit" class="btn btn--bloc">${libelleBouton}</button>
    </div>
  </div>`;
}

function bilan(b) {
  const cout = calculerCout(b);
  return html`<div class="budget">
    ${jauge(cout.total)}
    <ul class="budget__detail">
      <li><span>Points de vie</span><span class="mono">${cout.pv}</span></li>
      ${cout.attaques.map((c, i) => html`<li><span>Attaque ${i + 1}</span><span class="mono">${c}</span></li>`)}
      <li class="budget__reste ${cout.reste < 0 ? 'est-negatif' : ''}">
        <span>${cout.reste < 0 ? 'Surcharge' : 'Restant'}</span><span class="mono">${Math.abs(cout.reste)}</span>
      </li>
    </ul>
  </div>`;
}

function checklist(erreurs) {
  return erreurs.length
    ? html`<ul class="checklist">${erreurs.map((e) => html`<li class="checklist__ko">${icone('croix')}<span>${e}</span></li>`)}</ul>`
    : html`<p class="checklist__ok">${icone('verifie')} Check-list complète : prêt au décollage.</p>`;
}

// --- Page -------------------------------------------------------------------------------

export async function afficher(racine, id) {
  const statut = statutCampagne();
  if (statut !== 'ouverte') {
    monter(
      racine,
      html`<div class="vide"><h2>Atelier fermé</h2>
        <p>${statut === 'a-venir' ? 'La campagne de création n’a pas encore commencé.' : 'La campagne de création est terminée.'}</p>
        <a class="btn btn--secondaire" href="#/hangar">Retour au hangar</a></div>`,
    );
    return;
  }

  let b;
  let numero = null;
  if (id) {
    const c = await api(`/cartes/${id}`);
    if (!c.estAMoi) throw new Error('Tu ne peux modifier que tes propres cartes.');
    if (c.statut === 'masquee') throw new Error('Cette carte a été masquée après des signalements : tu peux seulement la supprimer.');
    numero = c.id;
    b = {
      nom: c.nom,
      sousTitre: c.sousTitre,
      filiere: c.filiere,
      pv: c.pv,
      description: c.description,
      attaques: c.attaques.map((a) => ({ ...a })),
      image: c.image,
      imageModifiee: false,
      imageX: c.imageX,
      imageY: c.imageY,
      imageZoom: c.imageZoom,
    };
  } else {
    const { cartes, limite } = await api('/cartes/miennes');
    if (cartes.length >= limite) {
      monter(
        racine,
        html`<div class="vide"><h2>Hangar complet</h2>
          <p>Tu as déjà ${limite} cartes, le maximum pour cette phase. Supprime une carte pour en concevoir une autre.</p>
          <a class="btn btn--secondaire" href="#/hangar">Retour au hangar</a></div>`,
      );
      return;
    }
    b = {
      nom: '',
      sousTitre: '',
      filiere: FILIERES[0].id,
      pv: 80,
      description: '',
      attaques: [nouvelleAttaque()],
      image: null,
      imageModifiee: false,
      imageX: 50,
      imageY: 50,
      imageZoom: 1,
    };
  }

  let modifie = false;
  const u = utilisateur();

  monter(
    racine,
    html`<div class="entete-page">
        <div>
          <p class="surtitre">Atelier de conception</p>
          <h1>${id ? 'Modifier la carte' : 'Nouvelle carte'}</h1>
          <p>Budget de ${BUDGET} points de puissance à répartir entre les points de vie et les attaques. L’aperçu se met à jour en direct.</p>
        </div>
        <a class="btn btn--secondaire" href="#/hangar">${icone('retour')} Hangar</a>
      </div>
      <form class="atelier" novalidate>
        ${formulaire(b, id ? 'Enregistrer les modifications' : 'Enregistrer la carte')}
        <div class="atelier__cote">
          <div class="apercu" data-apercu></div>
          <div class="panneau panneau--hud" data-bilan></div>
          <p class="statut-prevol" data-statut aria-live="polite"></p>
        </div>
      </form>`,
  );

  const form = racine.querySelector('form');
  const apercu = racine.querySelector('[data-apercu]');
  const zoneBilan = racine.querySelector('[data-bilan]');
  const zoneChecklist = racine.querySelector('[data-checklist]');
  const zoneStatut = racine.querySelector('[data-statut]');
  const bouton = form.querySelector('[type=submit]');
  rendreInclinable(apercu, 7);

  function majApercu() {
    monter(apercu, rendreCarte({ ...b, auteur: u.identifiant, statut: 'visible' }, { largeur: 300, numero }));
    monter(zoneBilan, bilan(b));
    const { erreurs } = validerCarte(b);
    monter(zoneChecklist, checklist(erreurs));
    monter(
      zoneStatut,
      erreurs.length
        ? html`${icone('croix')} ${erreurs.length} point${erreurs.length > 1 ? 's' : ''} à régler (voir la check-list en bas)`
        : html`${icone('verifie')} Prêt au décollage`,
    );
    zoneStatut.classList.toggle('est-ok', erreurs.length === 0);
    bouton.disabled = erreurs.length > 0 || !form.confirmeSignataires.checked;
  }

  function majCadrage() {
    const img = apercu.querySelector('.carte__visuel img');
    if (!img) return majApercu();
    img.style.objectPosition = `${b.imageX}% ${b.imageY}%`;
    img.style.transformOrigin = `${b.imageX}% ${b.imageY}%`;
    img.style.transform = `scale(${b.imageZoom})`;
  }

  const redessiner = (section) => {
    const el = form.querySelector(`[data-section="${section}"]`);
    monter(el, section === 'attaques' ? sectionAttaques(b) : sectionIllustration(b));
  };

  form.addEventListener('input', (ev) => {
    const { name, value, type } = ev.target;
    if (!name || name === 'fichier') return;
    modifie = true;
    if (name === 'confirmeSignataires') return majApercu();

    const compteur = form.querySelector(`[data-compteur="${CSS.escape(name)}"]`);
    if (compteur) {
      const n = [...value].length;
      compteur.textContent = `${n}/${compteur.dataset.max}`;
      compteur.classList.toggle('compteur--plein', n >= Number(compteur.dataset.max));
    }

    if (name.startsWith('attaques.')) {
      const [, i, champ] = name.split('.');
      const a = b.attaques[Number(i)];
      a[champ] = ['energie', 'degats'].includes(champ) ? Number(value) : value;
      if (champ === 'energie') {
        const max = degatsMaxPour(a.energie);
        const curseur = form.querySelector(`[name="attaques.${i}.degats"]`);
        curseur.max = String(max);
        a.degats = Math.min(a.degats, max);
        curseur.value = String(a.degats);
      }
      if (champ === 'energie' || champ === 'degats') {
        form.querySelector(`[data-sortie="attaques.${i}.degats"]`).textContent = `${a.degats} / ${degatsMaxPour(a.energie)} max`;
      }
      if (champ === 'effet') form.querySelector(`[data-effet-texte="${i}"]`).textContent = effet(a.effet)?.texte || 'Pas d’effet particulier.';
      form.querySelector(`[data-cout-attaque="${i}"]`).textContent = pts(coutAttaque(a));
    } else if (['imageX', 'imageY', 'imageZoom'].includes(name)) {
      b[name] = Number(value);
      return majCadrage();
    } else {
      b[name] = type === 'range' ? Number(value) : value;
      if (name === 'pv') form.querySelector('[data-sortie="pv"]').textContent = `${b.pv} PV · ${pts(coutPv(b.pv))}`;
    }
    majApercu();
  });

  async function chargerFichier(fichier) {
    if (!fichier) return;
    try {
      b.image = await preparerImage(fichier);
      b.imageModifiee = true;
      b.imageX = 50;
      b.imageY = 50;
      b.imageZoom = 1;
      modifie = true;
      redessiner('illustration');
      majApercu();
    } catch (err) {
      toast(err.message, 'erreur');
    }
  }

  form.addEventListener('change', (ev) => {
    if (ev.target.name === 'fichier') chargerFichier(ev.target.files?.[0]);
  });

  form.addEventListener('dragover', (ev) => {
    const depot = ev.target.closest('[data-depot]');
    if (!depot) return;
    ev.preventDefault();
    depot.classList.add('est-survole');
  });
  form.addEventListener('dragleave', (ev) => ev.target.closest('[data-depot]')?.classList.remove('est-survole'));
  form.addEventListener('drop', (ev) => {
    const depot = ev.target.closest('[data-depot]');
    if (!depot) return;
    ev.preventDefault();
    depot.classList.remove('est-survole');
    chargerFichier(ev.dataTransfer?.files?.[0]);
  });

  form.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-ajouter-attaque]')) {
      b.attaques.push(nouvelleAttaque());
      redessiner('attaques');
      form.querySelector(`[name="attaques.${b.attaques.length - 1}.nom"]`)?.focus();
    } else if (ev.target.closest('[data-retirer-attaque]')) {
      b.attaques.splice(Number(ev.target.closest('[data-retirer-attaque]').dataset.retirerAttaque), 1);
      redessiner('attaques');
    } else if (ev.target.closest('[data-retirer-image]')) {
      b.image = null;
      b.imageModifiee = true;
      redessiner('illustration');
    } else {
      return;
    }
    modifie = true;
    majApercu();
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erreur = form.querySelector('.erreur-formulaire');
    erreur.textContent = '';
    const { ok, erreurs } = validerCarte(b);
    if (!ok) {
      erreur.textContent = erreurs[0];
      return;
    }
    const corps = {
      nom: b.nom,
      sousTitre: b.sousTitre,
      filiere: b.filiere,
      pv: b.pv,
      description: b.description,
      attaques: b.attaques,
      imageX: b.imageX,
      imageY: b.imageY,
      imageZoom: b.imageZoom,
      confirmeSignataires: form.confirmeSignataires.checked,
      ...(b.imageModifiee ? { image: b.image } : {}),
    };
    await pendant(bouton, async () => {
      try {
        await api(id ? `/cartes/${id}` : '/cartes', { methode: id ? 'PUT' : 'POST', corps });
        modifie = false;
        await actualiser();
        toast(id ? 'Carte mise à jour.' : 'Carte enregistrée dans ton hangar !');
        naviguer('/hangar');
      } catch (err) {
        erreur.textContent = err.message;
      }
    });
  });

  const avantDepart = (ev) => {
    if (!modifie) return;
    ev.preventDefault();
    ev.returnValue = '';
  };
  window.addEventListener('beforeunload', avantDepart);

  majApercu();
  return () => window.removeEventListener('beforeunload', avantDepart);
}
