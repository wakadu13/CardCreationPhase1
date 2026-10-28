import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXEMPLES } from '../shared/exemples.js';
import { BUDGET, calculerCout, coutAttaque, degatsMaxPour, validerCarte } from '../shared/regles.js';

const base = () => ({
  nom: 'Carte test',
  sousTitre: '',
  filiere: 'navigants',
  pv: 80,
  description: '',
  attaques: [{ nom: 'Attaque', energie: 2, degats: 50, effet: 'aucun', texte: '' }],
});

test('les cartes d’exemple respectent toutes les règles', () => {
  for (const carte of EXEMPLES) {
    const r = validerCarte(carte);
    assert.equal(r.ok, true, `${carte.nom} : ${r.erreurs.join(' / ')}`);
  }
});

test('coût d’une attaque : dégâts ÷ 2, −5 par énergie après la première, + effet, minimum 5', () => {
  assert.equal(coutAttaque({ degats: 60, energie: 2, effet: 'aucun' }), 25);
  assert.equal(coutAttaque({ degats: 20, energie: 1, effet: 'soin' }), 20);
  assert.equal(coutAttaque({ degats: 90, energie: 3, effet: 'contrecoup' }), 25);
  assert.equal(coutAttaque({ degats: 0, energie: 4, effet: 'contrecoup' }), 5);
});

test('dégâts plafonnés selon l’énergie', () => {
  assert.equal(degatsMaxPour(1), 40);
  assert.equal(degatsMaxPour(2), 80);
  assert.equal(degatsMaxPour(4), 120);
  const carte = base();
  carte.attaques[0] = { nom: 'Trop fort', energie: 1, degats: 50, effet: 'aucun', texte: '' };
  const r = validerCarte(carte);
  assert.equal(r.ok, false);
  assert.match(r.erreurs.join(), /40 dégâts maximum/);
});

test('une carte qui dépasse le budget est refusée', () => {
  const carte = base();
  carte.pv = 150;
  carte.attaques = [
    { nom: 'Gros coup', energie: 3, degats: 120, effet: 'aucun', texte: '' },
    { nom: 'Autre coup', energie: 1, degats: 40, effet: 'paralysie', texte: '' },
  ];
  const r = validerCarte(carte);
  assert.equal(r.ok, false);
  assert.ok(calculerCout(r.carte).total > BUDGET);
  assert.match(r.erreurs.join(), /Budget de puissance dépassé/);
});

test('champs obligatoires, filière et nombre d’attaques contrôlés', () => {
  const r = validerCarte({ ...base(), nom: ' ', filiere: 'inconnue', attaques: [] });
  assert.equal(r.ok, false);
  assert.ok(r.erreurs.some((e) => e.includes('nom')));
  assert.ok(r.erreurs.some((e) => e.includes('filière')));
  assert.ok(r.erreurs.some((e) => e.includes('attaques')));
  const trois = validerCarte({ ...base(), attaques: Array(3).fill(base().attaques[0]) });
  assert.equal(trois.ok, false);
});

test('les PV vont par paliers de 10 entre 30 et 150', () => {
  assert.equal(validerCarte({ ...base(), pv: 85 }).ok, false);
  assert.equal(validerCarte({ ...base(), pv: 20 }).ok, false);
  assert.equal(validerCarte({ ...base(), pv: 30 }).ok, true);
});

test('les textes sont nettoyés (espaces, caractères de contrôle) et limités', () => {
  const r = validerCarte({ ...base(), nom: '  Le\u0000  Major\n ' });
  assert.equal(r.carte.nom, 'Le Major');
  assert.equal(validerCarte({ ...base(), nom: 'x'.repeat(33) }).ok, false);
});
