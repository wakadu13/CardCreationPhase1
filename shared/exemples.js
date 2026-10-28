// Cartes d'exemple (page d'accueil et règles). Elles respectent le budget : voir test/regles.test.js.
export const EXEMPLES = [
  {
    nom: 'Caporal Café',
    sousTitre: 'Carburant officiel de la promo',
    filiere: 'soutien',
    pv: 70,
    attaques: [
      { nom: 'Double expresso', energie: 1, degats: 20, effet: 'ravitaillement', texte: '' },
      { nom: 'Réveil à 5 h 30', energie: 3, degats: 70, effet: 'epuisement', texte: 'Personne n’était prêt.' },
    ],
    description: 'Ne vole pas, mais fait décoller tout le monde chaque matin.',
    auteur: 'exemple',
    imageX: 50,
    imageY: 50,
    imageZoom: 1,
  },
  {
    nom: 'Pilote du dimanche',
    sousTitre: 'Brevet obtenu au simulateur',
    filiere: 'navigants',
    pv: 80,
    attaques: [
      { nom: 'Passage bas', energie: 2, degats: 50, effet: 'aucun', texte: 'Les vaches s’en souviennent encore.' },
      { nom: 'Vrille improvisée', energie: 3, degats: 90, effet: 'contrecoup', texte: '' },
    ],
    description: '« Je gère. » Dernier message radio connu.',
    auteur: 'exemple',
    imageX: 50,
    imageY: 50,
    imageZoom: 1,
  },
  {
    nom: 'Sergent Clé de 12',
    sousTitre: 'Répare tout sauf son réveil',
    filiere: 'mecaniciens',
    pv: 100,
    attaques: [
      { nom: 'Coup de clé', energie: 1, degats: 20, effet: 'aucun', texte: '' },
      { nom: 'Révision générale', energie: 2, degats: 30, effet: 'soin', texte: 'Il reste toujours une vis.' },
    ],
    description: 'Si ça vole, il l’a réparé. Si ça ne vole pas, il est dessous.',
    auteur: 'exemple',
    imageX: 50,
    imageY: 50,
    imageZoom: 1,
  },
];
