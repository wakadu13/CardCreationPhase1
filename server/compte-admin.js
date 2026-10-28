// Secours : crée le compte organisateur s'il n'existe pas, ou lui donne un nouveau mot de passe provisoire.
//   npm run compte-admin               → compte « admin » (ou ADMIN_IDENTIFIANT)
//   npm run compte-admin -- jdupont    → un autre compte organisateur existant
import { existsSync } from 'node:fs';
import { assurerAdmin, creerCompte, reinitialiserMotDePasse } from './comptes.js';
import { lireConfig } from './config.js';
import { ouvrirBase } from './db.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const config = lireConfig();
const db = ouvrirBase(config.cheminBase);
const identifiant = process.argv[2] || config.adminIdentifiant;

const compte = db.prepare('SELECT id, identifiant, role FROM utilisateurs WHERE identifiant = ?').get(identifiant);
let motDePasse;
if (!compte) {
  const aucunAdmin = !db.prepare(`SELECT 1 FROM utilisateurs WHERE role = 'admin'`).get();
  ({ motDePasse } = aucunAdmin
    ? await assurerAdmin(db, { identifiant })
    : await creerCompte(db, { identifiant, nomComplet: 'Organisation', role: 'admin' }));
  console.log(`Compte organisateur « ${identifiant} » créé.`);
} else if (compte.role !== 'admin') {
  console.error(`« ${identifiant} » est un compte participant, pas un compte organisateur.`);
  process.exit(1);
} else {
  motDePasse = await reinitialiserMotDePasse(db, compte.id);
  console.log(`Nouveau mot de passe pour « ${compte.identifiant} ».`);
}
console.log(`Mot de passe provisoire : ${motDePasse}`);
console.log('À changer à la première connexion.');
