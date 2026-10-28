import { existsSync } from 'node:fs';
import { creerApp } from './app.js';
import { assurerAdmin } from './comptes.js';
import { lireConfig, statutCampagne } from './config.js';
import { ouvrirBase } from './db.js';
import { remplirDemo } from './demo.js';
import { textesEffectifs } from './textes.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const config = lireConfig();
const db = ouvrirBase(config.cheminBase);
const app = creerApp({ db, config });

// Premier démarrage : création du compte organisateur.
const admin = await assurerAdmin(db, { identifiant: config.adminIdentifiant, motDePasse: config.adminMotDePasse });
// Site de démonstration : un mot de passe choisi dans la configuration n'a pas à être changé à chaque redéploiement.
if (config.demo && admin.cree && config.adminMotDePasse) {
  db.prepare('UPDATE utilisateurs SET doit_changer_mdp = 0 WHERE identifiant = ?').run(admin.identifiant);
}
const demo = config.demo ? await remplirDemo(db, { motDePasse: config.demoMotDePasse }) : null;

function encadre(lignes) {
  const largeur = Math.max(...lignes.map((l) => l.length)) + 4;
  console.log(`\n   ┌${'─'.repeat(largeur)}┐`);
  for (const l of lignes) console.log(`   │  ${l.padEnd(largeur - 2)}│`);
  console.log(`   └${'─'.repeat(largeur)}┘`);
}

app.listen(config.port, () => {
  const fmt = (d) => (d ? d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : '—');
  console.log(`✈  ${textesEffectifs(config).nomJeu} — http://localhost:${config.port}${config.demo ? '  (démonstration)' : ''}`);
  console.log(`   Campagne : ${statutCampagne(config)} (début ${fmt(config.campagneDebut)}, fin ${fmt(config.campagneFin)})`);
  console.log(`   Base : ${config.cheminBase} · seuil de masquage : ${config.seuilSignalements} signalements`);
  if (admin.cree) {
    encadre([
      'Compte organisateur créé',
      `Identifiant : ${admin.identifiant}`,
      config.adminMotDePasse ? 'Mot de passe : celui de ADMIN_MOT_DE_PASSE' : `Mot de passe provisoire : ${admin.motDePasse}`,
      config.demo && config.adminMotDePasse ? 'Démonstration : pas de changement imposé.' : 'À changer à la première connexion.',
    ]);
  }
  if (demo) {
    encadre([
      'Démonstration : participants fictifs créés',
      `Identifiants : ${demo.identifiants.join(', ')}`,
      config.demoMotDePasse ? 'Mot de passe : celui de DEMO_MOT_DE_PASSE' : `Mot de passe (le même pour tous) : ${demo.motDePasse}`,
    ]);
  }
});
