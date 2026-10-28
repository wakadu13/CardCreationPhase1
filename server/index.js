import { existsSync } from 'node:fs';
import { creerApp } from './app.js';
import { assurerAdmin } from './comptes.js';
import { lireConfig, statutCampagne } from './config.js';
import { ouvrirBase } from './db.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const config = lireConfig();
const db = ouvrirBase(config.cheminBase);
const app = creerApp({ db, config });

// Premier démarrage : création du compte organisateur.
const admin = await assurerAdmin(db, { identifiant: config.adminIdentifiant, motDePasse: config.adminMotDePasse });

app.listen(config.port, () => {
  const fmt = (d) => (d ? d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : '—');
  console.log(`✈  ${config.nomJeu} — http://localhost:${config.port}`);
  console.log(`   Campagne : ${statutCampagne(config)} (début ${fmt(config.campagneDebut)}, fin ${fmt(config.campagneFin)})`);
  console.log(`   Base : ${config.cheminBase} · seuil de masquage : ${config.seuilSignalements} signalements`);
  if (admin.cree) {
    const lignes = [
      'Compte organisateur créé',
      `Identifiant : ${admin.identifiant}`,
      `Mot de passe provisoire : ${admin.motDePasse}`,
      'À changer à la première connexion.',
    ];
    const largeur = Math.max(...lignes.map((l) => l.length)) + 4;
    console.log(`\n   ┌${'─'.repeat(largeur)}┐`);
    for (const l of lignes) console.log(`   │  ${l.padEnd(largeur - 2)}│`);
    console.log(`   └${'─'.repeat(largeur)}┘`);
  }
});
