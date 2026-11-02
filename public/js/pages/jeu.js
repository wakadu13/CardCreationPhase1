import { COMBAT, calculerMain } from '/shared/combat.js';
import { EXEMPLES } from '/shared/exemples.js';
import { CYCLE, filiere } from '/shared/regles.js';
import { api } from '../api.js';
import { rendreCarte } from '../carte.js';
import { utilisateur } from '../etat.js';
import { html, monter } from '../html.js';
import { icone } from '../icones.js';
import { toast } from '../ui.js';

export const titre = 'Simulateur de combat';

const P = COMBAT.partie;
const melanger = (t) => {
  const a = [...t];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const TAILLE_PAQUET = 20;

// Tant que la promo n'a pas 20 cartes, les cartes sont répétées pour remplir le paquet.
function completerPaquet(base) {
  const cartes = [];
  for (let k = 0; cartes.length < TAILLE_PAQUET; k++) {
    base.forEach((c, i) => {
      if (cartes.length < TAILLE_PAQUET) cartes.push({ ...c, id: `${c.id ?? i}-${k}` });
    });
  }
  return cartes;
}

// Paquet : les cartes de la promo si on est connecté, sinon les cartes d'exemple.
async function chargerPaquet() {
  const u = utilisateur();
  if (u?.certificatValide || u?.estAdmin) {
    try {
      const cartes = (await api('/cartes')).filter((c) => c.statut === 'visible');
      if (cartes.length >= 3) return { cartes: completerPaquet(cartes), source: 'promo', uniques: cartes.length };
    } catch {}
  }
  return { cartes: completerPaquet(EXEMPLES), source: 'exemples', uniques: EXEMPLES.length };
}

function nouvellePartie(cartes) {
  const paquet = melanger(cartes).slice(0, TAILLE_PAQUET);
  const etat = {
    paquetComplet: paquet,
    manche: 0,
    score: 0,
    partieGagnee: false,
    partiePerdue: false,
    journal: [],
  };
  commencerManche(etat);
  return etat;
}

function commencerManche(e) {
  const m = P.manches[e.manche];
  e.cible = Math.max(50, m.cible + (e.bonusCible ?? 0));
  e.bonusCible = 0;
  e.filiereMise = CYCLE[Math.floor(Math.random() * CYCLE.length)];
  e.mains = P.mainsParManche;
  e.defausses = m.regle?.includes('Une seule défausse') ? 1 : P.defaussesParManche;
  e.score = 0;
  e.pioche = melanger(e.paquetComplet);
  e.main = [];
  e.selection = [];
  e.attaqueChoisie = {};
  e.piocheBonus = 0;
  e.mancheGagnee = false;
  piocher(e, P.taillemain);
  e.journal.unshift(`Manche ${e.manche + 1} · ${m.nom} · mise ${e.filiereMise.toUpperCase()} · cible ${e.cible}`);
}

// Attaque jouée par défaut : la plus forte en dégâts.
const meilleureAttaque = (carte) =>
  (carte.attaques ?? []).reduce((meilleure, a, i, t) => (a.degats > t[meilleure].degats ? i : meilleure), 0);

function piocher(e, n) {
  while (e.main.length < P.taillemain + e.piocheBonus && e.pioche.length && n-- > 0) {
    const carte = e.pioche.pop();
    e.main.push(carte);
    e.attaqueChoisie[carte.id] ??= meilleureAttaque(carte);
  }
  e.piocheBonus = 0;
}

function jouer(e) {
  if (!e.selection.length) return toast('Choisis de 1 à 5 cartes.', 'erreur');
  const m = P.manches[e.manche];
  const selection = e.selection.map((id) => {
    const carte = e.main.find((c) => c.id === id);
    const attaques = carte.attaques ?? [];
    const attaque = attaques[e.attaqueChoisie[id] ?? 0] ?? attaques[0];
    // Boss « le Colonel » : les effets des cartes de sa filière ne comptent pas
    const effetAnnule = m.regle?.includes('effets') && carte.filiere === e.filiereMise;
    return { carte, attaque: attaque ? { ...attaque, effet: effetAnnule ? 'aucun' : attaque.effet } : null };
  });
  const r = calculerMain(selection, e.filiereMise);
  e.score += r.score;
  e.mains -= 1;
  e.journal.unshift(...[...r.lignes].reverse());
  for (const a of r.actions) {
    e.journal.unshift(a.texte);
    if (a.type === 'main') e.mains += a.n;
    if (a.type === 'defausse') e.defausses += a.n;
    if (a.type === 'pioche') e.piocheBonus = a.n;
    if (a.type === 'cible') e.bonusCible = (e.bonusCible ?? 0) + a.n;
    if (a.type === 'retirer') e.pioche = e.pioche.filter((c) => c.id !== a.carte.id);
  }
  e.main = e.main.filter((c) => !e.selection.includes(c.id));
  e.selection = [];
  e.dernierResultat = r;
  if (e.score >= e.cible) {
    e.mancheGagnee = true;
    e.journal.unshift(`Mise passée : ${e.score} ≥ ${e.cible} !`);
    if (e.manche === P.manches.length - 1) e.partieGagnee = true;
  } else if (e.mains === 0) {
    e.partiePerdue = true;
    e.journal.unshift(`Plus de main : ${e.score} < ${e.cible}. Partie perdue.`);
  } else piocher(e, 8);
}

function defausser(e) {
  if (!e.selection.length) return toast('Sélectionne les cartes à défausser.', 'erreur');
  if (e.defausses <= 0) return toast('Plus de défausse pour cette manche.', 'erreur');
  e.defausses -= 1;
  e.main = e.main.filter((c) => !e.selection.includes(c.id));
  e.journal.unshift(`Défausse de ${e.selection.length} carte${e.selection.length > 1 ? 's' : ''}.`);
  e.selection = [];
  piocher(e, 8);
}

function rendre(racine, e, source, uniques) {
  const m = P.manches[e.manche];
  const fm = filiere(e.filiereMise);
  const apercu = e.selection.length
    ? calculerMain(
        e.selection.map((id) => {
          const carte = e.main.find((c) => c.id === id);
          return { carte, attaque: carte.attaques?.[e.attaqueChoisie[id] ?? 0] ?? carte.attaques?.[0] };
        }),
        e.filiereMise,
        { pileOuFace: () => false },
      )
    : null;
  const fin = e.partieGagnee || e.partiePerdue;

  monter(
    racine.querySelector('.jeu'),
    html`<div class="jeu__tableau">
        <div class="tuile tuile--mise ${m.nom.startsWith('Boss') ? 'tuile--boss' : ''}" style="--c:${fm.couleur}">
          <span class="tuile__lib">Manche ${e.manche + 1} / ${P.manches.length} · Ante ${m.ante}</span>
          <strong>${m.nom}</strong>
          <span class="tuile__mise-filiere">${icone(fm.icone)} Mise ${fm.nom} <small>· domine ${filiere(CYCLE[(CYCLE.indexOf(e.filiereMise) + 1) % 3]).nom}, dominée par ${filiere(CYCLE[(CYCLE.indexOf(e.filiereMise) + 2) % 3]).nom}</small></span>
          ${m.regle && html`<span class="tuile__regle">${m.regle}</span>`}
        </div>
        <div class="tuile">
          <span class="tuile__lib">Score</span>
          <strong class="tuile__score ${e.score >= e.cible ? 'est-gagne' : ''}">${e.score}<small> / ${e.cible}</small></strong>
          <span class="jauge-score"><span style="width:${Math.min(100, (e.score / e.cible) * 100)}%"></span></span>
        </div>
        <div class="tuile tuile--compteurs">
          <span><strong class="chiffre-bleu">${e.mains}</strong> main${e.mains > 1 ? 's' : ''}</span>
          <span><strong class="chiffre-rouge">${e.defausses}</strong> défausse${e.defausses > 1 ? 's' : ''}</span>
          <span><strong>${e.pioche.length}</strong> en pioche</span>
        </div>
        <div class="tuile tuile--apercu">
          <span class="tuile__lib">Main en cours</span>
          ${apercu
            ? html`<span class="formule-mini"><b class="chiffre-bleu">${apercu.jetons}</b> × <b class="chiffre-rouge">${apercu.multiplicateur}</b> = <b>${apercu.score}</b></span>
              <span class="petit discret">${apercu.combinaisons.map((c) => c.nom).join(' + ') || 'Aucune combinaison'}</span>`
            : html`<span class="discret petit">Sélectionne de 1 à 5 cartes.</span>`}
        </div>
      </div>

      ${fin || e.mancheGagnee
        ? html`<div class="jeu__fin panneau panneau--hud">
            <h2>${e.partieGagnee ? 'Partie gagnée !' : e.partiePerdue ? 'Partie perdue' : 'Mise passée !'}</h2>
            <p>${e.partieGagnee ? 'Les six mises sont passées. La promo peut être fière.' : e.partiePerdue ? `Il manquait ${e.cible - e.score} points.` : `Score ${e.score} pour une cible de ${e.cible}.`}</p>
            ${fin
              ? html`<button type="button" class="btn" data-relancer>${icone('plus')} Nouvelle partie</button>`
              : html`<button type="button" class="btn" data-suivante>Manche suivante</button>`}
          </div>`
        : html`<div class="jeu__main">
            ${e.main.map((c) => {
              const choisie = e.selection.includes(c.id);
              return html`<div class="jeu__carte ${choisie ? 'est-choisie' : ''}">
                <button type="button" class="carte-bouton" data-choisir="${c.id}" aria-pressed="${choisie}" aria-label="${choisie ? 'Retirer' : 'Jouer'} ${c.nom}">
                  ${rendreCarte(c, { largeur: 150, voile: false })}
                </button>
                ${(c.attaques?.length ?? 0) > 1 &&
                html`<select class="jeu__attaque" data-attaque="${c.id}" aria-label="Attaque de ${c.nom}">
                  ${c.attaques.map((a, i) => html`<option value="${i}" ${(e.attaqueChoisie[c.id] ?? 0) === i ? html`selected` : ''}>${a.nom} (${a.degats})</option>`)}
                </select>`}
              </div>`;
            })}
          </div>
          <div class="jeu__actions">
            <button type="button" class="btn btn--secondaire" data-jouer ${e.selection.length ? '' : html`disabled`}>Jouer la main (${e.selection.length})</button>
            <button type="button" class="btn btn--danger" data-defausser ${e.selection.length && e.defausses > 0 ? '' : html`disabled`}>Défausser</button>
            <button type="button" class="btn btn--petit btn--secondaire" data-relancer>Recommencer</button>
          </div>`}

      <details class="jeu__journal panneau" open>
        <summary>Journal de la partie</summary>
        <ul class="mono petit">${e.journal.slice(0, 30).map((l) => html`<li>${l}</li>`)}</ul>
      </details>
      <p class="discret petit">
        Paquet de ${e.paquetComplet.length} cartes : ${source === 'promo' ? 'les cartes visibles de la promo' : 'les cartes d’exemple (connecte-toi pour jouer avec celles de la promo)'}${uniques < TAILLE_PAQUET ? `, ${uniques} cartes différentes répétées` : ''}.
      </p>`,
  );
}

export async function afficher(racine) {
  const { cartes, source, uniques } = await chargerPaquet();
  let e = nouvellePartie(cartes);

  monter(
    racine,
    html`<div class="entete-page">
        <div>
          <p class="surtitre">Phase 2 · simulateur</p>
          <h1>${COMBAT.titre}</h1>
          <p>Mode solo contre la mise : passe les ${P.manches.length} mises avec ${P.mainsParManche} mains et ${P.defaussesParManche} défausses par manche. Sert à tester et régler les chiffres.</p>
        </div>
        <a class="btn btn--secondaire" href="#/combat">${icone('retour')} Les règles du combat</a>
      </div>
      <div class="jeu"></div>`,
  );

  const redessiner = () => rendre(racine, e, source, uniques);
  racine.addEventListener('click', (ev) => {
    const choisir = ev.target.closest('[data-choisir]');
    if (choisir) {
      const id = choisir.dataset.choisir;
      if (e.selection.includes(id)) e.selection = e.selection.filter((x) => x !== id);
      else if (e.selection.length >= 5) return toast('5 cartes maximum par main.', 'erreur');
      else e.selection.push(id);
      return redessiner();
    }
    if (ev.target.closest('[data-jouer]')) {
      jouer(e);
      return redessiner();
    }
    if (ev.target.closest('[data-defausser]')) {
      defausser(e);
      return redessiner();
    }
    if (ev.target.closest('[data-suivante]')) {
      e.manche += 1;
      commencerManche(e);
      return redessiner();
    }
    if (ev.target.closest('[data-relancer]')) {
      e = nouvellePartie(cartes);
      return redessiner();
    }
  });
  racine.addEventListener('change', (ev) => {
    const select = ev.target.closest('[data-attaque]');
    if (!select) return;
    e.attaqueChoisie[select.dataset.attaque] = Number(select.value);
    redessiner();
  });
  redessiner();
}
