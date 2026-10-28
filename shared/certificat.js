// Texte du certificat de consentement.
// Changer la version oblige chaque participant à signer à nouveau.

export const VERSION_CERTIFICAT = '1.0';

export const CLAUSES = [
  {
    id: 'volontaire',
    titre: 'Participation volontaire',
    texte:
      'Je participe de mon plein gré. Je peux me retirer à tout moment en supprimant mon compte, ce qui supprime aussi mes cartes et ce certificat.',
  },
  {
    id: 'image',
    titre: 'Droit à l’humour',
    texte:
      'J’accepte que mon nom, mon surnom ou mon image apparaissent sur des cartes créées par d’autres participants, dans un esprit d’humour bienveillant et de cohésion.',
  },
  {
    id: 'signataires',
    titre: 'Uniquement des signataires',
    texte:
      'Je ne mets en scène que des personnes qui ont elles-mêmes signé ce certificat (voir le registre), ou des personnages inventés.',
  },
  {
    id: 'limites',
    titre: 'Les limites',
    texte:
      'Je m’interdis tout contenu humiliant, discriminatoire (origine, religion, genre, orientation, handicap, physique…), à caractère sexuel ou violent, ainsi que toute atteinte à la vie privée (santé, famille, photo prise sans accord).',
  },
  {
    id: 'signalement',
    titre: 'Signalements',
    texte:
      'Je comprends qu’une carte signalée par plusieurs participants est masquée automatiquement, et que son auteur peut alors la supprimer pour en créer une autre. Je n’utilise pas le signalement pour régler des comptes.',
  },
  {
    id: 'discretion',
    titre: 'Ce qui se passe au hangar reste au hangar',
    texte:
      'Je ne diffuse pas les cartes en dehors de la plateforme (réseaux sociaux, groupes extérieurs) sans l’accord des personnes représentées.',
  },
];
