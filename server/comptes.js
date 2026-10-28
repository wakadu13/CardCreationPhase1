import { randomInt } from 'node:crypto';
import { hacherMotDePasse } from './auth.js';

// Mot de passe provisoire lisible à l'oral ou sur papier (sans 0/O, 1/l/I) : « k7mp-3qxt-9r ».
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function genererMotDePasse() {
  const c = () => ALPHABET[randomInt(ALPHABET.length)];
  const bloc = (n) => Array.from({ length: n }, c).join('');
  return `${bloc(4)}-${bloc(4)}-${bloc(2)}`;
}

export const IDENTIFIANT = /^[A-Za-z0-9._-]{3,24}$/;

// « Camille Le Gall » → « camille.le.gall »
export function identifiantDepuisNom(nomComplet) {
  const base = String(nomComplet)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 24)
    .replace(/\.+$/, '');
  return base.length >= 3 ? base : `${base || 'participant'}`.padEnd(3, '0');
}

// Ajoute 2, 3… si l'identifiant est déjà pris (en base ou dans le lot en cours).
export function identifiantLibre(db, souhaite, reserves = new Set()) {
  const pris = (id) => reserves.has(id.toLowerCase()) || db.prepare('SELECT 1 FROM utilisateurs WHERE identifiant = ?').get(id);
  if (!pris(souhaite)) return souhaite;
  for (let n = 2; ; n++) {
    const suffixe = String(n);
    const candidat = souhaite.slice(0, 24 - suffixe.length) + suffixe;
    if (!pris(candidat)) return candidat;
  }
}

export async function creerCompte(db, { identifiant, nomComplet, role = 'participant', motDePasse, maintenant = new Date() }) {
  const mdp = motDePasse ?? genererMotDePasse();
  const id = db
    .prepare(
      `INSERT INTO utilisateurs (identifiant, hash, nom_complet, role, doit_changer_mdp, cree_le)
       VALUES (?, ?, ?, ?, 1, ?)`,
    )
    .run(identifiant, await hacherMotDePasse(mdp), nomComplet, role, maintenant.toISOString()).lastInsertRowid;
  return { id: Number(id), identifiant, nomComplet, role, motDePasse: mdp };
}

// Donne un nouveau mot de passe provisoire et déconnecte le compte partout.
export async function reinitialiserMotDePasse(db, id) {
  const mdp = genererMotDePasse();
  db.prepare('UPDATE utilisateurs SET hash = ?, doit_changer_mdp = 1 WHERE id = ?').run(await hacherMotDePasse(mdp), id);
  db.prepare('DELETE FROM sessions WHERE utilisateur_id = ?').run(id);
  return mdp;
}

// Garantit qu'un compte organisateur existe. Au premier démarrage, il est créé avec un mot de passe
// provisoire (ADMIN_MOT_DE_PASSE ou généré) qu'il faudra changer à la première connexion.
export async function assurerAdmin(db, { identifiant = 'admin', motDePasse } = {}) {
  const existant = db.prepare(`SELECT identifiant FROM utilisateurs WHERE role = 'admin' LIMIT 1`).get();
  if (existant) return { cree: false, identifiant: existant.identifiant };
  const libre = identifiantLibre(db, identifiant);
  const compte = await creerCompte(db, { identifiant: libre, nomComplet: 'Organisation', role: 'admin', motDePasse });
  return { cree: true, identifiant: compte.identifiant, motDePasse: compte.motDePasse };
}
