import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMBAT } from '../shared/combat.js';
import { EXEMPLES } from '../shared/exemples.js';
import {
  TAILLE_PAQUET,
  choisir,
  completerPaquet,
  defausser,
  jouer,
  jouerAutomatiquement,
  mancheSuivante,
  meilleureSelection,
  nouvellePartie,
} from '../shared/partie.js';

// Générateur reproductible
const graine = (s) => () => {
  s = (s * 1664525 + 1013904223) % 4294967296;
  return s / 4294967296;
};

test('le paquet est complété à 20 cartes avec des identifiants uniques', () => {
  const paquet = completerPaquet(EXEMPLES);
  assert.equal(paquet.length, TAILLE_PAQUET);
  assert.equal(new Set(paquet.map((c) => c.id)).size, TAILLE_PAQUET);
  assert.deepEqual(completerPaquet([]), []);
});

test('une partie : 8 cartes en main, 5 cartes max par main, mains et défausses décomptées', () => {
  const e = nouvellePartie(completerPaquet(EXEMPLES), { aleatoire: graine(7) });
  assert.equal(e.main.length, 8);
  assert.equal(e.pioche.length, 12);
  assert.equal(e.mains, COMBAT.partie.mainsParManche);
  for (const c of e.main.slice(0, 5)) assert.equal(choisir(e, c.id), true);
  assert.equal(choisir(e, e.main[5].id), false);
  assert.equal(choisir(e, e.main[0].id), true); // retire la première
  assert.equal(e.selection.length, 4);
  const r = jouer(e);
  assert.ok(r.score > 0);
  // Une main consommée, sauf si un effet Soin en rend une
  const mainsRendues = r.actions.filter((a) => a.type === 'main').reduce((s, a) => s + a.n, 0);
  assert.equal(e.mains, COMBAT.partie.mainsParManche - 1 + mainsRendues);
  assert.equal(e.score, r.score);
  if (!e.mancheGagnee) {
    assert.equal(e.main.length, 8);
    choisir(e, e.main[0].id);
    assert.equal(defausser(e), true);
    assert.equal(e.defausses, COMBAT.partie.defaussesParManche - 1);
    assert.equal(e.selection.length, 0);
  }
});

test('la manche suivante n’est possible qu’après avoir passé la mise', () => {
  const e = nouvellePartie(completerPaquet(EXEMPLES), { aleatoire: graine(3), manches: [{ nom: 'Test', cible: 1, ante: 1 }, { nom: 'Test 2', cible: 1, ante: 1 }] });
  assert.equal(mancheSuivante(e), false);
  e.selection = meilleureSelection(e);
  jouer(e);
  assert.equal(e.mancheGagnee, true);
  assert.equal(mancheSuivante(e), true);
  assert.equal(e.manche, 1);
  assert.equal(e.score, 0);
});

test('le joueur automatique joue des parties entières, de façon reproductible', () => {
  const paquet = completerPaquet(EXEMPLES);
  const a = jouerAutomatiquement(paquet, { aleatoire: graine(42) });
  const b = jouerAutomatiquement(paquet, { aleatoire: graine(42) });
  assert.deepEqual(a, b);
  assert.ok(a.manchesGagnees >= 0 && a.manchesGagnees <= COMBAT.partie.manches.length);
  assert.equal(a.gagnee, a.manchesGagnees === COMBAT.partie.manches.length);
  // Les cibles par défaut laissent une chance : au moins une manche passée sur 20 parties
  let total = 0;
  for (let i = 0; i < 20; i++) total += jouerAutomatiquement(paquet, { aleatoire: graine(100 + i) }).manchesGagnees;
  assert.ok(total > 0);
});
