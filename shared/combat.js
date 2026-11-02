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
    manches: [
      { nom: 'Petite mise', cible: 300, ante: 1 },
      { nom: 'Grande mise', cible: 450, ante: 1 },
      { nom: 'Boss : le Colonel', cible: 600, ante: 1, regle: 'Les cartes de la filière du boss ne comptent pas leurs effets.' },
      { nom: 'Petite mise', cible: 800, ante: 2 },
      { nom: 'Grande mise', cible: 1200, ante: 2 },
      { nom: 'Boss : la Revue', cible: 1600, ante: 2, regle: 'Une seule défausse pour toute la manche.' },
    ],
    victoire: 'En duel : les deux joueurs affrontent la même mise avec leur paquet ; le premier à la passer gagne la manche, le premier à 3 manches gagne la partie. En solo : passer les 6 mises.',
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
    'Les cibles des mises : à ajuster après quelques parties d’essai (viser ~60 % de réussite au début).',
    'Le nombre de cartes par paquet (20) et la taille du draft (5 visibles).',
    'Les bonus de combinaisons : des valeurs rondes, faciles à retenir au tableau.',
    'Un « joker » par joueur : une carte choisie dans son paquet dont l’effet s’applique à chaque main.',
  ],
};
