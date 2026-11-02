import { BONUS_AVANTAGE, CYCLE, avantageContre, faiblesseContre } from './regles.js';

// Proposition de système de combat pour la phase 2, inspirée de Balatro.
// Tout est ici pour être affiché sur la page Combat et, plus tard, appliqué par le jeu.

export const COMBAT = {
  titre: 'Les Mains de Salon',
  resume:
    'Chaque joueur part avec un paquet tiré des cartes de la promo. À chaque manche, il joue une main de cartes : la somme des dégâts fait les jetons, les combinaisons font le multiplicateur. Jetons × multiplicateur = score. Il faut dépasser le score cible (la « mise ») avant d’avoir épuisé ses mains.',

  // Déroulé d'une partie
  partie: {
    joueurs: '2 joueurs (duel) ou 1 joueur contre la mise (solo, pour s’entraîner)',
    paquet: '20 cartes par joueur, tirées des cartes de la promo. Draft : chacun prend une carte à tour de rôle parmi 5 visibles.',
    mainsParManche: 4,
    defaussesParManche: 3,
    taillemain: 8,
    carteParMain: 'de 1 à 5 cartes',
    // Cibles : rampe croissante, calibrée avec `npm run equilibrage` (à relancer avec les cartes de la promo).
    manches: [
      { nom: 'Petite mise', cible: 3000, ante: 1 },
      { nom: 'Grande mise', cible: 3600, ante: 1 },
      { nom: 'Boss : le Colonel', cible: 4200, ante: 1, regle: 'Les cartes de la filière du boss ne comptent pas leurs effets.' },
      { nom: 'Petite mise', cible: 4800, ante: 2 },
      { nom: 'Grande mise', cible: 5400, ante: 2 },
      { nom: 'Boss : la Revue', cible: 6000, ante: 2, regle: 'Une seule défausse pour toute la manche.' },
    ],
    victoire: 'En duel : les deux joueurs affrontent la même mise avec leur paquet, à tour de rôle sur le même écran ; le premier à la passer gagne la manche, le premier à 3 manches gagne la partie. En solo : passer les 6 mises.',
  },

  // Calcul d'un score de main
  score: {
    jetons: 'somme des dégâts des attaques jouées (une attaque par carte, au choix) + 1 jeton par tranche de 10 PV de la carte',
    multiplicateur: 'commence à 1, puis ajoute les combinaisons ci-dessous',
    formule: 'score = jetons × multiplicateur',
  },

  // Combinaisons (comme les mains de poker, mais avec les filières)
  combinaisons: [
    { nom: 'Solo', condition: '1 carte', mult: '+0', exemple: 'une TESA seule' },
    { nom: 'Binôme', condition: '2 cartes de la même filière', mult: '+2', exemple: 'TESA + TESA' },
    { nom: 'Escadrille', condition: '3 cartes de la même filière', mult: '+4', exemple: 'NED × 3' },
    { nom: 'Promo', condition: 'une carte de chaque filière (TESA, NED, EGID)', mult: '+5', exemple: 'la promo au complet' },
    { nom: 'Chaîne de commandement', condition: '3 cartes qui suivent le cycle TESA → NED → EGID, jouées dans cet ordre', mult: '+7', exemple: 'TESA, NED, EGID' },
    { nom: 'Escadron', condition: '5 cartes de la même filière', mult: '+10', exemple: 'EGID × 5' },
  ],

  // Le cycle des filières pendant un combat
  cycle: {
    regle: 'Chaque mise a une filière (tirée au sort, annoncée avant la manche). Les attaques des cartes qui dominent cette filière font +30 dégâts ; celles des cartes qu’elle domine font −10 dégâts (jamais moins de 0).',
    exemple: 'Mise NED : les cartes TESA frappent à +30, les cartes EGID à −10.',
  },

  // Les effets des cartes deviennent des actions de main
  effets: [
    { id: 'soin', action: 'Récupère 1 main pour cette manche.' },
    { id: 'paralysie', action: 'Pile ou face. Face : le multiplicateur est doublé pour cette main.' },
    { id: 'brouillage', action: 'Annule la pénalité −10 du cycle pour toutes les cartes de cette main.' },
    { id: 'ravitaillement', action: 'Pioche 2 cartes de plus pour la main suivante.' },
    { id: 'blindage', action: 'La mise suivante perd 100 points de cible.' },
    { id: 'renfort', action: 'Récupère 1 défausse.' },
    { id: 'contrecoup', action: 'Cette carte vaut 0 jeton (mais garde son effet de combinaison).' },
    { id: 'epuisement', action: 'La carte est retirée du paquet pour le reste de la manche.' },
  ],

  // Exemple complet
  exemple: {
    main: [
      { nom: 'Mécano Turbo', filiere: 'tesa', pv: 100, degats: 50 },
      { nom: 'Caporal Café', filiere: 'tesa', pv: 70, degats: 70 },
      { nom: 'Wifi Instable', filiere: 'ned', pv: 50, degats: 120 },
    ],
    mise: 'NED',
    detail: [
      'Jetons : 50 + 30 (TESA domine NED) + 70 + 30 + 120 = 300',
      'Plus les PV : 10 + 7 + 5 = 22 → 322 jetons',
      'Multiplicateur : 1 + 2 (Binôme TESA) = 3',
      'Score : 322 × 3 = 966',
    ],
  },

  // Choix laissés à l'organisation
  reglages: [
    'Les cibles des mises : calibrées par simulation (`npm run equilibrage data/as-de-salon.sqlite` avec les vraies cartes), objectif ~60 % de parties gagnées.',
    'Le nombre de cartes par paquet (20) et la taille du draft (5 visibles).',
    'Les bonus de combinaisons : des valeurs rondes, faciles à retenir au tableau.',
    'Un « joker » par joueur : une carte choisie dans son paquet dont l’effet s’applique à chaque main.',
  ],
};

// --- Moteur : calcul d'une main ----------------------------------------------------------------
// Utilisé par le simulateur (navigateur) et testé côté serveur. Les règles ci-dessus sont la
// référence ; ce code les applique.


export const MALUS_CYCLE = 10;

export const COMBINAISONS = {
  binome: { nom: 'Binôme', mult: 2 },
  escadrille: { nom: 'Escadrille', mult: 4 },
  promo: { nom: 'Promo', mult: 5 },
  chaine: { nom: 'Chaîne de commandement', mult: 7 },
  escadron: { nom: 'Escadron', mult: 10 },
};

// Combinaisons présentes dans une main (liste de cartes jouées, dans l'ordre).
export function detecterCombinaisons(cartes) {
  const trouvees = [];
  const parFiliere = new Map();
  for (const c of cartes) parFiliere.set(c.filiere, (parFiliere.get(c.filiere) ?? 0) + 1);
  for (const [filiere, n] of parFiliere) {
    if (n >= 5) trouvees.push({ id: 'escadron', filiere, ...COMBINAISONS.escadron });
    else if (n >= 3) trouvees.push({ id: 'escadrille', filiere, ...COMBINAISONS.escadrille });
    else if (n === 2) trouvees.push({ id: 'binome', filiere, ...COMBINAISONS.binome });
  }
  if (CYCLE.every((f) => parFiliere.has(f))) trouvees.push({ id: 'promo', ...COMBINAISONS.promo });
  for (let i = 0; i + 2 < cartes.length; i++) {
    const [a, b, c] = cartes.slice(i, i + 3).map((x) => x.filiere);
    if (avantageContre(a) === b && avantageContre(b) === c) {
      trouvees.push({ id: 'chaine', ...COMBINAISONS.chaine });
      break;
    }
  }
  return trouvees;
}

// selection : [{ carte, attaque }] ; filiereMise : filière de la mise en cours.
// pileOuFace : fonction qui renvoie true pour « face » (remplacée dans les tests).
export function calculerMain(selection, filiereMise, { pileOuFace = () => Math.random() < 0.5 } = {}) {
  const cartes = selection.map((s) => s.carte);
  const effets = selection.map((s) => s.attaque?.effet ?? 'aucun');
  const brouillage = effets.includes('brouillage');
  const lignes = [];
  const actions = [];
  let jetons = 0;

  selection.forEach(({ carte, attaque }, i) => {
    const effet = effets[i];
    let degats = attaque?.degats ?? 0;
    let note = '';
    if (avantageContre(carte.filiere) === filiereMise) {
      degats += BONUS_AVANTAGE;
      note = ` +${BONUS_AVANTAGE} (domine ${filiereMise.toUpperCase()})`;
    } else if (faiblesseContre(carte.filiere) === filiereMise && !brouillage) {
      degats = Math.max(0, degats - MALUS_CYCLE);
      note = ` −${MALUS_CYCLE} (dominée par ${filiereMise.toUpperCase()})`;
    }
    const pv = Math.floor((carte.pv ?? 0) / 10);
    if (effet === 'contrecoup') {
      lignes.push(`${carte.nom} : Contrecoup, 0 jeton`);
      return;
    }
    jetons += degats + pv;
    lignes.push(`${carte.nom} : ${attaque?.nom ?? '—'} ${attaque?.degats ?? 0}${note} + ${pv} PV = ${degats + pv}`);
  });

  const combinaisons = detecterCombinaisons(cartes);
  let multiplicateur = 1 + combinaisons.reduce((s, c) => s + c.mult, 0);
  for (const c of combinaisons) lignes.push(`${c.nom} : ×${c.mult} en plus`);

  if (effets.includes('paralysie')) {
    const face = pileOuFace();
    if (face) {
      multiplicateur *= 2;
      lignes.push('Paralysie : face, multiplicateur doublé !');
    } else lignes.push('Paralysie : pile, rien ne se passe.');
  }
  if (brouillage) lignes.push('Brouillage : pas de pénalité de cycle sur cette main.');
  for (const [i, effet] of effets.entries()) {
    if (effet === 'soin') actions.push({ type: 'main', n: 1, texte: 'Soin : +1 main' });
    if (effet === 'renfort') actions.push({ type: 'defausse', n: 1, texte: 'Appel en renfort : +1 défausse' });
    if (effet === 'ravitaillement') actions.push({ type: 'pioche', n: 2, texte: 'Ravitaillement : +2 cartes à la prochaine pioche' });
    if (effet === 'blindage') actions.push({ type: 'cible', n: -100, texte: 'Blindage : prochaine mise −100' });
    if (effet === 'epuisement') actions.push({ type: 'retirer', carte: cartes[i], texte: `Épuisement : ${cartes[i].nom} retirée pour la manche` });
  }
  const score = jetons * multiplicateur;
  lignes.push(`Score : ${jetons} × ${multiplicateur} = ${score}`);
  return { jetons, multiplicateur, score, combinaisons, lignes, actions };
}
