import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMBAT, COMBINAISONS, MALUS_CYCLE, calculerMain, detecterCombinaisons } from '../shared/combat.js';
import { BONUS_AVANTAGE } from '../shared/regles.js';

const c = (filiere, pv = 50, nom = filiere) => ({ nom, filiere, pv });
const a = (degats, effet = 'aucun') => ({ nom: 'att', degats, effet });

test('combinaisons par filière et chaîne de commandement', () => {
  const ids = (cartes) => detecterCombinaisons(cartes).map((x) => x.id).sort();
  assert.deepEqual(ids([c('tesa')]), []);
  assert.deepEqual(ids([c('tesa'), c('tesa')]), ['binome']);
  assert.deepEqual(ids([c('ned'), c('ned'), c('ned')]), ['escadrille']);
  assert.deepEqual(ids([c('egid'), c('egid'), c('egid'), c('egid'), c('egid')]), ['escadron']);
  assert.deepEqual(ids([c('tesa'), c('ned'), c('egid')]), ['chaine', 'promo']);
  assert.deepEqual(ids([c('egid'), c('ned'), c('tesa')]), ['promo']);
  assert.deepEqual(ids([c('tesa'), c('tesa'), c('ned'), c('egid')]), ['binome', 'chaine', 'promo']);
});

test('l’exemple des règles donne 966', () => {
  const selection = [
    { carte: c('tesa', 100, 'Mécano Turbo'), attaque: a(50) },
    { carte: c('tesa', 70, 'Caporal Café'), attaque: a(70) },
    { carte: c('ned', 50, 'Wifi Instable'), attaque: a(120) },
  ];
  const r = calculerMain(selection, 'ned');
  assert.equal(r.jetons, 322);
  assert.equal(r.multiplicateur, 1 + COMBINAISONS.binome.mult);
  assert.equal(r.score, 966);
  assert.equal(r.score, Number(COMBAT.exemple.detail.at(-1).split('= ')[1]));
});

test('cycle en combat : bonus, malus plafonné à 0, brouillage annule le malus', () => {
  assert.equal(calculerMain([{ carte: c('tesa', 0), attaque: a(40) }], 'ned').jetons, 40 + BONUS_AVANTAGE);
  assert.equal(calculerMain([{ carte: c('egid', 0), attaque: a(40) }], 'ned').jetons, 40 - MALUS_CYCLE);
  assert.equal(calculerMain([{ carte: c('egid', 0), attaque: a(0) }], 'ned').jetons, 0);
  assert.equal(calculerMain([{ carte: c('egid', 0), attaque: a(40, 'brouillage') }], 'ned').jetons, 40);
});

test('effets : contrecoup, paralysie, actions de manche', () => {
  assert.equal(calculerMain([{ carte: c('tesa', 100), attaque: a(50, 'contrecoup') }], 'egid').jetons, 0);
  const face = calculerMain([{ carte: c('tesa', 0), attaque: a(50, 'paralysie') }], 'egid', { pileOuFace: () => true });
  const pile = calculerMain([{ carte: c('tesa', 0), attaque: a(50, 'paralysie') }], 'egid', { pileOuFace: () => false });
  assert.equal(face.multiplicateur, 2);
  assert.equal(pile.multiplicateur, 1);
  const r = calculerMain(
    [
      { carte: c('tesa', 0), attaque: a(10, 'soin') },
      { carte: c('ned', 0, 'Fatiguée'), attaque: a(10, 'epuisement') },
      { carte: c('egid', 0), attaque: a(10, 'blindage') },
    ],
    'tesa',
  );
  assert.deepEqual(r.actions.map((x) => x.type), ['main', 'retirer', 'cible']);
  assert.equal(r.actions[1].carte.nom, 'Fatiguée');
});
