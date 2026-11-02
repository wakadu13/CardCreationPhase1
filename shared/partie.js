// Déroulé d'une partie « Les Mains de Salon » (solo contre la mise).
// Sans interface : utilisé par le simulateur du site et par le script d'équilibrage.
// `aleatoire` est une fonction qui renvoie un nombre dans [0, 1) : remplaçable pour des tests reproductibles.

import { COMBAT, calculerMain } from './combat.js';
import { CYCLE } from './regles.js';

export const TAILLE_PAQUET = 20;
export const MAX_CARTES_PAR_MAIN = 5;
const P = COMBAT.partie;

export function melanger(tableau, aleatoire = Math.random) {
  const a = [...tableau];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(aleatoire() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Tant que la promo n'a pas 20 cartes, les cartes sont répétées pour remplir le paquet.
export function completerPaquet(base, taille = TAILLE_PAQUET) {
  const cartes = [];
  for (let k = 0; cartes.length < taille && base.length; k++) {
    base.forEach((c, i) => {
      if (cartes.length < taille) cartes.push({ ...c, id: `${c.id ?? i}-${k}` });
    });
  }
  return cartes;
}

// Attaque jouée par défaut : la plus forte en dégâts.
export const meilleureAttaque = (carte) =>
  (carte.attaques ?? []).reduce((meilleure, a, i, t) => (a.degats > t[meilleure].degats ? i : meilleure), 0);

export function nouvellePartie(cartes, { aleatoire = Math.random, manches = P.manches } = {}) {
  const e = {
    aleatoire,
    manches,
    paquetComplet: melanger(cartes, aleatoire).slice(0, TAILLE_PAQUET),
    manche: 0,
    bonusCible: 0,
    partieGagnee: false,
    partiePerdue: false,
    manchesGagnees: 0,
    journal: [],
  };
  commencerManche(e);
  return e;
}

export function commencerManche(e) {
  const m = e.manches[e.manche];
  e.cible = Math.max(50, m.cible + e.bonusCible);
  e.bonusCible = 0;
  e.filiereMise = CYCLE[Math.floor(e.aleatoire() * CYCLE.length)];
  e.mains = P.mainsParManche;
  e.defausses = m.regle?.includes('Une seule défausse') ? 1 : P.defaussesParManche;
  e.score = 0;
  e.pioche = melanger(e.paquetComplet, e.aleatoire);
  e.main = [];
  e.selection = [];
  e.attaqueChoisie = {};
  e.piocheBonus = 0;
  e.mancheGagnee = false;
  piocher(e, P.taillemain);
  e.journal.unshift(`Manche ${e.manche + 1} · ${m.nom} · mise ${e.filiereMise.toUpperCase()} · cible ${e.cible}`);
}

export function piocher(e, n) {
  while (e.main.length < P.taillemain + e.piocheBonus && e.pioche.length && n-- > 0) {
    const carte = e.pioche.pop();
    e.main.push(carte);
    e.attaqueChoisie[carte.id] ??= meilleureAttaque(carte);
  }
  e.piocheBonus = 0;
}

export const selectionCourante = (e) =>
  e.selection.map((id) => {
    const carte = e.main.find((c) => c.id === id);
    return { carte, attaque: carte.attaques?.[e.attaqueChoisie[id] ?? 0] ?? carte.attaques?.[0] ?? null };
  });

// Aperçu du score sans jouer (pile ou face compté comme pile).
export const apercuMain = (e) => (e.selection.length ? calculerMain(selectionCourante(e), e.filiereMise, { pileOuFace: () => false }) : null);

export function choisir(e, id) {
  if (e.selection.includes(id)) e.selection = e.selection.filter((x) => x !== id);
  else if (e.selection.length >= MAX_CARTES_PAR_MAIN) return false;
  else e.selection.push(id);
  return true;
}

export function jouer(e) {
  if (!e.selection.length || e.mancheGagnee || e.partiePerdue) return null;
  const m = e.manches[e.manche];
  const selection = selectionCourante(e).map(({ carte, attaque }) => {
    // Boss « le Colonel » : les effets des cartes de sa filière ne comptent pas
    const effetAnnule = m.regle?.includes('effets') && carte.filiere === e.filiereMise;
    return { carte, attaque: attaque ? { ...attaque, effet: effetAnnule ? 'aucun' : attaque.effet } : null };
  });
  const r = calculerMain(selection, e.filiereMise, { pileOuFace: () => e.aleatoire() < 0.5 });
  e.score += r.score;
  e.mains -= 1;
  e.journal.unshift(...[...r.lignes].reverse());
  for (const a of r.actions) {
    e.journal.unshift(a.texte);
    if (a.type === 'main') e.mains += a.n;
    if (a.type === 'defausse') e.defausses += a.n;
    if (a.type === 'pioche') e.piocheBonus = a.n;
    if (a.type === 'cible') e.bonusCible += a.n;
    if (a.type === 'retirer') e.pioche = e.pioche.filter((c) => c.id !== a.carte.id);
  }
  e.main = e.main.filter((c) => !e.selection.includes(c.id));
  e.selection = [];
  e.dernierResultat = r;
  if (e.score >= e.cible) {
    e.mancheGagnee = true;
    e.manchesGagnees += 1;
    e.journal.unshift(`Mise passée : ${e.score} ≥ ${e.cible} !`);
    if (e.manche === e.manches.length - 1) e.partieGagnee = true;
  } else if (e.mains === 0 || (e.main.length === 0 && e.pioche.length === 0)) {
    e.partiePerdue = true;
    e.journal.unshift(`Plus de main : ${e.score} < ${e.cible}. Partie perdue.`);
  } else piocher(e, P.taillemain);
  return r;
}

export function defausser(e) {
  if (!e.selection.length || e.defausses <= 0) return false;
  e.defausses -= 1;
  e.main = e.main.filter((c) => !e.selection.includes(c.id));
  e.journal.unshift(`Défausse de ${e.selection.length} carte${e.selection.length > 1 ? 's' : ''}.`);
  e.selection = [];
  piocher(e, P.taillemain);
  return true;
}

export function mancheSuivante(e) {
  if (!e.mancheGagnee || e.partieGagnee) return false;
  e.manche += 1;
  commencerManche(e);
  return true;
}

// --- Joueur automatique (pour l'équilibrage) ----------------------------------------------------
// Stratégie simple : essaie toutes les combinaisons de 1 à 5 cartes de la main et joue la meilleure.
// C'est un joueur correct sans être expert : un humain attentif fera un peu mieux.
export function meilleureSelection(e) {
  const cartes = e.main;
  let meilleur = { score: -1, ids: [] };
  const n = cartes.length;
  const total = 1 << n;
  for (let masque = 1; masque < total; masque++) {
    const ids = [];
    for (let i = 0; i < n; i++) if (masque & (1 << i)) ids.push(cartes[i].id);
    if (ids.length > MAX_CARTES_PAR_MAIN) continue;
    const selection = ids.map((id) => {
      const carte = cartes.find((c) => c.id === id);
      return { carte, attaque: carte.attaques?.[e.attaqueChoisie[id] ?? 0] ?? null };
    });
    const { score } = calculerMain(selection, e.filiereMise, { pileOuFace: () => false });
    if (score > meilleur.score) meilleur = { score, ids };
  }
  return meilleur.ids;
}

// Joue une partie entière automatiquement. Renvoie le nombre de manches gagnées (6 = partie gagnée).
export function jouerAutomatiquement(cartes, options = {}) {
  const e = nouvellePartie(cartes, options);
  let garde = 0;
  while (!e.partieGagnee && !e.partiePerdue && garde++ < 200) {
    if (e.mancheGagnee) {
      mancheSuivante(e);
      continue;
    }
    e.selection = meilleureSelection(e);
    if (!e.selection.length) break;
    jouer(e);
  }
  return { manchesGagnees: e.manchesGagnees, gagnee: e.partieGagnee, score: e.score, cible: e.cible, manche: e.manche };
}
