import { Router } from 'express';
import { exigerAdmin } from '../auth.js';
import { ErreurClient, idParam } from '../erreurs.js';
import { COLONNES, formaterCarte } from './cartes.js';

// Espace organisateurs (optionnel, activé via ADMINS).
// Personne ne trie les cartes : il sert seulement en cas d'abus (signalements en masse, contenu illégal)
// et pour exporter les cartes vers la phase 2.
export function routesAdmin({ db, config, maintenant }) {
  const r = Router();
  r.use('/admin', exigerAdmin);

  r.get('/admin/signalements', (req, res) => {
    const cartes = db
      .prepare(
        `SELECT ${COLONNES} FROM cartes c JOIN utilisateurs u ON u.id = c.auteur_id
         WHERE c.statut = 'masquee' OR EXISTS (SELECT 1 FROM signalements s WHERE s.carte_id = c.id AND s.statut = 'actif')
         ORDER BY c.statut DESC, c.id DESC`,
      )
      .all();
    const detail = db.prepare(
      `SELECT s.motif, s.commentaire, s.cree_le, u.identifiant AS par
       FROM signalements s JOIN utilisateurs u ON u.id = s.auteur_id
       WHERE s.carte_id = ? AND s.statut = 'actif' ORDER BY s.id`,
    );
    res.json({
      seuil: config.seuilSignalements,
      cartes: cartes.map((l) =>
        formaterCarte(l, req.utilisateur.id, {
          signalements: detail.all(l.id).map((s) => ({ motif: s.motif, commentaire: s.commentaire, le: s.cree_le, par: s.par })),
        }),
      ),
    });
  });

  // Écarte les signalements actuels (abus) et réaffiche la carte.
  // Les personnes qui ont déjà signalé ne peuvent pas la re-signaler.
  r.post('/admin/cartes/:id/retablir', (req, res) => {
    const id = idParam(req);
    if (!db.prepare('SELECT 1 FROM cartes WHERE id = ?').get(id)) throw new ErreurClient('Carte introuvable.', 404);
    db.prepare(`UPDATE signalements SET statut = 'classe' WHERE carte_id = ?`).run(id);
    db.prepare(`UPDATE cartes SET statut = 'visible' WHERE id = ?`).run(id);
    res.json({ ok: true });
  });

  r.delete('/admin/cartes/:id', (req, res) => {
    const id = idParam(req);
    const { changes } = db.prepare('DELETE FROM cartes WHERE id = ?').run(id);
    if (!changes) throw new ErreurClient('Carte introuvable.', 404);
    res.json({ ok: true });
  });

  // Export JSON des cartes visibles (images incluses) pour préparer la phase 2.
  r.get('/admin/export', (_req, res) => {
    const lignes = db
      .prepare(
        `SELECT ${COLONNES}, c.image, c.image_type FROM cartes c JOIN utilisateurs u ON u.id = c.auteur_id
         WHERE c.statut = 'visible' ORDER BY c.id`,
      )
      .all();
    const cartes = lignes.map((l) => {
      const { estAMoi, image, ...carte } = formaterCarte(l, null);
      return {
        ...carte,
        image: l.image ? `data:${l.image_type};base64,${Buffer.from(l.image).toString('base64')}` : null,
      };
    });
    const date = maintenant().toISOString();
    res.set('Content-Disposition', `attachment; filename="cartes-phase1-${date.slice(0, 10)}.json"`);
    res.json({ exporteLe: date, nombre: cartes.length, cartes });
  });

  return r;
}
