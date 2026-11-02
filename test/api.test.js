import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, test } from 'node:test';
import { CLAUSES } from '../shared/certificat.js';
import { creerApp } from '../server/app.js';
import { assurerAdmin, identifiantDepuisNom } from '../server/comptes.js';
import { lireConfig } from '../server/config.js';
import { ouvrirBase } from '../server/db.js';
import { remplirDemo } from '../server/demo.js';

const DEBUT = new Date('2026-11-02T08:00:00+01:00');
const FIN = new Date('2026-11-09T20:00:00+01:00');
let horloge = new Date('2026-11-04T12:00:00+01:00');

let serveur;
let base;
let db;
let admin;

// Relecture désactivée pour les scénarios généraux ; un test dédié l'active.
const ENV = { CAMPAGNE_DEBUT: DEBUT.toISOString(), CAMPAGNE_FIN: FIN.toISOString(), SEUIL_SIGNALEMENTS: '3', RELECTURE: '0' };

before(async () => {
  db = ouvrirBase(':memory:');
  const app = creerApp({ db, config: lireConfig(ENV), maintenant: () => horloge });
  await assurerAdmin(db, { identifiant: 'admin', motDePasse: 'provisoire-admin' });
  await new Promise((ok) => {
    serveur = app.listen(0, '127.0.0.1', ok);
  });
  base = `http://127.0.0.1:${serveur.address().port}`;

  admin = client();
  assert.equal((await admin.post('/api/connexion', { identifiant: 'admin', motDePasse: 'provisoire-admin' })).status, 200);
  assert.equal((await admin.post('/api/moi/mot-de-passe', { nouveau: 'admin-definitif' })).status, 200);
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
    patch: (c, b, e) => appel('PATCH', c, b, e),
    del: (c, b, e) => appel('DELETE', c, b, e),
  };
}

// Parcours complet d'un participant : compte créé par l'organisateur, première connexion, certificat.
// role : 'participant' (voit et signale) ou 'editeur' (conçoit aussi les cartes).
async function participant(identifiant, { signer = true, role = 'participant' } = {}) {
  const creation = await admin.post('/api/admin/comptes', { comptes: [{ nomComplet: `Prénom ${identifiant}`, identifiant }], role });
  assert.equal(creation.status, 201, JSON.stringify(creation.corps));
  const c = client();
  assert.equal((await c.post('/api/connexion', { identifiant, motDePasse: creation.corps.comptes[0].motDePasse })).status, 200);
  assert.equal((await c.post('/api/moi/mot-de-passe', { nouveau: 'motdepasse1' })).status, 200);
  if (signer) assert.equal((await c.post('/api/certificat', { accords: CLAUSES.map((x) => x.id) })).status, 201);
  return c;
}

const editeur = (identifiant, options = {}) => participant(identifiant, { ...options, role: 'editeur' });

const idDe = async (identifiant) => (await admin.get('/api/admin/comptes')).corps.find((c) => c.identifiant === identifiant).id;

const carte = (nom = 'Major Test') => ({
  nom,
  sousTitre: 'Sous-titre',
  filiere: 'tesa',
  pv: 90,
  description: 'Description.',
  attaques: [{ nom: 'Clé de 12', energie: 2, degats: 50, effet: 'aucun', texte: '' }],
  confirmeSignataires: true,
});

// PNG 1×1 valide
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('identifiants générés à partir du nom', () => {
  assert.equal(identifiantDepuisNom('Élodie Le Gall-Durand'), 'elodie.le.gall.durand');
  assert.equal(identifiantDepuisNom('Jo'), 'jo0');
  assert.ok(identifiantDepuisNom('Maximilien-Alexandre de la Tour du Pin').length <= 24);
});

test('pas d’inscription libre : seuls les organisateurs créent des comptes', async () => {
  assert.equal((await client().post('/api/inscription', { identifiant: 'pirate', motDePasse: 'motdepasse1' })).status, 404);

  const curieux = await participant('curieux');
  assert.equal((await curieux.post('/api/admin/comptes', { comptes: [{ nomComplet: 'Ami Secret' }] })).status, 403);
  assert.equal((await curieux.get('/api/admin/comptes')).status, 403);
  assert.equal((await client().get('/api/admin/comptes')).status, 401);
});

test('création en lot : identifiants automatiques, doublons refusés, tout ou rien', async () => {
  const lot = await admin.post('/api/admin/comptes', {
    comptes: [{ nomComplet: 'Alice Dupont' }, { nomComplet: 'Élodie  Lefèvre' }, { nomComplet: 'Alicé Dupont' }],
  });
  assert.equal(lot.status, 201);
  assert.deepEqual(
    lot.corps.comptes.map((c) => [c.nomComplet, c.identifiant]),
    [
      ['Alice Dupont', 'alice.dupont'],
      ['Élodie Lefèvre', 'elodie.lefevre'],
      ['Alicé Dupont', 'alice.dupont2'],
    ],
  );
  assert.ok(lot.corps.comptes.every((c) => /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{2}$/.test(c.motDePasse)));

  // Personne déjà inscrite, ligne en double, ligne invalide : rien n'est créé
  const avant = (await admin.get('/api/admin/comptes')).corps.length;
  assert.equal((await admin.post('/api/admin/comptes', { comptes: [{ nomComplet: 'Nouveau Venu' }, { nomComplet: 'alice dupont' }] })).status, 409);
  assert.equal((await admin.post('/api/admin/comptes', { comptes: [{ nomComplet: 'Paul Roux' }, { nomComplet: 'Paul Roux' }] })).status, 400);
  assert.equal((await admin.post('/api/admin/comptes', { comptes: [{ nomComplet: 'Zoé Petit' }, { nomComplet: 'X' }] })).status, 400);
  assert.equal((await admin.post('/api/admin/comptes', { comptes: [{ nomComplet: 'Zoé Petit', identifiant: 'alice.dupont' }] })).status, 409);
  assert.equal((await admin.get('/api/admin/comptes')).corps.length, avant);
});

test('première connexion : le mot de passe provisoire doit être remplacé', async () => {
  const { corps } = await admin.post('/api/admin/comptes', { comptes: [{ nomComplet: 'Bruno Petit' }] });
  const { identifiant, motDePasse } = corps.comptes[0];
  const c = client();
  assert.equal((await c.post('/api/connexion', { identifiant, motDePasse: 'mauvais-mdp' })).status, 401);
  assert.equal((await c.post('/api/connexion', { identifiant, motDePasse })).status, 200);

  const etat = (await c.get('/api/etat')).corps.utilisateur;
  assert.equal(etat.doitChangerMdp, true);
  assert.equal(etat.nomComplet, 'Bruno Petit');
  for (const chemin of ['/api/cartes', '/api/certificat']) {
    const refus = await c.get(chemin);
    assert.equal(refus.status, 403);
    assert.equal(refus.corps.code, 'mot-de-passe');
  }
  assert.equal((await c.post('/api/moi/mot-de-passe', { nouveau: motDePasse })).status, 400);
  assert.equal((await c.post('/api/moi/mot-de-passe', { nouveau: 'court' })).status, 400);
  assert.equal((await c.post('/api/moi/mot-de-passe', { nouveau: 'mon-mot-de-passe' })).status, 200);
  assert.equal((await c.get('/api/etat')).corps.utilisateur.doitChangerMdp, false);

  // Ensuite, l'ancien mot de passe est exigé pour en changer
  assert.equal((await c.post('/api/moi/mot-de-passe', { nouveau: 'encore-un-autre' })).status, 403);
  assert.equal((await c.post('/api/moi/mot-de-passe', { actuel: 'mon-mot-de-passe', nouveau: 'encore-un-autre' })).status, 200);
});

test('le certificat est obligatoire et porte le nom saisi par les organisateurs', async () => {
  const c = await participant('signataire', { signer: false });
  const refus = await c.get('/api/cartes');
  assert.equal(refus.status, 403);
  assert.equal(refus.corps.code, 'certificat');
  assert.equal((await c.post('/api/cartes', carte())).status, 403);

  assert.equal((await c.get('/api/certificat')).corps.nomCompte, 'Prénom signataire');
  assert.equal((await c.post('/api/certificat', { accords: [CLAUSES[0].id] })).status, 400);
  const ok = await c.post('/api/certificat', { nomComplet: 'Faux Nom', accords: CLAUSES.map((x) => x.id) });
  assert.equal(ok.status, 201);
  assert.match(ok.corps.numero, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  const registre = (await c.get('/api/registre')).corps;
  assert.ok(registre.some((s) => s.identifiant === 'signataire' && s.nomComplet === 'Prénom signataire'));
  assert.ok(!registre.some((s) => s.nomComplet === 'Faux Nom'));
});

test('création de cartes : réservée aux éditeurs, validation, image et limite réglable', async () => {
  const simple = await participant('spectateur');
  const refus = await simple.post('/api/cartes', carte('Interdite'));
  assert.equal(refus.status, 403);
  assert.equal((await simple.get('/api/cartes/miennes')).status, 403);
  assert.equal((await simple.get('/api/cartes')).status, 200);

  const c = await editeur('createur');
  assert.equal((await c.post('/api/cartes', { ...carte(), confirmeSignataires: false })).status, 400);
  assert.equal((await c.post('/api/cartes', { ...carte(), filiere: 'navigants' })).status, 400);
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

  // Sans limite par défaut, puis limite fixée à 3 par l'organisation
  assert.equal((await c.get('/api/cartes/miennes')).corps.limite, 0);
  for (let i = 2; i <= 3; i++) assert.equal((await c.post('/api/cartes', carte(`Carte ${i}`))).status, 201);
  assert.equal((await admin.put('/api/admin/parametres', { seuilSignalements: 3, limiteCartes: 3 })).status, 200);
  assert.equal((await c.post('/api/cartes', carte('Une de trop'))).status, 409);
  assert.equal((await c.get('/api/cartes/miennes')).corps.cartes.length, 3);
  assert.equal((await admin.put('/api/admin/parametres', { seuilSignalements: 3, limiteCartes: 0 })).status, 200);

  const id = premiere.corps.id;
  const modif = await c.put(`/api/cartes/${id}`, { ...carte('Renommée'), filiere: 'egid', image: null });
  assert.equal(modif.status, 200);
  assert.equal(modif.corps.nom, 'Renommée');
  assert.equal(modif.corps.filiere, 'egid');
  assert.equal(modif.corps.image, null);
  assert.equal((await c.del(`/api/cartes/${id}`)).status, 200);
  assert.equal((await c.post('/api/cartes', carte('Remplaçante'))).status, 201);
});

test('on ne modifie ni ne supprime la carte d’un autre', async () => {
  const a = await editeur('proprio');
  const b = await editeur('intrus');
  const { corps } = await a.post('/api/cartes', carte('À moi'));
  assert.equal((await b.put(`/api/cartes/${corps.id}`, carte('Piratée'))).status, 404);
  assert.equal((await b.del(`/api/cartes/${corps.id}`)).status, 404);
});

test('signalements : masquage automatique au seuil, l’auteur seul la voit et peut la supprimer', async () => {
  const auteur = await editeur('auteur');
  const { corps: c } = await auteur.post('/api/cartes', carte('Trop loin'));
  const [r1, r2, r3, r4] = await Promise.all(['sig1', 'sig2', 'sig3', 'sig4'].map((n) => participant(n)));

  assert.equal((await auteur.post(`/api/cartes/${c.id}/signalements`, { motif: 'autre' })).status, 400);
  assert.equal((await r1.post(`/api/cartes/${c.id}/signalements`, { motif: 'inconnu' })).status, 400);

  assert.equal((await r1.post(`/api/cartes/${c.id}/signalements`, { motif: 'trop-loin' })).corps.masquee, false);
  assert.equal((await r1.post(`/api/cartes/${c.id}/signalements`, { motif: 'trop-loin' })).status, 409);
  assert.equal((await r2.post(`/api/cartes/${c.id}/signalements`, { motif: 'discrimination' })).corps.masquee, false);
  const troisieme = await r3.post(`/api/cartes/${c.id}/signalements`, { motif: 'trop-loin', commentaire: 'Non.' });
  assert.equal(troisieme.corps.masquee, true);

  assert.equal((await r4.get(`/api/cartes/${c.id}`)).status, 404);
  assert.ok(!(await r4.get('/api/cartes')).corps.some((x) => x.id === c.id));
  assert.equal((await r4.post(`/api/cartes/${c.id}/signalements`, { motif: 'autre' })).status, 404);

  const masquee = (await auteur.get('/api/cartes/miennes')).corps.cartes.find((x) => x.id === c.id);
  assert.equal(masquee.statut, 'masquee');
  assert.equal(masquee.masqueePar, 'auto');
  assert.deepEqual(masquee.signalements, { total: 3, motifs: { 'trop-loin': 2, discrimination: 1 } });
  assert.equal((await auteur.put(`/api/cartes/${c.id}`, carte('Corrigée'))).status, 409);
  assert.equal((await auteur.del(`/api/cartes/${c.id}`)).status, 200);
});

test('organisateurs : traiter les signalements (masquer, classer, supprimer) et exporter', async () => {
  const auteur = await editeur('auteur2');
  const { corps: c } = await auteur.post('/api/cartes', carte('Victime de spam'));
  const { corps: c2 } = await auteur.post('/api/cartes', carte('Vraiment limite'));
  const rapporteurs = await Promise.all(['spam1', 'spam2', 'spam3', 'spam4'].map((n) => participant(n)));
  for (const r of rapporteurs.slice(0, 3)) await r.post(`/api/cartes/${c.id}/signalements`, { motif: 'autre' });
  await rapporteurs[0].post(`/api/cartes/${c2.id}/signalements`, { motif: 'trop-loin', commentaire: 'Blessant.' });

  const liste = await admin.get('/api/admin/signalements');
  assert.equal(liste.status, 200);
  const entree = liste.corps.cartes.find((x) => x.id === c.id);
  assert.equal(entree.statut, 'masquee');
  assert.equal(entree.signalements.length, 3);
  assert.equal(entree.signalements[0].nomPar, 'Prénom spam1');
  assert.ok(liste.corps.cartes.some((x) => x.id === c2.id && x.statut === 'visible'));
  assert.equal((await admin.get('/api/admin/resume')).corps.aTraiter >= 2, true);

  // L'organisateur voit les cartes sans avoir signé de certificat ; pour en créer, il doit signer
  assert.equal((await admin.get(`/api/cartes/${c.id}`)).status, 200);
  assert.equal((await admin.post('/api/cartes', carte('Carte orga'))).status, 403);
  assert.equal((await admin.post('/api/certificat', { accords: CLAUSES.map((x) => x.id) })).status, 201);
  const carteOrga = await admin.post('/api/cartes', carte('Carte orga'));
  assert.equal(carteOrga.status, 201);
  assert.equal((await admin.del(`/api/cartes/${carteOrga.corps.id}`)).status, 200);

  // Masquage manuel d'une carte sous le seuil
  assert.equal((await admin.post(`/api/admin/cartes/${c2.id}/masquer`)).status, 200);
  assert.equal((await rapporteurs[3].get(`/api/cartes/${c2.id}`)).status, 404);
  const vueAuteur = (await auteur.get('/api/cartes/miennes')).corps.cartes.find((x) => x.id === c2.id);
  assert.equal(vueAuteur.masqueePar, 'organisation');

  // Classer les signalements d'une carte victime d'abus
  assert.equal((await admin.post(`/api/admin/cartes/${c.id}/retablir`)).status, 200);
  assert.equal((await rapporteurs[3].get(`/api/cartes/${c.id}`)).status, 200);
  assert.equal((await rapporteurs[0].post(`/api/cartes/${c.id}/signalements`, { motif: 'autre' })).status, 409);
  assert.equal((await rapporteurs[3].post(`/api/cartes/${c.id}/signalements`, { motif: 'autre' })).corps.masquee, false);

  const toutes = (await admin.get('/api/admin/cartes')).corps;
  assert.ok(toutes.some((x) => x.id === c2.id && x.statut === 'masquee'));

  const exp = await admin.get('/api/admin/export');
  assert.equal(exp.status, 200);
  assert.ok(exp.corps.cartes.some((x) => x.id === c.id));
  assert.ok(!exp.corps.cartes.some((x) => x.id === c2.id));
  assert.ok(exp.corps.cartes.every((x) => !('estAMoi' in x)));

  assert.equal((await admin.del(`/api/admin/cartes/${c2.id}`)).status, 200);
  assert.equal((await auteur.get('/api/cartes/miennes')).corps.cartes.some((x) => x.id === c2.id), false);
});

test('organisateurs : mot de passe oublié, correction du nom, suppression de compte', async () => {
  const oublieux = await editeur('oublieux');
  const { corps: carteOubli } = await oublieux.post('/api/cartes', carte('Carte de l’oublieux'));
  const id = await idDe('oublieux');

  const reinit = await admin.post(`/api/admin/comptes/${id}/mot-de-passe`);
  assert.equal(reinit.status, 200);
  assert.equal((await oublieux.get('/api/cartes')).status, 401); // déconnecté partout
  const c = client();
  assert.equal((await c.post('/api/connexion', { identifiant: 'oublieux', motDePasse: 'motdepasse1' })).status, 401);
  assert.equal((await c.post('/api/connexion', { identifiant: 'oublieux', motDePasse: reinit.corps.motDePasse })).status, 200);
  assert.equal((await c.get('/api/etat')).corps.utilisateur.doitChangerMdp, true);
  assert.equal((await admin.post(`/api/admin/comptes/${await idDe('admin')}/mot-de-passe`)).status, 400);

  assert.equal((await admin.patch(`/api/admin/comptes/${id}`, { nomComplet: 'Oscar Oublieux' })).status, 200);
  const temoin = await participant('temoin');
  assert.ok((await temoin.get('/api/registre')).corps.some((s) => s.nomComplet === 'Oscar Oublieux'));
  assert.equal((await admin.patch(`/api/admin/comptes/${id}`, { nomComplet: 'Prénom temoin' })).status, 409);

  assert.equal((await admin.del(`/api/admin/comptes/${id}`)).status, 200);
  assert.equal((await temoin.get(`/api/cartes/${carteOubli.id}`)).status, 404);
  assert.equal((await admin.del(`/api/admin/comptes/${await idDe('admin')}`)).status, 400);
});

test('rôles : un participant promu éditeur peut créer des cartes, et inversement', async () => {
  const c = await participant('promu');
  assert.equal((await c.post('/api/cartes', carte('Pas encore'))).status, 403);
  const id = await idDe('promu');
  assert.equal((await admin.patch(`/api/admin/comptes/${id}/role`, { role: 'editeur' })).status, 200);
  const creee = await c.post('/api/cartes', carte('Enfin'));
  assert.equal(creee.status, 201);
  assert.equal((await c.get('/api/etat')).corps.utilisateur.estEditeur, true);
  assert.equal((await admin.patch(`/api/admin/comptes/${id}/role`, { role: 'participant' })).status, 200);
  assert.equal((await c.put(`/api/cartes/${creee.corps.id}`, carte('Encore'))).status, 403);
  assert.equal((await admin.patch(`/api/admin/comptes/${id}/role`, { role: 'inconnu' })).status, 400);
  assert.equal((await admin.patch(`/api/admin/comptes/${await idDe('admin')}/role`, { role: 'participant' })).status, 400);
});

test('migration : une base de l’ancienne version accepte le rôle éditeur', () => {
  const chemin = join(tmpdir(), `as-de-salon-migration-${process.pid}-${Date.now()}.sqlite`);
  const ancienne = new DatabaseSync(chemin);
  ancienne.exec(`CREATE TABLE utilisateurs (
    id INTEGER PRIMARY KEY, identifiant TEXT NOT NULL UNIQUE COLLATE NOCASE, hash TEXT NOT NULL,
    nom_complet TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('participant', 'admin')),
    doit_changer_mdp INTEGER NOT NULL DEFAULT 1, derniere_connexion TEXT, cree_le TEXT NOT NULL)`);
  ancienne.prepare(`INSERT INTO utilisateurs (identifiant, hash, nom_complet, role, cree_le) VALUES ('ancien', 'x', 'Ancien Compte', 'admin', 'd')`).run();
  ancienne.exec(`CREATE TABLE cartes (id INTEGER PRIMARY KEY, auteur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    nom TEXT NOT NULL, sous_titre TEXT NOT NULL DEFAULT '', filiere TEXT NOT NULL, pv INTEGER NOT NULL, description TEXT NOT NULL DEFAULT '',
    attaques TEXT NOT NULL, image BLOB, image_type TEXT, image_x REAL NOT NULL DEFAULT 50, image_y REAL NOT NULL DEFAULT 50,
    image_zoom REAL NOT NULL DEFAULT 1, statut TEXT NOT NULL DEFAULT 'visible', cree_le TEXT NOT NULL, modifie_le TEXT NOT NULL)`);
  ancienne.prepare(`INSERT INTO cartes (auteur_id, nom, filiere, pv, attaques, cree_le, modifie_le) VALUES (1, 'Vieille', 'tesa', 80, '[]', 'd', 'd')`).run();
  ancienne.close();

  const migree = ouvrirBase(chemin);
  assert.equal(migree.prepare(`SELECT role FROM utilisateurs WHERE identifiant = 'ancien'`).get().role, 'admin');
  assert.equal(migree.prepare('SELECT COUNT(*) AS n FROM cartes').get().n, 1);
  migree.prepare(`INSERT INTO utilisateurs (identifiant, hash, role, cree_le) VALUES ('nouveau', 'x', 'editeur', 'd')`).run();
  assert.equal(migree.prepare(`SELECT role FROM utilisateurs WHERE identifiant = 'nouveau'`).get().role, 'editeur');
  migree.close();
  rmSync(chemin, { force: true });
});

test('sauvegarde complète : réservée aux organisateurs, fichier SQLite valide', async () => {
  const curieux = await participant('curieux3');
  assert.equal((await curieux.get('/api/admin/sauvegarde')).status, 403);
  const r = await admin.get('/api/admin/sauvegarde');
  assert.equal(r.status, 200);
  const octets = Buffer.from(r.corps);
  assert.equal(octets.subarray(0, 15).toString(), 'SQLite format 3');
  assert.ok((await admin.get('/api/admin/resume')).corps.derniereSauvegarde);
  const chemin = join(tmpdir(), `as-de-salon-sauvegarde-${process.pid}.sqlite`);
  writeFileSync(chemin, octets);
  const copie = new DatabaseSync(chemin);
  assert.ok(copie.prepare(`SELECT COUNT(*) AS n FROM utilisateurs WHERE identifiant = 'curieux3'`).get().n === 1);
  copie.close();
  rmSync(chemin, { force: true });
});

test('relecture : une carte n’est publiée qu’après validation par un autre éditeur', async () => {
  assert.equal((await admin.put('/api/admin/parametres', { seuilSignalements: 3, relecture: true })).status, 200);
  const auteur = await editeur('relu');
  const collegue = await editeur('relecteur');
  const lecteur = await participant('lecteur');
  const { corps: c } = await auteur.post('/api/cartes', carte('À relire'));
  assert.equal(c.enRelecture, true);
  // Invisible des participants, visible des éditeurs avec son statut
  assert.equal((await lecteur.get(`/api/cartes/${c.id}`)).status, 404);
  assert.ok(!(await lecteur.get('/api/cartes')).corps.some((x) => x.id === c.id));
  assert.ok((await collegue.get('/api/cartes')).corps.some((x) => x.id === c.id && x.enRelecture));
  assert.equal((await lecteur.post(`/api/cartes/${c.id}/signalements`, { motif: 'autre' })).status, 404);
  // L'auteur ne peut pas se valider lui-même, un collègue si
  assert.equal((await auteur.post(`/api/cartes/${c.id}/valider`)).status, 403);
  assert.equal((await lecteur.post(`/api/cartes/${c.id}/valider`)).status, 403);
  const validee = await collegue.post(`/api/cartes/${c.id}/valider`);
  assert.equal(validee.status, 200);
  assert.equal(validee.corps.enRelecture, false);
  assert.equal((await lecteur.get(`/api/cartes/${c.id}`)).status, 200);
  assert.equal((await collegue.post(`/api/cartes/${c.id}/valider`)).status, 409);
  // Une modification repasse en relecture ; l'organisateur peut valider n'importe quelle carte
  assert.equal((await auteur.put(`/api/cartes/${c.id}`, carte('À relire encore'))).corps.enRelecture, true);
  assert.equal((await admin.post(`/api/cartes/${c.id}/valider`)).status, 200);
  // Duplication : copie à mon nom, en relecture
  const copie = await collegue.post(`/api/cartes/${c.id}/dupliquer`);
  assert.equal(copie.status, 201);
  assert.equal(copie.corps.nom, 'À relire encore (copie)');
  assert.equal(copie.corps.auteur, 'relecteur');
  assert.equal(copie.corps.enRelecture, true);
  assert.equal((await lecteur.post(`/api/cartes/${c.id}/dupliquer`)).status, 403);
  // Désactiver la relecture publie les brouillons en attente
  assert.equal((await admin.put('/api/admin/parametres', { seuilSignalements: 3, relecture: false })).status, 200);
  assert.equal((await lecteur.get(`/api/cartes/${copie.corps.id}`)).status, 200);
  // Le journal garde la trace
  const journal = (await admin.get('/api/admin/journal')).corps;
  assert.ok(journal.some((l) => l.action === 'carte.validee' && l.acteur === 'relecteur'));
  assert.ok(journal.some((l) => l.action === 'parametres'));
  assert.equal((await lecteur.get('/api/admin/journal')).status, 403);
});

test('le dernier organisateur ne peut pas supprimer son compte, et le compte admin n’est créé qu’une fois', async () => {
  assert.equal((await admin.del('/api/moi', { motDePasse: 'admin-definitif' })).status, 409);
  const deuxieme = await assurerAdmin(db, { identifiant: 'autre-admin' });
  assert.equal(deuxieme.cree, false);
  assert.equal(deuxieme.identifiant, 'admin');
});

test('paramètres de campagne modifiables par les organisateurs et conservés en base', async () => {
  assert.equal((await admin.put('/api/admin/parametres', { seuilSignalements: 3, campagneDebut: FIN, campagneFin: DEBUT })).status, 400);
  assert.equal((await admin.put('/api/admin/parametres', { seuilSignalements: 0 })).status, 400);

  // Abaisser le seuil masque aussitôt les cartes qui l'atteignent
  const auteur = await editeur('auteur3');
  const { corps: c } = await auteur.post('/api/cartes', carte('Une seule plainte'));
  await (await participant('plaignant')).post(`/api/cartes/${c.id}/signalements`, { motif: 'autre' });
  const r = await admin.put('/api/admin/parametres', {
    promo: 'Promo Test',
    campagneDebut: DEBUT.toISOString(),
    campagneFin: FIN.toISOString(),
    seuilSignalements: 1,
  });
  assert.equal(r.status, 200);
  assert.ok(r.corps.masquees >= 1);
  assert.equal((await auteur.get('/api/cartes/miennes')).corps.cartes.find((x) => x.id === c.id).statut, 'masquee');
  const etat = (await auteur.get('/api/etat')).corps;
  assert.equal(etat.promo, 'Promo Test');
  assert.equal(etat.seuilSignalements, 1);

  // Un redémarrage (nouvelle app sur la même base) retrouve les réglages
  const config = lireConfig({ ...ENV, PROMO: 'Valeur du .env' });
  creerApp({ db, config, maintenant: () => horloge });
  assert.equal(config.promo, 'Promo Test');
  assert.equal(config.seuilSignalements, 1);

  assert.equal((await admin.put('/api/admin/parametres', { promo: '', campagneDebut: DEBUT, campagneFin: FIN, seuilSignalements: 3, relecture: false })).status, 200);
});

test('personnalisation des textes : réservée aux organisateurs, validée, conservée en base', async () => {
  const curieux = await participant('curieux2');
  assert.equal((await curieux.get('/api/admin/personnalisation')).status, 403);
  assert.equal((await curieux.put('/api/admin/personnalisation', { valeurs: { annonce: 'Piraté' } })).status, 403);

  const { corps } = await admin.get('/api/admin/personnalisation');
  assert.equal(corps.valeurs.nomJeu, 'Les As de Salon');
  assert.equal(corps.defauts.annonce, '');

  assert.equal((await admin.put('/api/admin/personnalisation', { valeurs: { inconnu: 'x' } })).status, 400);
  assert.equal((await admin.put('/api/admin/personnalisation', { valeurs: { nomJeu: '   ' } })).status, 400);
  assert.equal((await admin.put('/api/admin/personnalisation', { valeurs: { annonce: 'x'.repeat(201) } })).status, 400);
  // Tout ou rien : la valeur valide du même envoi n'est pas enregistrée
  assert.equal((await admin.put('/api/admin/personnalisation', { valeurs: { slogan: 'Nouveau', nomJeu: '' } })).status, 400);
  assert.equal((await curieux.get('/api/etat')).corps.textes.slogan, 'Jeu de cartes de cohésion');

  const r = await admin.put('/api/admin/personnalisation', {
    valeurs: {
      nomJeu: 'Les As de la Promo',
      annonce: 'Clôture **dimanche**\nà 20 h',
      'regles.sectionTexte': 'Ligne 1\r\nLigne 2\u0007',
      'accueil.surtitre': 'Salon-de-Provence · Phase 1',
    },
  });
  assert.equal(r.status, 200);
  const etat = (await curieux.get('/api/etat')).corps;
  assert.equal(etat.nomJeu, 'Les As de la Promo');
  assert.equal(etat.textes.annonce, 'Clôture **dimanche** à 20 h');
  assert.equal(etat.textes['regles.sectionTexte'], 'Ligne 1\nLigne 2');
  // Une valeur identique à l'origine n'est pas stockée
  const stockees = db.prepare('SELECT cle FROM textes').all().map((l) => l.cle).sort();
  assert.deepEqual(stockees, ['annonce', 'nomJeu', 'regles.sectionTexte']);

  // Conservé après redémarrage
  const config = lireConfig(ENV);
  creerApp({ db, config, maintenant: () => horloge });
  assert.equal(config.textes.nomJeu, 'Les As de la Promo');

  // Retour au texte d'origine
  assert.equal((await admin.put('/api/admin/personnalisation', { valeurs: { nomJeu: 'Les As de Salon', annonce: '', 'regles.sectionTexte': '' } })).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM textes').get().n, 0);
  assert.equal((await curieux.get('/api/etat')).corps.nomJeu, 'Les As de Salon');
});

test('dates de campagne : création fermée avant et après, suppression toujours possible', async () => {
  const c = await editeur('horloge');
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
  const c = await editeur('prudent');
  const etranger = await c.post('/api/cartes', carte(), { origin: 'https://site-malveillant.example' });
  assert.equal(etranger.status, 403);
  const r = await fetch(`${base}/api/connexion`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'identifiant=prudent&motDePasse=motdepasse1',
  });
  assert.equal(r.status, 415);
});

test('protection CSRF derrière un hébergeur : l’adresse publique annoncée par le proxy est acceptée', async () => {
  const c = await editeur('derriere-proxy');
  const viaProxy = await c.post('/api/cartes', carte('Via le proxy'), {
    origin: 'https://as-de-salon.onrender.com',
    'x-forwarded-host': 'as-de-salon.onrender.com',
  });
  assert.equal(viaProxy.status, 201);
});

test('mode démonstration : comptes et cartes fictifs, jamais sur une base déjà remplie', async () => {
  assert.equal(await remplirDemo(db), null);

  const vide = ouvrirBase(':memory:');
  const demo = await remplirDemo(vide, { motDePasse: 'demo-demo' });
  assert.deepEqual(demo.identifiants, [
    'camille.martin (editeur)',
    'lea.bernard (editeur)',
    'ines.moreau (editeur)',
    'hugo.roux (participant)',
    'theo.garnier (participant)',
  ]);
  assert.equal(vide.prepare('SELECT COUNT(*) AS n FROM cartes').get().n, 6);
  assert.equal(vide.prepare('SELECT COUNT(*) AS n FROM certificats').get().n, 5);
  assert.equal(vide.prepare(`SELECT COUNT(*) AS n FROM utilisateurs WHERE doit_changer_mdp = 1`).get().n, 0);
  assert.equal(vide.prepare('SELECT COUNT(*) AS n FROM signalements').get().n, 1);
  // Un second démarrage n'ajoute rien
  assert.equal(await remplirDemo(vide), null);
  assert.equal(vide.prepare('SELECT COUNT(*) AS n FROM cartes').get().n, 6);
});

test('supprimer son compte retire ses cartes et son certificat', async () => {
  const c = await editeur('partant');
  const { corps } = await c.post('/api/cartes', carte('Dernière carte'));
  const temoin = await participant('temoin2');
  assert.equal((await c.del('/api/moi', { motDePasse: 'mauvais' })).status, 403);
  assert.equal((await c.del('/api/moi', { motDePasse: 'motdepasse1' })).status, 200);
  assert.equal((await temoin.get(`/api/cartes/${corps.id}`)).status, 404);
  assert.ok(!(await temoin.get('/api/registre')).corps.some((s) => s.identifiant === 'partant'));
  assert.equal((await c.get('/api/moi')).status, 401);
});
