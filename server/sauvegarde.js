import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { backup } from 'node:sqlite';

// Copie cohérente de la base (même pendant que le site tourne) dans un fichier .sqlite.
export async function copierBase(db, chemin) {
  rmSync(chemin, { force: true });
  await backup(db, chemin);
  return chemin;
}

const SAUVEGARDES_GARDEES = 7;

// Une copie par jour dans dossier/, les 7 dernières conservées.
export async function sauvegardeQuotidienne(db, dossier, maintenant = new Date()) {
  mkdirSync(dossier, { recursive: true });
  const nom = `sauvegarde-${maintenant.toISOString().slice(0, 10)}.sqlite`;
  const chemin = join(dossier, nom);
  await copierBase(db, chemin);
  const anciennes = readdirSync(dossier)
    .filter((f) => /^sauvegarde-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f))
    .sort()
    .reverse()
    .slice(SAUVEGARDES_GARDEES);
  for (const f of anciennes) rmSync(join(dossier, f), { force: true });
  return { chemin, taille: statSync(chemin).size };
}

// Lance la copie quotidienne : au démarrage, puis toutes les 24 h.
export function planifierSauvegardes(db, dossier, journal = console) {
  const executer = () =>
    sauvegardeQuotidienne(db, dossier)
      .then(({ chemin, taille }) => journal.log(`   Sauvegarde : ${chemin} (${Math.round(taille / 1024)} Ko)`))
      .catch((err) => journal.error('Sauvegarde impossible :', err.message));
  executer();
  const minuteur = setInterval(executer, 24 * 3600 * 1000);
  minuteur.unref();
  return minuteur;
}
