import { Router } from 'express';
import { exigerAdmin } from '../auth.js';
import { ErreurClient } from '../erreurs.js';
import { lireImage } from './cartes.js';

// Logos affichés sur le site (en-tête, accueil, certificat), téléversés par les organisateurs.
export const LOGOS = [
  { cle: 'ema', nom: 'Logo EMA (École militaire de l’air)' },
  { cle: 'ecole', nom: 'Logo École de l’air et de l’espace' },
];

const cleValide = (cle) => LOGOS.some((l) => l.cle === cle);

export function urlsLogos(db) {
  const lignes = db.prepare('SELECT cle, modifie_le FROM logos').all();
  return Object.fromEntries(
    LOGOS.map((l) => {
      const ligne = lignes.find((x) => x.cle === l.cle);
      return [l.cle, ligne ? `/api/logos/${l.cle}?v=${encodeURIComponent(ligne.modifie_le)}` : null];
    }),
  );
}

export function routesLogos({ db, maintenant }) {
  const r = Router();

  // Public : les logos apparaissent avant la connexion.
  r.get('/logos/:cle', (req, res) => {
    const ligne = cleValide(req.params.cle) ? db.prepare('SELECT image, image_type FROM logos WHERE cle = ?').get(req.params.cle) : null;
    if (!ligne) throw new ErreurClient('Pas de logo.', 404);
    res.set('Content-Type', ligne.image_type);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(ligne.image));
  });

  r.put('/admin/logos/:cle', exigerAdmin, (req, res) => {
    if (!cleValide(req.params.cle)) throw new ErreurClient('Logo inconnu.', 404);
    const image = lireImage(req.body?.image);
    if (!image?.image) throw new ErreurClient('Choisis une image (PNG, JPEG ou WebP).');
    db.prepare(
      `INSERT INTO logos (cle, image, image_type, modifie_le) VALUES (?, ?, ?, ?)
       ON CONFLICT (cle) DO UPDATE SET image = excluded.image, image_type = excluded.image_type, modifie_le = excluded.modifie_le`,
    ).run(req.params.cle, image.image, image.type, maintenant().toISOString());
    res.json({ logos: urlsLogos(db) });
  });

  r.delete('/admin/logos/:cle', exigerAdmin, (req, res) => {
    if (!cleValide(req.params.cle)) throw new ErreurClient('Logo inconnu.', 404);
    db.prepare('DELETE FROM logos WHERE cle = ?').run(req.params.cle);
    res.json({ logos: urlsLogos(db) });
  });

  return r;
}
