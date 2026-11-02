// Historique des actions de l'organisation et des éditeurs (qui a fait quoi, quand).

export function journaliser(db, req, action, { cible = '', detail = '' } = {}, maintenant = new Date()) {
  db.prepare('INSERT INTO journal (date, acteur_id, acteur, action, cible, detail) VALUES (?, ?, ?, ?, ?, ?)').run(
    maintenant.toISOString(),
    req.utilisateur?.id ?? null,
    req.utilisateur?.identifiant ?? 'système',
    action,
    String(cible).slice(0, 120),
    String(detail).slice(0, 400),
  );
}

export function lireJournal(db, limite = 300) {
  return db
    .prepare('SELECT id, date, acteur, action, cible, detail FROM journal ORDER BY id DESC LIMIT ?')
    .all(limite);
}
