import { existsSync } from 'node:fs';
import { creerApp } from './app.js';
import { lireConfig, statutCampagne } from './config.js';
import { ouvrirBase } from './db.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const config = lireConfig();

const db = ouvrirBase(config.cheminBase);
const app = creerApp({ db, config });

app.listen(config.port, () => {
  const fmt = (d) => (d ? d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : '—');
  console.log(`✈  ${config.nomJeu} — http://localhost:${config.port}`);
  console.log(`   Campagne : ${statutCampagne(config)} (début ${fmt(config.campagneDebut)}, fin ${fmt(config.campagneFin)})`);
  console.log(`   Base : ${config.cheminBase} · seuil de masquage : ${config.seuilSignalements} signalements`);
  if (config.admins.length) console.log(`   Organisateurs : ${config.admins.join(', ')}`);
});
