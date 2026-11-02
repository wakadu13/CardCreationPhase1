import { COMBAT } from '/shared/combat.js';
import { EXEMPLES } from '/shared/exemples.js';
import { CYCLE, filiere } from '/shared/regles.js';
import {
  MAX_CARTES_PAR_MAIN,
  TAILLE_PAQUET,
  apercuMain,
  choisir,
  completerPaquet,
  defausser,
  jouer,
  mancheSuivante,
  nouvellePartie,
} from '/shared/partie.js';
import { api } from '../api.js';
import { rendreCarte } from '../carte.js';
import { utilisateur } from '../etat.js';
import { html, monter } from '../html.js';
import { icone } from '../icones.js';
import { activerSons, jouerSon, sonsActifs } from '../sons.js';
import { toast } from '../ui.js';

export const titre = 'Simulateur de combat';

const P = COMBAT.partie;
const MANCHES_POUR_GAGNER = 3;

// Paquet : les cartes de la promo si on est connecté, sinon les cartes d'exemple.
async function chargerPaquet() {
  const u = utilisateur();
  if (u?.certificatValide || u?.estAdmin) {
    try {
      const cartes = (await api('/cartes')).filter((c) => c.statut === 'visible' && !c.enRelecture);
      if (cartes.length >= 3) return { cartes: completerPaquet(cartes), source: 'promo', uniques: cartes.length };
    } catch {}
  }
  return { cartes: completerPaquet(EXEMPLES), source: 'exemples', uniques: EXEMPLES.length };
}

// --- Duel : deux joueurs sur le même écran, à tour de rôle sur la même mise ---------------------

function nouveauDuel(cartes, noms) {
  const d = { noms, manche: 0, victoires: [0, 0], tour: 0, fini: false, journal: [] };
  commencerMancheDuel(d, cartes);
  return d;
}

function commencerMancheDuel(d, cartes) {
  // Même mise et même filière pour les deux joueurs
  const mise = CYCLE[Math.floor(Math.random() * CYCLE.length)];
  const manches = [P.manches[Math.min(d.manche, P.manches.length - 1)]];
  d.joueurs = [0, 1].map(() => {
    const e = nouvellePartie(cartes, { manches });
    e.filiereMise = mise;
    return e;
  });
  d.tour = d.manche % 2;
  d.gagnantManche = null;
  d.journal.unshift(`Manche ${d.manche + 1} · ${manches[0].nom} · mise ${mise.toUpperCase()} · cible ${d.joueurs[0].cible}`);
}

function finDeTourDuel(d) {
  const e = d.joueurs[d.tour];
  if (e.mancheGagnee) {
    d.gagnantManche = d.tour;
    d.victoires[d.tour] += 1;
    d.journal.unshift(`${d.noms[d.tour]} passe la mise (${e.score}) et gagne la manche !`);
    if (d.victoires[d.tour] >= MANCHES_POUR_GAGNER) {
      d.fini = true;
      d.journal.unshift(`${d.noms[d.tour]} gagne la partie ${d.victoires[0]} à ${d.victoires[1]}.`);
    }
    return;
  }
  // Les deux ont épuisé leurs mains sans passer : le meilleur score gagne la manche
  if (d.joueurs.every((j) => j.partiePerdue)) {
    const [a, b] = d.joueurs.map((j) => j.score);
    if (a === b) {
      d.gagnantManche = -1;
      d.journal.unshift('Égalité : personne ne marque.');
      return;
    }
    d.gagnantManche = a > b ? 0 : 1;
    d.victoires[d.gagnantManche] += 1;
    d.journal.unshift(`Personne ne passe la mise : ${d.noms[d.gagnantManche]} l’emporte au score (${Math.max(a, b)} contre ${Math.min(a, b)}).`);
    if (d.victoires[d.gagnantManche] >= MANCHES_POUR_GAGNER) d.fini = true;
    return;
  }
  // Au tour de l'autre, s'il peut encore jouer
  const autre = 1 - d.tour;
  if (!d.joueurs[autre].partiePerdue) d.tour = autre;
}

// --- Rendu ----------------------------------------------------------------------------------------

function tuileMise(e, manche, total) {
  const fm = filiere(e.filiereMise);
  const m = e.manches[Math.min(e.manche, e.manches.length - 1)];
  return html`<div class="tuile tuile--mise ${m.nom.startsWith('Boss') ? 'tuile--boss' : ''}" style="--c:${fm.couleur}">
    <span class="tuile__lib">Manche ${manche} / ${total} · Ante ${m.ante}</span>
    <strong>${m.nom}</strong>
    <span class="tuile__mise-filiere">${icone(fm.icone)} Mise ${fm.nom} <small>· domine ${filiere(CYCLE[(CYCLE.indexOf(e.filiereMise) + 1) % 3]).nom}, dominée par ${filiere(CYCLE[(CYCLE.indexOf(e.filiereMise) + 2) % 3]).nom}</small></span>
    ${m.regle && html`<span class="tuile__regle">${m.regle}</span>`}
  </div>`;
}

function tuilesEtat(e, vibre) {
  const apercu = apercuMain(e);
  return html`<div class="tuile ${vibre ? 'vibre' : ''}">
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
        : html`<span class="discret petit">Sélectionne de 1 à ${MAX_CARTES_PAR_MAIN} cartes.</span>`}
    </div>`;
}

function mainEtActions(e) {
  return html`<div class="jeu__main">
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
    </div>`;
}

const journal = (lignes) => html`<details class="jeu__journal panneau" open>
  <summary>Journal de la partie</summary>
  <ul class="mono petit">${lignes.slice(0, 30).map((l) => html`<li>${l}</li>`)}</ul>
</details>`;

function rendreSolo(zone, e, vibre) {
  const fin = e.partieGagnee || e.partiePerdue;
  monter(
    zone,
    html`<div class="jeu__tableau">${tuileMise(e, e.manche + 1, e.manches.length)}${tuilesEtat(e, vibre)}</div>
      ${fin || e.mancheGagnee
        ? html`<div class="jeu__fin panneau panneau--hud">
            <h2>${e.partieGagnee ? 'Partie gagnée !' : e.partiePerdue ? 'Partie perdue' : 'Mise passée !'}</h2>
            <p>${e.partieGagnee ? 'Les six mises sont passées. La promo peut être fière.' : e.partiePerdue ? `Il manquait ${e.cible - e.score} points.` : `Score ${e.score} pour une cible de ${e.cible}.`}</p>
            ${fin
              ? html`<button type="button" class="btn" data-relancer>${icone('plus')} Nouvelle partie</button>`
              : html`<button type="button" class="btn" data-suivante>Manche suivante</button>`}
          </div>`
        : mainEtActions(e)}
      ${journal(e.journal)}`,
  );
}

function rendreDuel(zone, d, vibre) {
  const e = d.joueurs[d.tour];
  const mancheFinie = d.gagnantManche !== null;
  monter(
    zone,
    html`<div class="duel__scores">
        ${[0, 1].map(
          (i) => html`<div class="tuile duel__joueur ${i === d.tour && !mancheFinie ? 'est-actif' : ''}">
            <span class="tuile__lib">${i === d.tour && !mancheFinie ? 'À toi de jouer' : 'Joueur'}</span>
            <strong>${d.noms[i]}</strong>
            <span class="duel__manches" aria-label="${d.victoires[i]} manche(s) gagnée(s)">${'●'.repeat(d.victoires[i])}${'○'.repeat(MANCHES_POUR_GAGNER - d.victoires[i])}</span>
            <span class="petit discret">${d.joueurs[i].score} / ${d.joueurs[i].cible} · ${d.joueurs[i].mains} main(s)</span>
          </div>`,
        )}
      </div>
      <div class="jeu__tableau">${tuileMise(e, d.manche + 1, '∞')}${tuilesEtat(e, vibre)}</div>
      ${d.fini
        ? html`<div class="jeu__fin panneau panneau--hud">
            <h2>${d.noms[d.victoires[0] > d.victoires[1] ? 0 : 1]} gagne la partie !</h2>
            <p>${d.victoires[0]} manche(s) à ${d.victoires[1]}.</p>
            <button type="button" class="btn" data-relancer>${icone('plus')} Nouvelle partie</button>
          </div>`
        : mancheFinie
          ? html`<div class="jeu__fin panneau panneau--hud">
              <h2>${d.gagnantManche === -1 ? 'Égalité' : `${d.noms[d.gagnantManche]} gagne la manche`}</h2>
              <p>${d.victoires[0]} à ${d.victoires[1]}. Premier à ${MANCHES_POUR_GAGNER} manches.</p>
              <button type="button" class="btn" data-suivante>Manche suivante</button>
            </div>`
          : html`<p class="duel__consigne">Passe l’écran à <strong>${d.noms[d.tour]}</strong>. Une main jouée ou une défausse, puis c’est au tour de l’autre.</p>
            ${mainEtActions(e)}`}
      ${journal(d.journal)}`,
  );
}

export async function afficher(racine) {
  const { cartes, source, uniques } = await chargerPaquet();
  let mode = 'solo';
  let e = nouvellePartie(cartes);
  let d = null;
  let vibre = false;

  monter(
    racine,
    html`<div class="entete-page">
        <div>
          <p class="surtitre">Phase 2 · simulateur</p>
          <h1>${COMBAT.titre}</h1>
          <p>Sert à tester et régler les chiffres. Solo : passe les ${P.manches.length} mises. Duel : deux joueurs sur le même écran, à tour de rôle, premier à ${MANCHES_POUR_GAGNER} manches.</p>
        </div>
        <div class="groupe-boutons">
          <div class="segments" role="group" aria-label="Mode de jeu">
            <label><input type="radio" name="mode" value="solo" checked /><span>Solo</span></label>
            <label><input type="radio" name="mode" value="duel" /><span>Duel</span></label>
          </div>
          <button type="button" class="btn btn--petit btn--secondaire" data-sons aria-pressed="${sonsActifs()}">${sonsActifs() ? 'Sons : oui' : 'Sons : non'}</button>
          <a class="btn btn--petit btn--secondaire" href="#/combat">${icone('retour')} Règles du combat</a>
        </div>
      </div>
      <div class="jeu"></div>
      <p class="discret petit">
        Paquet de ${TAILLE_PAQUET} cartes : ${source === 'promo' ? 'les cartes publiées de la promo' : 'les cartes d’exemple (connecte-toi pour jouer avec celles de la promo)'}${uniques < TAILLE_PAQUET ? `, ${uniques} cartes différentes répétées` : ''}.
      </p>`,
  );
  const zone = racine.querySelector('.jeu');
  const courant = () => (mode === 'duel' ? d.joueurs[d.tour] : e);
  const redessiner = () => {
    if (mode === 'duel') rendreDuel(zone, d, vibre);
    else rendreSolo(zone, e, vibre);
    vibre = false;
  };
  const relancer = () => {
    if (mode === 'duel') d = nouveauDuel(cartes, ['Joueur 1', 'Joueur 2']);
    else e = nouvellePartie(cartes);
  };

  racine.addEventListener('change', (ev) => {
    if (ev.target.name === 'mode') {
      mode = ev.target.value;
      if (mode === 'duel' && !d) d = nouveauDuel(cartes, ['Joueur 1', 'Joueur 2']);
      return redessiner();
    }
    const select = ev.target.closest('[data-attaque]');
    if (!select) return;
    courant().attaqueChoisie[select.dataset.attaque] = Number(select.value);
    redessiner();
  });

  racine.addEventListener('click', (ev) => {
    const choisirBtn = ev.target.closest('[data-choisir]');
    if (choisirBtn) {
      if (!choisir(courant(), choisirBtn.dataset.choisir)) return toast(`${MAX_CARTES_PAR_MAIN} cartes maximum par main.`, 'erreur');
      jouerSon('jeton');
      return redessiner();
    }
    const sons = ev.target.closest('[data-sons]');
    if (sons) {
      activerSons(!sonsActifs());
      sons.textContent = sonsActifs() ? 'Sons : oui' : 'Sons : non';
      sons.setAttribute('aria-pressed', String(sonsActifs()));
      return;
    }
    if (ev.target.closest('[data-jouer]')) {
      const j = courant();
      if (!jouer(j)) return;
      if (j.mancheGagnee) {
        vibre = true;
        jouerSon('victoire');
      } else if (j.partiePerdue) jouerSon('defaite');
      else jouerSon('main');
      if (mode === 'duel') finDeTourDuel(d);
      return redessiner();
    }
    if (ev.target.closest('[data-defausser]')) {
      if (!defausser(courant())) return toast('Plus de défausse pour cette manche.', 'erreur');
      jouerSon('defausse');
      if (mode === 'duel') finDeTourDuel(d);
      return redessiner();
    }
    if (ev.target.closest('[data-suivante]')) {
      if (mode === 'duel') {
        d.manche += 1;
        commencerMancheDuel(d, cartes);
      } else mancheSuivante(e);
      return redessiner();
    }
    if (ev.target.closest('[data-relancer]')) {
      relancer();
      return redessiner();
    }
  });
  redessiner();
}
