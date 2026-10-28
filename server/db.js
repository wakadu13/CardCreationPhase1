import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS utilisateurs (
  id INTEGER PRIMARY KEY,
  identifiant TEXT NOT NULL UNIQUE COLLATE NOCASE,
  hash TEXT NOT NULL,
  -- Nom saisi par les organisateurs à la création du compte
  nom_complet TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('participant', 'admin')),
  -- 1 tant que la personne n'a pas remplacé son mot de passe provisoire
  doit_changer_mdp INTEGER NOT NULL DEFAULT 1,
  derniere_connexion TEXT,
  cree_le TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  jeton_hash TEXT PRIMARY KEY,
  utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  expire_le INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS certificats (
  utilisateur_id INTEGER PRIMARY KEY REFERENCES utilisateurs(id) ON DELETE CASCADE,
  nom_complet TEXT NOT NULL,
  version TEXT NOT NULL,
  numero TEXT NOT NULL,
  signe_le TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cartes (
  id INTEGER PRIMARY KEY,
  auteur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  sous_titre TEXT NOT NULL DEFAULT '',
  filiere TEXT NOT NULL,
  pv INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  attaques TEXT NOT NULL,
  image BLOB,
  image_type TEXT,
  image_x REAL NOT NULL DEFAULT 50,
  image_y REAL NOT NULL DEFAULT 50,
  image_zoom REAL NOT NULL DEFAULT 1,
  statut TEXT NOT NULL DEFAULT 'visible' CHECK (statut IN ('visible', 'masquee')),
  -- 'auto' (seuil de signalements atteint) ou 'organisation'
  masquee_par TEXT,
  cree_le TEXT NOT NULL,
  modifie_le TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cartes_auteur ON cartes(auteur_id);

CREATE TABLE IF NOT EXISTS signalements (
  id INTEGER PRIMARY KEY,
  carte_id INTEGER NOT NULL REFERENCES cartes(id) ON DELETE CASCADE,
  auteur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  motif TEXT NOT NULL,
  commentaire TEXT NOT NULL DEFAULT '',
  -- 'actif' compte pour le masquage ; 'classe' = écarté par un organisateur
  statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'classe')),
  cree_le TEXT NOT NULL,
  UNIQUE (carte_id, auteur_id)
);
CREATE INDEX IF NOT EXISTS signalements_carte ON signalements(carte_id);

-- Réglages modifiables depuis l'espace organisateurs (dates de campagne, seuil…)
CREATE TABLE IF NOT EXISTS parametres (
  cle TEXT PRIMARY KEY,
  valeur TEXT
);

-- Textes du site personnalisés par les organisateurs (seulement ceux qui diffèrent de l'origine)
CREATE TABLE IF NOT EXISTS textes (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);
`;

// Ajoute les colonnes apparues après la première version à une base existante.
function migrer(db) {
  const colonnes = new Set(db.prepare('PRAGMA table_info(utilisateurs)').all().map((c) => c.name));
  const ajouts = [
    ['nom_complet', "TEXT NOT NULL DEFAULT ''"],
    ['role', "TEXT NOT NULL DEFAULT 'participant'"],
    ['doit_changer_mdp', 'INTEGER NOT NULL DEFAULT 0'],
    ['derniere_connexion', 'TEXT'],
  ];
  for (const [nom, definition] of ajouts) {
    if (!colonnes.has(nom)) db.exec(`ALTER TABLE utilisateurs ADD COLUMN ${nom} ${definition}`);
  }
  const colonnesCartes = new Set(db.prepare('PRAGMA table_info(cartes)').all().map((c) => c.name));
  if (!colonnesCartes.has('masquee_par')) db.exec('ALTER TABLE cartes ADD COLUMN masquee_par TEXT');
}

export function ouvrirBase(chemin) {
  if (chemin !== ':memory:') mkdirSync(dirname(chemin), { recursive: true });
  const db = new DatabaseSync(chemin);
  db.exec('PRAGMA foreign_keys = ON;');
  if (chemin !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrer(db);
  return db;
}

// Exécute fn dans une transaction (DatabaseSync est synchrone : pas d'entrelacement possible).
export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const resultat = fn();
    db.exec('COMMIT');
    return resultat;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
