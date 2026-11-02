// Équilibrage des mises : simule des milliers de parties automatiques et propose des cibles.
//   npm run equilibrage                       → avec les cartes d'exemple
//   npm run equilibrage -- data/as-de-salon.sqlite → avec les cartes de la promo (base du site)
//
// Objectif (voir shared/combat.js › reglages) : environ 60 % de parties gagnées par un joueur correct.
// Le script mesure, pour chaque manche, la distribution des scores qu'un joueur automatique
// atteint avec ses 4 mains, puis propose la cible telle qu'une manche soit passée dans ~92 % des
// cas (0,92 ^ 6 manches ≈ 60 % de parties gagnées).

import { existsSync } from 'node:fs';
import { COMBAT } from '../shared/combat.js';
import { EXEMPLES } from '../shared/exemples.js';
import { completerPaquet, jouerAutomatiquement } from '../shared/partie.js';

const chemin = process.argv[2];
let cartes;
if (chemin) {
  if (!existsSync(chemin)) {
    console.error(`Base introuvable : ${chemin}`);
    process.exit(1);
  }
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(chemin, { readOnly: true });
  cartes = db
    .prepare(`SELECT id, nom, filiere, pv, attaques FROM cartes WHERE statut = 'visible' AND en_relecture = 0`)
    .all()
    .map((c) => ({ ...c, attaques: JSON.parse(c.attaques) }));
  console.log(`${cartes.length} cartes publiées lues dans ${chemin}`);
} else {
  cartes = EXEMPLES.map((c, i) => ({ ...c, id: `ex${i}` }));
  console.log(`${cartes.length} cartes d'exemple (passer le chemin de la base pour utiliser les cartes de la promo)`);
}
const paquet = completerPaquet(cartes);

// Générateur pseudo-aléatoire reproductible
function graine(s) {
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const PARTIES = Number(process.env.PARTIES ?? 3000);
const REUSSITE_MANCHE = 0.92;

// 1. Avec les cibles actuelles : taux de victoire
let gagnees = 0;
const manchesAtteintes = Array(COMBAT.partie.manches.length + 1).fill(0);
for (let i = 0; i < PARTIES; i++) {
  const r = jouerAutomatiquement(paquet, { aleatoire: graine(i + 1) });
  if (r.gagnee) gagnees++;
  manchesAtteintes[r.manchesGagnees]++;
}
console.log(`\nCibles actuelles : ${COMBAT.partie.manches.map((m) => m.cible).join(', ')}`);
console.log(`Parties gagnées : ${((gagnees / PARTIES) * 100).toFixed(1)} % (objectif ~60 %)`);
console.log(`Manches gagnées : ${manchesAtteintes.map((n, i) => `${i} → ${((n / PARTIES) * 100).toFixed(0)} %`).join(' · ')}`);

// 2. Recherche de l'échelle : les cibles suivent une rampe croissante (la dernière mise vaut
//    presque le double de la première) ; on ajuste l'échelle par dichotomie pour viser ~60 % de victoires.
const RAMPE = [0.55, 0.65, 0.75, 0.85, 0.95, 1.05];
const OBJECTIF = 0.6;
const PARTIES_RECHERCHE = Math.max(200, Math.floor(PARTIES / 4));

function tauxVictoire(echelle) {
  const manches = COMBAT.partie.manches.map((m, i) => ({ ...m, cible: Math.round((echelle * RAMPE[i]) / 50) * 50 }));
  let g = 0;
  for (let i = 0; i < PARTIES_RECHERCHE; i++) if (jouerAutomatiquement(paquet, { aleatoire: graine(50000 + i), manches }).gagnee) g++;
  return g / PARTIES_RECHERCHE;
}

let bas = 100;
let haut = 100000;
for (let k = 0; k < 18; k++) {
  const milieu = (bas + haut) / 2;
  if (tauxVictoire(milieu) > OBJECTIF) bas = milieu;
  else haut = milieu;
}
const echelle = (bas + haut) / 2;
const proposees = RAMPE.map((r) => Math.round((echelle * r) / 50) * 50);
const verification = tauxVictoire(echelle);

console.log(`\nCibles proposées (rampe croissante, ~${Math.round(verification * 100)} % de victoires pour un joueur automatique) :`);
COMBAT.partie.manches.forEach((m, i) => console.log(`  ${i + 1}. ${m.nom.padEnd(18)} ${String(proposees[i]).padStart(6)}  (actuelle ${m.cible})`));
console.log(`\nÀ reporter dans shared/combat.js (partie.manches[].cible) si elles conviennent.`);
console.log('Un joueur humain attentif fait un peu mieux que l’automate : viser 60 % ici donne ~70 % en vrai.');
