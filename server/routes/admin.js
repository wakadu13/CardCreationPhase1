import { Router } from 'express';
import { VERSION_CERTIFICAT } from '../../shared/certificat.js';
import { exigerAdmin, hacherMotDePasse } from '../auth.js';
import { genererMotDePasse, IDENTIFIANT, identifiantDepuisNom, identifiantLibre, reinitialiserMotDePasse } from '../comptes.js';
import { enregistrerParametres, statutCampagne } from '../config.js';
import { transaction } from '../db.js';
import { ErreurClient, idParam } from '../erreurs.js';
import { enregistrerTextes, textesEffectifs, textesParDefaut } from '../textes.js';
import { COLONNES, formaterCarte } from './cartes.js';

const TAILLE_MAX_LOT = 300;

const nettoyerNom = (v) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function controlerNom(nom, prefixe = '') {
  const n = [...nom].length;
  if (n < 3 || n > 80) throw new ErreurClient(`${prefixe}le nom doit faire entre 3 et 80 caractères.`);
}

// Espace organisateurs : comptes, signalements, cartes, réglages de la campagne et export.
export function routesAdmin({ db, config, maintenant }) {
  const r = Router();
  r.use('/admin', exigerAdmin);

  const compteParNom = db.prepare('SELECT id, identifiant FROM utilisateurs WHERE nom_complet = ? COLLATE NOCASE');

  // --- Vue d'ensemble -----------------------------------------------------------------

  r.get('/admin/resume', (_req, res) => {
    const un = (sql) => db.prepare(sql).get().n;
    res.json({
      comptes: un(`SELECT COUNT(*) AS n FROM utilisateurs WHERE role = 'participant'`),
      organisateurs: un(`SELECT COUNT(*) AS n FROM utilisateurs WHERE role = 'admin'`),
      enAttente: un(`SELECT COUNT(*) AS n FROM utilisateurs WHERE role = 'participant' AND doit_changer_mdp = 1`),
      certificats: db.prepare('SELECT COUNT(*) AS n FROM certificats WHERE version = ?').get(VERSION_CERTIFICAT).n,
      cartes: un('SELECT COUNT(*) AS n FROM cartes'),
      masquees: un(`SELECT COUNT(*) AS n FROM cartes WHERE statut = 'masquee'`),
      aTraiter: un(`SELECT COUNT(DISTINCT carte_id) AS n FROM signalements WHERE statut = 'actif'`),
    });
  });

  // --- Comptes ----------------------------------------------------------------------------

  r.get('/admin/comptes', (_req, res) => {
    const lignes = db
      .prepare(
        `SELECT u.id, u.identifiant, u.nom_complet, u.role, u.doit_changer_mdp, u.derniere_connexion, u.cree_le,
           c.version AS version_certificat, c.signe_le,
           (SELECT COUNT(*) FROM cartes WHERE auteur_id = u.id) AS nb_cartes,
           (SELECT COUNT(*) FROM cartes WHERE auteur_id = u.id AND statut = 'masquee') AS nb_masquees,
           (SELECT COUNT(*) FROM signalements WHERE auteur_id = u.id) AS nb_signalements
         FROM utilisateurs u LEFT JOIN certificats c ON c.utilisateur_id = u.id
         ORDER BY u.role DESC, u.nom_complet COLLATE NOCASE, u.identifiant COLLATE NOCASE`,
      )
      .all();
    res.json(
      lignes.map((l) => ({
        id: l.id,
        identifiant: l.identifiant,
        nomComplet: l.nom_complet,
        role: l.role,
        motDePasseProvisoire: l.doit_changer_mdp === 1,
        certificat: l.version_certificat ? (l.version_certificat === VERSION_CERTIFICAT ? 'signe' : 'ancien') : 'non',
        signeLe: l.signe_le,
        derniereConnexion: l.derniere_connexion,
        creeLe: l.cree_le,
        nbCartes: l.nb_cartes,
        nbMasquees: l.nb_masquees,
        nbSignalements: l.nb_signalements,
      })),
    );
  });

  // Création d'un ou plusieurs comptes. Tout ou rien : à la moindre erreur, aucun compte n'est créé.
  // Les mots de passe provisoires ne sont renvoyés qu'une fois, ici.
  r.post('/admin/comptes', async (req, res) => {
    const { comptes, role = 'participant' } = req.body ?? {};
    if (!['participant', 'admin'].includes(role)) throw new ErreurClient('Rôle inconnu.');
    if (!Array.isArray(comptes) || comptes.length === 0) throw new ErreurClient('Ajoute au moins une personne.');
    if (comptes.length > TAILLE_MAX_LOT) throw new ErreurClient(`${TAILLE_MAX_LOT} comptes maximum à la fois.`);

    const lignes = comptes.map((c, i) => ({
      numero: i + 1,
      nomComplet: nettoyerNom(c?.nomComplet),
      identifiant: String(c?.identifiant ?? '').trim(),
    }));
    const vus = new Set();
    for (const l of lignes) {
      const prefixe = comptes.length > 1 ? `Ligne ${l.numero} : ` : '';
      controlerNom(l.nomComplet, prefixe);
      if (l.identifiant && !IDENTIFIANT.test(l.identifiant)) {
        throw new ErreurClient(`${prefixe}identifiant invalide (3 à 24 caractères : lettres, chiffres, point, tirets).`);
      }
      const cle = l.nomComplet.toLowerCase();
      if (vus.has(cle)) throw new ErreurClient(`${prefixe}« ${l.nomComplet} » apparaît deux fois dans la liste.`);
      vus.add(cle);
      const existant = compteParNom.get(l.nomComplet);
      if (existant) {
        throw new ErreurClient(`${prefixe}un compte existe déjà pour « ${l.nomComplet} » (@${existant.identifiant}).`, 409);
      }
    }

    const motsDePasse = lignes.map(() => genererMotDePasse());
    const hashs = await Promise.all(motsDePasse.map(hacherMotDePasse));
    const date = maintenant().toISOString();
    const inserer = db.prepare(
      `INSERT INTO utilisateurs (identifiant, hash, nom_complet, role, doit_changer_mdp, cree_le) VALUES (?, ?, ?, ?, 1, ?)`,
    );

    const crees = transaction(db, () => {
      const reserves = new Set();
      return lignes.map((l, i) => {
        let identifiant = l.identifiant;
        if (identifiant) {
          const pris = reserves.has(identifiant.toLowerCase()) || db.prepare('SELECT 1 FROM utilisateurs WHERE identifiant = ?').get(identifiant);
          if (pris) throw new ErreurClient(`Ligne ${l.numero} : l’identifiant « ${identifiant} » est déjà pris.`, 409);
        } else {
          identifiant = identifiantLibre(db, identifiantDepuisNom(l.nomComplet), reserves);
        }
        reserves.add(identifiant.toLowerCase());
        inserer.run(identifiant, hashs[i], l.nomComplet, role, date);
        return { identifiant, nomComplet: l.nomComplet, role, motDePasse: motsDePasse[i] };
      });
    });
    res.status(201).json({ comptes: crees });
  });

  function compteCible(req) {
    const id = Number(req.params.id);
    const ligne = Number.isInteger(id) ? db.prepare('SELECT id, identifiant, role FROM utilisateurs WHERE id = ?').get(id) : null;
    if (!ligne) throw new ErreurClient('Compte introuvable.', 404);
    return ligne;
  }

  // Corriger le nom d'une personne (il est aussi corrigé sur son certificat et dans le registre).
  r.patch('/admin/comptes/:id', (req, res) => {
    const compte = compteCible(req);
    const nom = nettoyerNom(req.body?.nomComplet);
    controlerNom(nom);
    const homonyme = compteParNom.get(nom);
    if (homonyme && homonyme.id !== compte.id) throw new ErreurClient(`Un compte existe déjà pour « ${nom} » (@${homonyme.identifiant}).`, 409);
    db.prepare('UPDATE utilisateurs SET nom_complet = ? WHERE id = ?').run(nom, compte.id);
    db.prepare('UPDATE certificats SET nom_complet = ? WHERE utilisateur_id = ?').run(nom, compte.id);
    res.json({ ok: true });
  });

  // Mot de passe oublié : nouveau mot de passe provisoire, à changer à la prochaine connexion.
  r.post('/admin/comptes/:id/mot-de-passe', async (req, res) => {
    const compte = compteCible(req);
    if (compte.id === req.utilisateur.id) throw new ErreurClient('Change ton propre mot de passe depuis la page Compte.');
    res.json({ identifiant: compte.identifiant, motDePasse: await reinitialiserMotDePasse(db, compte.id) });
  });

  r.delete('/admin/comptes/:id', (req, res) => {
    const compte = compteCible(req);
    if (compte.id === req.utilisateur.id) throw new ErreurClient('Tu ne peux pas supprimer ton propre compte ici.');
    db.prepare('DELETE FROM utilisateurs WHERE id = ?').run(compte.id);
    res.json({ ok: true });
  });

  // --- Signalements et cartes --------------------------------------------------------------

  r.get('/admin/signalements', (req, res) => {
    const cartes = db
      .prepare(
        `SELECT ${COLONNES} FROM cartes c JOIN utilisateurs u ON u.id = c.auteur_id
         WHERE c.statut = 'masquee' OR EXISTS (SELECT 1 FROM signalements s WHERE s.carte_id = c.id AND s.statut = 'actif')
         ORDER BY (SELECT COUNT(*) FROM signalements s WHERE s.carte_id = c.id AND s.statut = 'actif') DESC, c.id DESC`,
      )
      .all();
    const detail = db.prepare(
      `SELECT s.motif, s.commentaire, s.cree_le, u.identifiant AS par, u.nom_complet AS nom_par
       FROM signalements s JOIN utilisateurs u ON u.id = s.auteur_id
       WHERE s.carte_id = ? AND s.statut = 'actif' ORDER BY s.id`,
    );
    res.json({
      seuil: config.seuilSignalements,
      cartes: cartes.map((l) =>
        formaterCarte(l, req.utilisateur.id, {
          signalements: detail
            .all(l.id)
            .map((s) => ({ motif: s.motif, commentaire: s.commentaire, le: s.cree_le, par: s.par, nomPar: s.nom_par })),
        }),
      ),
    });
  });

  r.get('/admin/cartes', (req, res) => {
    const lignes = db
      .prepare(
        `SELECT ${COLONNES},
           (SELECT COUNT(*) FROM signalements s WHERE s.carte_id = c.id AND s.statut = 'actif') AS nb_signalements
         FROM cartes c JOIN utilisateurs u ON u.id = c.auteur_id ORDER BY c.id DESC`,
      )
      .all();
    res.json(lignes.map((l) => formaterCarte(l, req.utilisateur.id, { nbSignalements: l.nb_signalements })));
  });

  function carteCible(req) {
    const id = idParam(req);
    if (!db.prepare('SELECT 1 FROM cartes WHERE id = ?').get(id)) throw new ErreurClient('Carte introuvable.', 404);
    return id;
  }

  r.post('/admin/cartes/:id/masquer', (req, res) => {
    db.prepare(`UPDATE cartes SET statut = 'masquee', masquee_par = 'organisation' WHERE id = ?`).run(carteCible(req));
    res.json({ ok: true });
  });

  // Écarte les signalements actuels et réaffiche la carte.
  // Les personnes qui ont déjà signalé ne peuvent pas la re-signaler.
  r.post('/admin/cartes/:id/retablir', (req, res) => {
    const id = carteCible(req);
    db.prepare(`UPDATE signalements SET statut = 'classe' WHERE carte_id = ?`).run(id);
    db.prepare(`UPDATE cartes SET statut = 'visible', masquee_par = NULL WHERE id = ?`).run(id);
    res.json({ ok: true });
  });

  r.delete('/admin/cartes/:id', (req, res) => {
    db.prepare('DELETE FROM cartes WHERE id = ?').run(carteCible(req));
    res.json({ ok: true });
  });

  // --- Réglages de la campagne ----------------------------------------------------------------

  const vueParametres = () => ({
    promo: config.promo,
    campagneDebut: config.campagneDebut?.toISOString() ?? null,
    campagneFin: config.campagneFin?.toISOString() ?? null,
    seuilSignalements: config.seuilSignalements,
    statut: statutCampagne(config, maintenant()),
  });

  r.get('/admin/parametres', (_req, res) => res.json(vueParametres()));

  r.put('/admin/parametres', (req, res) => {
    const b = req.body ?? {};
    const date = (v, nom) => {
      if (v === null || v === '' || v === undefined) return null;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) throw new ErreurClient(`Date de ${nom} invalide.`);
      return d;
    };
    const debut = date(b.campagneDebut, 'début');
    const fin = date(b.campagneFin, 'fin');
    if (debut && fin && fin <= debut) throw new ErreurClient('La fin de la campagne doit être après son début.');
    const seuil = Number(b.seuilSignalements);
    if (!Number.isInteger(seuil) || seuil < 1 || seuil > 50) throw new ErreurClient('Le seuil de signalements va de 1 à 50.');
    const promo = nettoyerNom(b.promo);
    if ([...promo].length > 40) throw new ErreurClient('Le nom de la promo fait 40 caractères maximum.');

    enregistrerParametres(db, config, { promo, campagneDebut: debut, campagneFin: fin, seuilSignalements: seuil });
    // Un seuil abaissé s'applique tout de suite aux cartes déjà signalées.
    const { changes: masquees } = db
      .prepare(
        `UPDATE cartes SET statut = 'masquee', masquee_par = 'auto'
         WHERE statut = 'visible'
           AND (SELECT COUNT(*) FROM signalements s WHERE s.carte_id = cartes.id AND s.statut = 'actif') >= ?`,
      )
      .run(seuil);
    res.json({ ...vueParametres(), masquees: Number(masquees) });
  });

  // --- Personnalisation des textes du site ------------------------------------------------------

  r.get('/admin/personnalisation', (_req, res) => {
    res.json({ valeurs: textesEffectifs(config), defauts: textesParDefaut(config) });
  });

  r.put('/admin/personnalisation', (req, res) => {
    enregistrerTextes(db, config, req.body?.valeurs);
    res.json({ valeurs: textesEffectifs(config), defauts: textesParDefaut(config) });
  });

  // --- Export ------------------------------------------------------------------------------------

  // Export JSON des cartes visibles (images incluses) pour préparer la phase 2.
  r.get('/admin/export', (_req, res) => {
    const lignes = db
      .prepare(
        `SELECT ${COLONNES}, c.image, c.image_type FROM cartes c JOIN utilisateurs u ON u.id = c.auteur_id
         WHERE c.statut = 'visible' ORDER BY c.id`,
      )
      .all();
    const cartes = lignes.map((l) => {
      const { estAMoi, image, masqueePar, ...carte } = formaterCarte(l, null);
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
