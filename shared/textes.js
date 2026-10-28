// Textes personnalisables depuis Organisation › Personnalisation.
// Chaque texte a une valeur d'origine ; les organisateurs peuvent la remplacer sans toucher au code.
//
// Mise en forme possible : **gras**, *italique*, [lien](https://…), listes avec « - » en début de ligne.
// Variables remplacées à l'affichage : {nomJeu}, {promo}, {limiteCartes}, {seuil}, {budget}.
//
// type : 'ligne' (une ligne) ou 'texte' (plusieurs paragraphes).
// obligatoire : ne peut pas être vidé. Les autres textes vides ne s'affichent pas.

export const VARIABLES = [
  { nom: 'nomJeu', aide: 'nom du jeu' },
  { nom: 'promo', aide: 'nom de la promo' },
  { nom: 'limiteCartes', aide: 'cartes par personne' },
  { nom: 'seuil', aide: 'seuil de signalements' },
  { nom: 'budget', aide: 'budget de puissance' },
];

export const SECTIONS_TEXTES = [
  {
    titre: 'Partout sur le site',
    champs: [
      { cle: 'nomJeu', libelle: 'Nom du jeu', type: 'ligne', max: 40, obligatoire: true, defaut: 'Les As de Salon' },
      { cle: 'slogan', libelle: 'Sous-titre du logo', type: 'ligne', max: 50, defaut: 'Jeu de cartes de cohésion' },
      {
        cle: 'annonce',
        libelle: 'Annonce en haut de toutes les pages',
        type: 'ligne',
        max: 200,
        defaut: '',
        aide: 'Pour un rappel ou une nouvelle (« Clôture dimanche à 20 h ! »). Vide : pas d’annonce.',
      },
      { cle: 'piedDePage', libelle: 'Texte du pied de page', type: 'ligne', max: 120, defaut: 'Humour et cohésion' },
    ],
  },
  {
    titre: 'Accueil',
    champs: [
      { cle: 'accueil.surtitre', libelle: 'Petit titre au-dessus du nom', type: 'ligne', max: 60, defaut: 'Salon-de-Provence · Phase 1' },
      {
        cle: 'accueil.accroche',
        libelle: 'Présentation',
        type: 'texte',
        max: 500,
        defaut:
          'Le jeu de cartes de la promo, fait par la promo. Pendant une semaine, chacun conçoit ses cartes : un nom, une filière, des points de vie, des attaques… et beaucoup d’autodérision.',
      },
      { cle: 'accueil.etape1', libelle: 'Étape 1', type: 'ligne', max: 100, defaut: '**Connecte-toi** avec les identifiants reçus des organisateurs' },
      { cle: 'accueil.etape2', libelle: 'Étape 2', type: 'ligne', max: 100, defaut: '**Signe le certificat** de consentement' },
      { cle: 'accueil.etape3', libelle: 'Étape 3', type: 'ligne', max: 100, defaut: '**Conçois jusqu’à {limiteCartes} cartes** dans l’atelier' },
      {
        cle: 'accueil.noteConnexion',
        libelle: 'Message sous le formulaire de connexion',
        type: 'ligne',
        max: 200,
        defaut: 'Pas encore de compte ? Ils sont créés par les organisateurs pour les participants choisis : demande-leur tes identifiants.',
      },
      {
        cle: 'accueil.phase1',
        libelle: 'Description de la phase 1',
        type: 'texte',
        max: 300,
        defaut: 'Signe le certificat de consentement, puis conçois jusqu’à **{limiteCartes} cartes**. Une carte qui va trop loin se signale.',
      },
      {
        cle: 'accueil.phase2',
        libelle: 'Description de la phase 2',
        type: 'texte',
        max: 300,
        defaut: 'Les cartes de la phase 1 s’affrontent, filière contre filière. Des fenêtres d’ajout de cartes seront annoncées à l’avance.',
      },
    ],
  },
  {
    titre: 'Pages des participants',
    champs: [
      {
        cle: 'hangar.message',
        libelle: 'Message en haut du hangar',
        type: 'texte',
        max: 800,
        defaut: '',
        aide: 'Affiché à chaque participant sur sa page d’accueil. Vide : pas de message.',
      },
      {
        cle: 'atelier.consignes',
        libelle: 'Consignes de l’atelier',
        type: 'texte',
        max: 500,
        defaut: 'Budget de {budget} points de puissance à répartir entre les points de vie et les attaques. L’aperçu se met à jour en direct.',
      },
      {
        cle: 'galerie.intro',
        libelle: 'Introduction de la galerie',
        type: 'texte',
        max: 400,
        defaut: 'Clique sur une carte pour l’agrandir. Si une carte va trop loin, signale-la : au bout de {seuil} signalements, elle est masquée.',
      },
      {
        cle: 'certificat.intro',
        libelle: 'Introduction du certificat',
        type: 'texte',
        max: 500,
        defaut:
          'C’est la protection de base du jeu : tout le monde accepte les mêmes règles avant de créer ou de voir la moindre carte. Lis chaque engagement et coche-le.',
        aide: 'Les engagements eux-mêmes ne se modifient pas ici : les changer obligerait tout le monde à signer à nouveau.',
      },
    ],
  },
  {
    titre: 'Règles du jeu',
    champs: [
      {
        cle: 'regles.intro',
        libelle: 'Introduction',
        type: 'texte',
        max: 500,
        defaut: 'L’humour est libre, l’équilibre est garanti : chaque carte reçoit le même budget de puissance, quelle que soit la personne qui la conçoit.',
      },
      { cle: 'cycle.tesa', libelle: 'Pourquoi TESA domine NED', type: 'ligne', max: 140, defaut: 'Les techniciens savent où se trouve le bouton d’alimentation.' },
      { cle: 'cycle.ned', libelle: 'Pourquoi NED domine EGID', type: 'ligne', max: 140, defaut: 'L’algorithme avait prédit le résultat du sondage avant qu’il commence.' },
      { cle: 'cycle.egid', libelle: 'Pourquoi EGID domine TESA', type: 'ligne', max: 140, defaut: 'Rien ne résiste à une réunion de deux heures sur le facteur humain.' },
      {
        cle: 'regles.sectionTitre',
        libelle: 'Section libre : titre',
        type: 'ligne',
        max: 60,
        defaut: '',
        aide: 'Une section en plus à la fin des règles : calendrier, lots à gagner… Vide : pas de section.',
      },
      { cle: 'regles.sectionTexte', libelle: 'Section libre : contenu', type: 'texte', max: 3000, defaut: '' },
    ],
  },
];

export const CHAMPS_TEXTES = SECTIONS_TEXTES.flatMap((s) => s.champs);

export const champTexte = (cle) => CHAMPS_TEXTES.find((c) => c.cle === cle);

// Nettoie une valeur saisie : retours à la ligne normalisés, caractères de contrôle retirés.
export function nettoyerTexte(valeur, type) {
  let v = String(valeur ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ');
  if (type === 'ligne') v = v.replace(/\s+/g, ' ');
  return v.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
