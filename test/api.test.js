import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { CLAUSES } from '../shared/certificat.js';
import { LIMITE_CARTES } from '../shared/regles.js';
import { creerApp } from '../server/app.js';
import { lireConfig } from '../server/config.js';
import { ouvrirBase } from '../server/db.js';

const DEBUT = new Date('2026-11-02T08:00:00+01:00');
const FIN = new Date('2026-11-09T20:00:00+01:00');
let horloge = new Date('2026-11-04T12:00:00+01:00');

let serveur;
let base;

before(async () => {
  const config = lireConfig({
    CAMPAGNE_DEBUT: DEBUT.toISOString(),
    CAMPAGNE_FIN: FIN.toISOString(),
    ADMINS: 'orga',
    SEUIL_SIGNALEMENTS: '3',
  });
  const app = creerApp({ db: ouvrirBase(':memory:'), config, maintenant: () => horloge });
  await new Promise((ok) => {
    serveur = app.listen(0, '127.0.0.1', ok);
  });
  base = `http://127.0.0.1:${serveur.address().port}`;
});

after(() => serveur.close());

// Petit client HTTP qui garde son cookie de session.
function client() {
  let cookie = '';
  const appel = async (methode, chemin, corps, entetes = {}) => {
    const r = await fetch(base + chemin, {
      method: methode,
      headers: { ...(cookie && { cookie }), ...(corps !== undefined && { 'content-type': 'application/json' }), ...entetes },
      body: corps !== undefined ? JSON.stringify(corps) : undefined,
    });
    const recu = r.headers.getSetCookie().find((c) => c.startsWith('ads_session='));
    if (recu) cookie = recu.split(';')[0];
    const type = r.headers.get('content-type') ?? '';
    return { status: r.status, corps: type.includes('json') ? await r.json() : await r.arrayBuffer() };
  };
  return {
    get: (c, e) => appel('GET', c, undefined, e),
    post: (c, b = {}, e) => appel('POST', c, b, e),
    put: (c, b, e) => appel('PUT', c, b, e),
    del: (c, b, e) => appel('DELETE', c, b, e),
  };
}

async function participant(identifiant) {
  const c = client();
  assert.equal((await c.post('/api/inscription', { identifiant, motDePasse: 'motdepasse1' })).status, 201);
  assert.equal((await c.post('/api/certificat', { nomComplet: `Prénom ${identifiant}`, accords: CLAUSES.map((x) => x.id) })).status, 201);
  return c;
}

const carte = (nom = 'Major Test') => ({
  nom,
  sousTitre: 'Sous-titre',
  filiere: 'mecaniciens',
  pv: 90,
  description: 'Description.',
  attaques: [{ nom: 'Clé de 12', energie: 2, degats: 50, effet: 'aucun', texte: '' }],
  confirmeSignataires: true,
});

// PNG 1×1 valide
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('inscription, identifiant unique et connexion', async () => {
  const a = client();
  assert.equal((await a.post('/api/inscription', { identifiant: 'x', motDePasse: 'motdepasse1' })).status, 400);
  assert.equal((await a.post('/api/inscription', { identifiant: 'alice', motDePasse: 'court' })).status, 400);
  assert.equal((await a.post('/api/inscription', { identifiant: 'alice', motDePasse: 'motdepasse1' })).status, 201);
  assert.equal((await client().post('/api/inscription', { identifiant: 'ALICE', motDePasse: 'motdepasse1' })).status, 409);

  const b = client();
  assert.equal((await b.post('/api/connexion', { identifiant: 'alice', motDePasse: 'mauvais-mdp' })).status, 401);
  assert.equal((await b.post('/api/connexion', { identifiant: 'alice', motDePasse: 'motdepasse1' })).status, 200);
  const etat = await b.get('/api/etat');
  assert.equal(etat.corps.utilisateur.identifiant, 'alice');
  assert.equal(etat.corps.utilisateur.certificatValide, false);
});

test('le certificat est obligatoire et doit être entièrement coché', async () => {
  const c = client();
  await c.post('/api/inscription', { identifiant: 'bruno', motDePasse: 'motdepasse1' });
  const refus = await c.get('/api/cartes');
  assert.equal(refus.status, 403);
  assert.equal(refus.corps.code, 'certificat');
  assert.equal((await c.post('/api/cartes', carte())).status, 403);

  const partiel = await c.post('/api/certificat', { nomComplet: 'Bruno Petit', accords: [CLAUSES[0].id] });
  assert.equal(partiel.status, 400);
  const ok = await c.post('/api/certificat', { nomComplet: 'Bruno Petit', accords: CLAUSES.map((x) => x.id) });
  assert.equal(ok.status, 201);
  assert.match(ok.corps.numero, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.equal((await c.get('/api/cartes')).status, 200);
  const registre = await c.get('/api/registre');
  assert.ok(registre.corps.some((s) => s.nomComplet === 'Bruno Petit'));
});

test('création de cartes : validation, image et limite de 5', async () => {
  const c = await participant('createur');
  assert.equal((await c.post('/api/cartes', { ...carte(), confirmeSignataires: false })).status, 400);
  const tropForte = await c.post('/api/cartes', { ...carte(), pv: 150, attaques: [{ nom: 'Boum', energie: 3, degats: 120, effet: 'aucun' }] });
  assert.equal(tropForte.status, 400);
  assert.match(tropForte.corps.erreur, /Budget/);

  const fausseImage = await c.post('/api/cartes', { ...carte(), image: 'data:image/png;base64,AAAAAAAAAAAA' });
  assert.equal(fausseImage.status, 400);

  const premiere = await c.post('/api/cartes', { ...carte('Avec image'), image: PNG });
  assert.equal(premiere.status, 201);
  assert.match(premiere.corps.image, /^\/api\/cartes\/\d+\/image\?v=/);
  const image = await c.get(premiere.corps.image);
  assert.equal(image.status, 200);
  assert.equal(Buffer.from(image.corps).subarray(1, 4).toString(), 'PNG');

  for (let i = 2; i <= LIMITE_CARTES; i++) assert.equal((await c.post('/api/cartes', carte(`Carte ${i}`))).status, 201);
  const sixieme = await c.post('/api/cartes', carte('Une de trop'));
  assert.equal(sixieme.status, 409);

  const { corps } = await c.get('/api/cartes/miennes');
  assert.equal(corps.cartes.length, LIMITE_CARTES);

  // Modifier, puis supprimer pour libérer une place
  const id = premiere.corps.id;
  const modif = await c.put(`/api/cartes/${id}`, { ...carte('Renommée'), image: null });
  assert.equal(modif.status, 200);
  assert.equal(modif.corps.nom, 'Renommée');
  assert.equal(modif.corps.image, null);
  assert.equal((await c.del(`/api/cartes/${id}`)).status, 200);
  assert.equal((await c.post('/api/cartes', carte('Remplaçante'))).status, 201);
});

test('on ne modifie ni ne supprime la carte d’un autre', async () => {
  const a = await participant('proprio');
  const b = await participant('intrus');
  const { corps } = await a.post('/api/cartes', carte('À moi'));
  assert.equal((await b.put(`/api/cartes/${corps.id}`, carte('Piratée'))).status, 404);
  assert.equal((await b.del(`/api/cartes/${corps.id}`)).status, 404);
});

test('signalements : masquage automatique au seuil, l’auteur seul la voit et peut la supprimer', async () => {
  const auteur = await participant('auteur');
  const { corps: c } = await auteur.post('/api/cartes', carte('Trop loin'));
  const [r1, r2, r3, r4] = await Promise.all(['sig1', 'sig2', 'sig3', 'sig4'].map(participant));

  assert.equal((await auteur.post(`/api/cartes/${c.id}/signalements`, { motif: 'autre' })).status, 400);
  assert.equal((await r1.post(`/api/cartes/${c.id}/signalements`, { motif: 'inconnu' })).status, 400);

  assert.equal((await r1.post(`/api/cartes/${c.id}/signalements`, { motif: 'trop-loin' })).corps.masquee, false);
  assert.equal((await r1.post(`/api/cartes/${c.id}/signalements`, { motif: 'trop-loin' })).status, 409);
  assert.equal((await r2.post(`/api/cartes/${c.id}/signalements`, { motif: 'discrimination' })).corps.masquee, false);
  const troisieme = await r3.post(`/api/cartes/${c.id}/signalements`, { motif: 'trop-loin', commentaire: 'Non.' });
  assert.equal(troisieme.corps.masquee, true);

  // Les autres ne la voient plus
  assert.equal((await r4.get(`/api/cartes/${c.id}`)).status, 404);
  assert.ok(!(await r4.get('/api/cartes')).corps.some((x) => x.id === c.id));
  assert.equal((await r4.post(`/api/cartes/${c.id}/signalements`, { motif: 'autre' })).status, 404);

  // L'auteur la voit masquée avec le résumé des motifs, ne peut plus la modifier, peut la supprimer
  const miennes = (await auteur.get('/api/cartes/miennes')).corps.cartes;
  const masquee = miennes.find((x) => x.id === c.id);
  assert.equal(masquee.statut, 'masquee');
  assert.deepEqual(masquee.signalements, { total: 3, motifs: { 'trop-loin': 2, discrimination: 1 } });
  assert.equal((await auteur.put(`/api/cartes/${c.id}`, carte('Corrigée'))).status, 409);
  assert.equal((await auteur.del(`/api/cartes/${c.id}`)).status, 200);
});

test('organisateurs : liste des signalements, rétablissement et export', async () => {
  const orga = await participant('orga');
  const auteur = await participant('auteur2');
  const { corps: c } = await auteur.post('/api/cartes', carte('Victime de spam'));
  const rapporteurs = await Promise.all(['spam1', 'spam2', 'spam3', 'spam4'].map(participant));
  for (const r of rapporteurs.slice(0, 3)) await r.post(`/api/cartes/${c.id}/signalements`, { motif: 'autre' });

  assert.equal((await auteur.get('/api/admin/signalements')).status, 403);
  const liste = await orga.get('/api/admin/signalements');
  assert.equal(liste.status, 200);
  const entree = liste.corps.cartes.find((x) => x.id === c.id);
  assert.equal(entree.statut, 'masquee');
  assert.equal(entree.signalements.length, 3);

  assert.equal((await orga.post(`/api/admin/cartes/${c.id}/retablir`)).status, 200);
  assert.equal((await rapporteurs[3].get(`/api/cartes/${c.id}`)).status, 200);
  // Les signalements écartés ne comptent plus, mais leurs auteurs ne peuvent pas recommencer
  assert.equal((await rapporteurs[0].post(`/api/cartes/${c.id}/signalements`, { motif: 'autre' })).status, 409);
  assert.equal((await rapporteurs[3].post(`/api/cartes/${c.id}/signalements`, { motif: 'autre' })).corps.masquee, false);

  const exp = await orga.get('/api/admin/export');
  assert.equal(exp.status, 200);
  assert.ok(exp.corps.cartes.some((x) => x.id === c.id));
  assert.ok(exp.corps.cartes.every((x) => !('estAMoi' in x)));
});

test('dates de campagne : création fermée avant et après, suppression toujours possible', async () => {
  const c = await participant('horloge');
  const { corps } = await c.post('/api/cartes', carte('Avant clôture'));
  const sauvegarde = horloge;
  try {
    horloge = new Date(DEBUT.getTime() - 1000);
    assert.equal((await c.get('/api/etat')).corps.campagne.statut, 'a-venir');
    assert.equal((await c.post('/api/cartes', carte('Trop tôt'))).status, 403);

    horloge = new Date(FIN.getTime() + 1000);
    assert.equal((await c.get('/api/etat')).corps.campagne.statut, 'terminee');
    assert.equal((await c.post('/api/cartes', carte('Trop tard'))).status, 403);
    assert.equal((await c.put(`/api/cartes/${corps.id}`, carte('Trop tard'))).status, 403);
    assert.equal((await c.del(`/api/cartes/${corps.id}`)).status, 200);
  } finally {
    horloge = sauvegarde;
  }
});

test('protection CSRF : origine étrangère et formulaire non JSON refusés', async () => {
  const c = await participant('prudent');
  const etranger = await c.post('/api/cartes', carte(), { origin: 'https://site-malveillant.example' });
  assert.equal(etranger.status, 403);
  const r = await fetch(`${base}/api/connexion`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'identifiant=prudent&motDePasse=motdepasse1',
  });
  assert.equal(r.status, 415);
});

test('supprimer son compte retire ses cartes et son certificat', async () => {
  const c = await participant('partant');
  const { corps } = await c.post('/api/cartes', carte('Dernière carte'));
  const temoin = await participant('temoin');
  assert.equal((await c.del('/api/moi', { motDePasse: 'mauvais' })).status, 403);
  assert.equal((await c.del('/api/moi', { motDePasse: 'motdepasse1' })).status, 200);
  assert.equal((await temoin.get(`/api/cartes/${corps.id}`)).status, 404);
  assert.ok(!(await temoin.get('/api/registre')).corps.some((s) => s.identifiant === 'partant'));
  assert.equal((await c.get('/api/moi')).status, 401);
});
