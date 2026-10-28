import { Router } from 'express';
import { FILIERES, LIMITE_CARTES, MOTIFS_SIGNALEMENT, validerCarte } from '../../shared/regles.js';
import { exigerCertificat, exigerLecture } from '../auth.js';
import { statutCampagne } from '../config.js';
import { transaction } from '../db.js';
import { ErreurClient, idParam } from '../erreurs.js';

export const COLONNES = `c.id, c.auteur_id, c.nom, c.sous_titre, c.filiere, c.pv, c.description, c.attaques,
  c.image IS NOT NULL AS a_image, c.image_x, c.image_y, c.image_zoom, c.statut, c.masquee_par, c.cree_le, c.modifie_le,
  u.identifiant AS auteur`;

export function formaterCarte(l, viewerId, extra = {}) {
  return {
    id: l.id,
    nom: l.nom,
    sousTitre: l.sous_titre,
    filiere: l.filiere,
    pv: l.pv,
    description: l.description,
    attaques: JSON.parse(l.attaques),
    image: l.a_image ? `/api/cartes/${l.id}/image?v=${encodeURIComponent(l.modifie_le)}` : null,
    imageX: l.image_x,
    imageY: l.image_y,
    imageZoom: l.image_zoom,
    auteur: l.auteur,
    estAMoi: l.auteur_id === viewerId,
    statut: l.statut,
    masqueePar: l.statut === 'masquee' ? (l.masquee_par ?? 'auto') : null,
    creeLe: l.cree_le,
    modifieLe: l.modifie_le,
    ...extra,
  };
}

const SIGNATURES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};
const TAILLE_MAX_IMAGE = 1_500_000;

// undefined → ne pas toucher ; null → supprimer ; data URL → remplacer.
export function lireImage(valeur) {
  if (valeur === undefined) return null;
  if (valeur === null || valeur === '') return { image: null, type: null };
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(valeur));
  if (!m) throw new ErreurClient('Format d’image non pris en charge (JPEG, PNG ou WebP).');
  const image = Buffer.from(m[2], 'base64');
  if (image.length > TAILLE_MAX_IMAGE) throw new ErreurClient('Image trop lourde (1,5 Mo maximum).', 413);
  if (!SIGNATURES[m[1]](image)) throw new ErreurClient('Le fichier ne correspond pas à une image valide.');
  return { image, type: m[1] };
}

export function routesCartes({ db, config, maintenant }) {
  const r = Router();
  // Lecture : participants ayant signé le certificat, et organisateurs. Écriture : participants seulement.

  const lireCarte = db.prepare(`SELECT ${COLONNES} FROM cartes c JOIN utilisateurs u ON u.id = c.auteur_id WHERE c.id = ?`);
  const compterCartes = db.prepare('SELECT COUNT(*) AS n FROM cartes WHERE auteur_id = ?');
  const motifsActifs = db.prepare(
    `SELECT motif, COUNT(*) AS n FROM signalements WHERE carte_id = ? AND statut = 'actif' GROUP BY motif`,
  );
  const dejaSignalee = db.prepare('SELECT 1 FROM signalements WHERE carte_id = ? AND auteur_id = ?');

  function resumeSignalements(carteId) {
    const motifs = motifsActifs.all(carteId);
    return { total: motifs.reduce((s, m) => s + m.n, 0), motifs: Object.fromEntries(motifs.map((m) => [m.motif, m.n])) };
  }

  function exigerCampagneOuverte() {
    const statut = statutCampagne(config, maintenant());
    if (statut === 'a-venir') throw new ErreurClient('La campagne de création n’a pas encore commencé.', 403);
    if (statut === 'terminee') throw new ErreurClient('La campagne de création est terminée.', 403);
  }

  // Carte lisible par l'utilisateur : visible, ou bien la sienne, ou bien vue par un organisateur.
  function carteAccessible(req) {
    const ligne = lireCarte.get(idParam(req));
    if (!ligne) throw new ErreurClient('Carte introuvable.', 404);
    const autorise = ligne.statut === 'visible' || ligne.auteur_id === req.utilisateur.id || req.utilisateur.estAdmin;
    if (!autorise) throw new ErreurClient('Carte introuvable.', 404);
    return ligne;
  }

  function cartePerso(req) {
    const ligne = lireCarte.get(idParam(req));
    if (!ligne || ligne.auteur_id !== req.utilisateur.id) throw new ErreurClient('Carte introuvable.', 404);
    return ligne;
  }

  function preparer(body) {
    const { ok, erreurs, carte, cout } = validerCarte(body);
    if (!ok) throw new ErreurClient(erreurs[0], 400, { erreurs });
    if (body.confirmeSignataires !== true) {
      throw new ErreurClient('Confirme que les personnes représentées ont signé le certificat.', 400);
    }
    return { carte, cout, image: lireImage(body.image) };
  }

  // Galerie : toutes les cartes visibles, plus les miennes (même masquées).
  r.get('/cartes', exigerLecture, (req, res) => {
    const lignes = db
      .prepare(
        `SELECT ${COLONNES}, EXISTS (SELECT 1 FROM signalements s WHERE s.carte_id = c.id AND s.auteur_id = ?) AS signalee
         FROM cartes c JOIN utilisateurs u ON u.id = c.auteur_id
         WHERE c.statut = 'visible' OR c.auteur_id = ?
         ORDER BY c.id DESC`,
      )
      .all(req.utilisateur.id, req.utilisateur.id);
    res.json(lignes.map((l) => formaterCarte(l, req.utilisateur.id, { signaleeParMoi: Boolean(l.signalee) })));
  });

  r.get('/cartes/miennes', exigerCertificat, (req, res) => {
    const lignes = db
      .prepare(`SELECT ${COLONNES} FROM cartes c JOIN utilisateurs u ON u.id = c.auteur_id WHERE c.auteur_id = ? ORDER BY c.id`)
      .all(req.utilisateur.id);
    res.json({
      limite: LIMITE_CARTES,
      cartes: lignes.map((l) => formaterCarte(l, req.utilisateur.id, { signalements: resumeSignalements(l.id) })),
    });
  });

  r.get('/cartes/:id', exigerLecture, (req, res) => {
    const l = carteAccessible(req);
    const extra = { signaleeParMoi: Boolean(dejaSignalee.get(l.id, req.utilisateur.id)) };
    if (l.auteur_id === req.utilisateur.id) extra.signalements = resumeSignalements(l.id);
    res.json(formaterCarte(l, req.utilisateur.id, extra));
  });

  r.get('/cartes/:id/image', exigerLecture, (req, res) => {
    const l = carteAccessible(req);
    const img = db.prepare('SELECT image, image_type FROM cartes WHERE id = ?').get(l.id);
    if (!img?.image) throw new ErreurClient('Pas d’image.', 404);
    res.set('Content-Type', img.image_type);
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(Buffer.from(img.image));
  });

  r.post('/cartes', exigerCertificat, (req, res) => {
    exigerCampagneOuverte();
    const { carte, image } = preparer(req.body ?? {});
    const date = maintenant().toISOString();
    const id = transaction(db, () => {
      if (compterCartes.get(req.utilisateur.id).n >= LIMITE_CARTES) {
        throw new ErreurClient(`Tu as déjà ${LIMITE_CARTES} cartes : c’est le maximum pour cette phase.`, 409);
      }
      return db
        .prepare(
          `INSERT INTO cartes (auteur_id, nom, sous_titre, filiere, pv, description, attaques, image, image_type,
             image_x, image_y, image_zoom, cree_le, modifie_le)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          req.utilisateur.id,
          carte.nom,
          carte.sousTitre,
          carte.filiere,
          carte.pv,
          carte.description,
          JSON.stringify(carte.attaques),
          image?.image ?? null,
          image?.type ?? null,
          carte.imageX,
          carte.imageY,
          carte.imageZoom,
          date,
          date,
        ).lastInsertRowid;
    });
    res.status(201).json(formaterCarte(lireCarte.get(Number(id)), req.utilisateur.id));
  });

  r.put('/cartes/:id', exigerCertificat, (req, res) => {
    exigerCampagneOuverte();
    const actuelle = cartePerso(req);
    if (actuelle.statut === 'masquee') {
      throw new ErreurClient('Cette carte a été masquée : tu peux seulement la supprimer.', 409);
    }
    const { carte, image } = preparer(req.body ?? {});
    // Horodatage strictement croissant : il sert aussi de version pour le cache de l'image.
    const date = new Date(Math.max(maintenant().getTime(), Date.parse(actuelle.modifie_le) + 1)).toISOString();
    db.prepare(
      `UPDATE cartes SET nom = ?, sous_titre = ?, filiere = ?, pv = ?, description = ?, attaques = ?,
         image_x = ?, image_y = ?, image_zoom = ?, modifie_le = ? WHERE id = ?`,
    ).run(
      carte.nom,
      carte.sousTitre,
      carte.filiere,
      carte.pv,
      carte.description,
      JSON.stringify(carte.attaques),
      carte.imageX,
      carte.imageY,
      carte.imageZoom,
      date,
      actuelle.id,
    );
    if (image) db.prepare('UPDATE cartes SET image = ?, image_type = ? WHERE id = ?').run(image.image, image.type, actuelle.id);
    res.json(formaterCarte(lireCarte.get(actuelle.id), req.utilisateur.id));
  });

  // Supprimer reste possible après la campagne : c'est le droit de retrait de l'auteur.
  r.delete('/cartes/:id', exigerCertificat, (req, res) => {
    const carte = cartePerso(req);
    db.prepare('DELETE FROM cartes WHERE id = ?').run(carte.id);
    res.json({ ok: true });
  });

  r.post('/cartes/:id/signalements', exigerCertificat, (req, res) => {
    const carte = carteAccessible(req);
    if (carte.auteur_id === req.utilisateur.id) throw new ErreurClient('Tu ne peux pas signaler ta propre carte.');
    if (carte.statut !== 'visible') throw new ErreurClient('Cette carte est déjà masquée.', 409);
    const { motif, commentaire } = req.body ?? {};
    if (!MOTIFS_SIGNALEMENT.some((m) => m.id === motif)) throw new ErreurClient('Choisis un motif de signalement.');
    const texte = String(commentaire ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);

    const masquee = transaction(db, () => {
      if (dejaSignalee.get(carte.id, req.utilisateur.id)) throw new ErreurClient('Tu as déjà signalé cette carte.', 409);
      db.prepare('INSERT INTO signalements (carte_id, auteur_id, motif, commentaire, cree_le) VALUES (?, ?, ?, ?, ?)').run(
        carte.id,
        req.utilisateur.id,
        motif,
        texte,
        maintenant().toISOString(),
      );
      if (resumeSignalements(carte.id).total >= config.seuilSignalements) {
        db.prepare(`UPDATE cartes SET statut = 'masquee', masquee_par = 'auto' WHERE id = ?`).run(carte.id);
        return true;
      }
      return false;
    });
    res.status(201).json({ ok: true, masquee });
  });

  r.get('/stats', exigerLecture, (_req, res) => {
    const parFiliere = Object.fromEntries(FILIERES.map((f) => [f.id, 0]));
    for (const l of db.prepare(`SELECT filiere, COUNT(*) AS n FROM cartes WHERE statut = 'visible' GROUP BY filiere`).all()) {
      parFiliere[l.filiere] = l.n;
    }
    res.json({
      cartes: Object.values(parFiliere).reduce((s, n) => s + n, 0),
      createurs: db.prepare(`SELECT COUNT(DISTINCT auteur_id) AS n FROM cartes WHERE statut = 'visible'`).get().n,
      signataires: db.prepare('SELECT COUNT(*) AS n FROM certificats').get().n,
      parFiliere,
    });
  });

  return r;
}
