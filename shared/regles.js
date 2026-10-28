// Règles de création des cartes.
// Ce fichier est chargé à la fois par le navigateur (aperçu en direct) et par
// le serveur (validation finale) : une seule source de vérité pour l'équilibrage.

export const LIMITE_CARTES = 5;

// Chaque carte dispose d'un budget de puissance à répartir entre ses PV et ses attaques.
export const BUDGET = 100;

// Les filières jouent le rôle des « types » Pokémon.
// Liste provisoire, à adapter aux filières réelles de la promo.
export const FILIERES = [
  { id: 'navigants', nom: 'Navigants', couleur: '#2b74c8', icone: 'avion' },
  { id: 'mecaniciens', nom: 'Mécaniciens', couleur: '#d27a22', icone: 'cle' },
  { id: 'controle', nom: 'Contrôle & Détection', couleur: '#2a9467', icone: 'radar' },
  { id: 'protection', nom: 'Protection & Commandos', couleur: '#6d7b35', icone: 'bouclier' },
  { id: 'cyber', nom: 'Systèmes & Cyber', couleur: '#7c63c4', icone: 'puce' },
  { id: 'soutien', nom: 'Soutien & Admin', couleur: '#b83a3a', icone: 'tampon' },
];

export const PV = { min: 30, max: 150, pas: 10 };

export const ATTAQUE = {
  min: 1,
  max: 2,
  energieMin: 1,
  energieMax: 4,
  degatsMax: 120,
  degatsPas: 10,
  // Dégâts maximum autorisés par point d'énergie (1 énergie → 40, 2 → 80, 3+ → 120).
  degatsParEnergie: 40,
  coutMin: 5,
};

// Effets codifiés : ils seront appliqués automatiquement en phase 2.
// Un coût négatif signifie que l'effet est un handicap qui rend des points.
export const EFFETS = [
  { id: 'aucun', nom: 'Aucun effet', cout: 0, texte: '' },
  { id: 'soin', nom: 'Soin', cout: 10, texte: 'Soigne 20 PV à cette carte.' },
  { id: 'paralysie', nom: 'Paralysie', cout: 15, texte: 'Pile ou face. Face : la carte adverse ne peut pas attaquer au prochain tour.' },
  { id: 'brouillage', nom: 'Brouillage', cout: 15, texte: 'Défaussez 1 énergie de la carte adverse.' },
  { id: 'ravitaillement', nom: 'Ravitaillement en vol', cout: 10, texte: 'Attachez 1 énergie de votre réserve à l’une de vos cartes.' },
  { id: 'blindage', nom: 'Blindage', cout: 10, texte: 'Au prochain tour adverse, cette carte subit 20 dégâts de moins.' },
  { id: 'renfort', nom: 'Appel en renfort', cout: 10, texte: 'Piochez 1 carte.' },
  { id: 'contrecoup', nom: 'Contrecoup', cout: -10, texte: 'Cette carte s’inflige 20 dégâts.' },
  { id: 'epuisement', nom: 'Épuisement', cout: -10, texte: 'Cette carte ne peut pas attaquer au prochain tour.' },
];

export const TEXTES = {
  nom: { min: 2, max: 32 },
  sousTitre: { min: 0, max: 40 },
  description: { min: 0, max: 120 },
  attaqueNom: { min: 2, max: 28 },
  attaqueTexte: { min: 0, max: 60 },
};

export const CADRAGE = { zoomMin: 1, zoomMax: 2.5 };

export const MOTIFS_SIGNALEMENT = [
  { id: 'trop-loin', nom: 'Va trop loin, blessant' },
  { id: 'non-signataire', nom: 'Met en scène une personne qui n’a pas signé le certificat' },
  { id: 'discrimination', nom: 'Discriminatoire ou harcelant' },
  { id: 'vie-privee', nom: 'Atteinte à la vie privée (photo, info perso)' },
  { id: 'autre', nom: 'Autre raison' },
];

export const filiere = (id) => FILIERES.find((f) => f.id === id);
export const effet = (id) => EFFETS.find((e) => e.id === id);

export const coutPv = (pv) => pv / 2;

export const degatsMaxPour = (energie) => Math.min(ATTAQUE.degatsMax, ATTAQUE.degatsParEnergie * energie);

// Coût d'une attaque : la moitié des dégâts, moins 5 points par énergie au-delà de la première
// (une attaque lente coûte moins cher), plus le coût de l'effet. Jamais moins de 5.
export function coutAttaque(a) {
  const e = effet(a.effet) ?? EFFETS[0];
  const brut = a.degats / 2 - 5 * (a.energie - 1) + e.cout;
  return Math.max(ATTAQUE.coutMin, brut);
}

export function calculerCout(carte) {
  const pv = coutPv(carte.pv);
  const attaques = (carte.attaques ?? []).map(coutAttaque);
  const total = pv + attaques.reduce((s, c) => s + c, 0);
  return { pv, attaques, total, reste: BUDGET - total };
}

function nettoyer(texte) {
  return String(texte ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function entier(valeur) {
  const n = typeof valeur === 'string' && valeur.trim() !== '' ? Number(valeur) : valeur;
  return Number.isInteger(n) ? n : NaN;
}

function controlerTexte(erreurs, valeur, regle, libelle) {
  const longueur = [...valeur].length;
  if (longueur < regle.min) {
    erreurs.push(regle.min <= 1 ? `${libelle} est obligatoire.` : `${libelle} : ${regle.min} caractères minimum.`);
  } else if (longueur > regle.max) {
    erreurs.push(`${libelle} : ${regle.max} caractères maximum.`);
  }
}

// Vérifie et normalise une carte. Retourne { ok, erreurs, carte, cout }.
export function validerCarte(entree) {
  const erreurs = [];
  const src = entree ?? {};

  const carte = {
    nom: nettoyer(src.nom),
    sousTitre: nettoyer(src.sousTitre),
    filiere: String(src.filiere ?? ''),
    pv: entier(src.pv),
    description: nettoyer(src.description),
    attaques: [],
    imageX: Number(src.imageX ?? 50),
    imageY: Number(src.imageY ?? 50),
    imageZoom: Number(src.imageZoom ?? 1),
  };

  controlerTexte(erreurs, carte.nom, TEXTES.nom, 'Le nom');
  controlerTexte(erreurs, carte.sousTitre, TEXTES.sousTitre, 'Le sous-titre');
  controlerTexte(erreurs, carte.description, TEXTES.description, 'La description');

  if (!filiere(carte.filiere)) erreurs.push('Choisis une filière.');

  if (Number.isNaN(carte.pv) || carte.pv < PV.min || carte.pv > PV.max || carte.pv % PV.pas !== 0) {
    erreurs.push(`Les PV doivent être entre ${PV.min} et ${PV.max}, par paliers de ${PV.pas}.`);
  }

  const attaques = Array.isArray(src.attaques) ? src.attaques : [];
  if (attaques.length < ATTAQUE.min || attaques.length > ATTAQUE.max) {
    erreurs.push(`Une carte a entre ${ATTAQUE.min} et ${ATTAQUE.max} attaques.`);
  }

  attaques.slice(0, ATTAQUE.max).forEach((a, i) => {
    const libelle = `Attaque ${i + 1}`;
    const att = {
      nom: nettoyer(a?.nom),
      energie: entier(a?.energie),
      degats: entier(a?.degats),
      effet: String(a?.effet ?? 'aucun'),
      texte: nettoyer(a?.texte),
    };
    controlerTexte(erreurs, att.nom, TEXTES.attaqueNom, `${libelle} : le nom`);
    controlerTexte(erreurs, att.texte, TEXTES.attaqueTexte, `${libelle} : le texte`);
    if (Number.isNaN(att.energie) || att.energie < ATTAQUE.energieMin || att.energie > ATTAQUE.energieMax) {
      erreurs.push(`${libelle} : l’énergie doit être entre ${ATTAQUE.energieMin} et ${ATTAQUE.energieMax}.`);
      att.energie = ATTAQUE.energieMin;
    }
    if (Number.isNaN(att.degats) || att.degats < 0 || att.degats % ATTAQUE.degatsPas !== 0) {
      erreurs.push(`${libelle} : les dégâts vont par paliers de ${ATTAQUE.degatsPas}.`);
      att.degats = 0;
    } else if (att.degats > degatsMaxPour(att.energie)) {
      erreurs.push(`${libelle} : ${degatsMaxPour(att.energie)} dégâts maximum avec ${att.energie} énergie${att.energie > 1 ? 's' : ''}.`);
    }
    if (!effet(att.effet)) {
      erreurs.push(`${libelle} : effet inconnu.`);
      att.effet = 'aucun';
    }
    carte.attaques.push(att);
  });

  if (![carte.imageX, carte.imageY].every((v) => Number.isFinite(v) && v >= 0 && v <= 100)) {
    erreurs.push('Cadrage de l’image invalide.');
    carte.imageX = 50;
    carte.imageY = 50;
  }
  if (!Number.isFinite(carte.imageZoom) || carte.imageZoom < CADRAGE.zoomMin || carte.imageZoom > CADRAGE.zoomMax) {
    erreurs.push('Zoom de l’image invalide.');
    carte.imageZoom = 1;
  }

  const cout = Number.isNaN(carte.pv) ? null : calculerCout(carte);
  if (cout && cout.total > BUDGET) {
    erreurs.push(`Budget de puissance dépassé : ${cout.total} / ${BUDGET}. Baisse les PV ou les dégâts.`);
  }

  return { ok: erreurs.length === 0, erreurs, carte, cout };
}
