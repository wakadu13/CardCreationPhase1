import { createHash } from 'node:crypto';
import { Router } from 'express';
import { CLAUSES, VERSION_CERTIFICAT } from '../../shared/certificat.js';
import {
  creerSession,
  exigerCertificat,
  exigerConnexion,
  fermerSession,
  hacherMotDePasse,
  jetonCourant,
  limiteur,
  verifierMotDePasse,
} from '../auth.js';
import { ErreurClient } from '../erreurs.js';

const IDENTIFIANT = /^[A-Za-z0-9._-]{3,24}$/;

function controlerMotDePasse(mdp) {
  if (typeof mdp !== 'string' || mdp.length < 8) throw new ErreurClient('Le mot de passe doit faire au moins 8 caractères.');
  if (mdp.length > 200) throw new ErreurClient('Mot de passe trop long.');
}

export function routesCompte({ db, config, maintenant }) {
  const r = Router();
  // Toute une promo peut partager la même adresse IP (Wi-Fi de l'école) : les limites restent larges
  // par réseau, et les échecs de connexion sont surtout comptés par compte.
  const echecsCompte = limiteur({ max: 10, fenetreMs: 15 * 60 * 1000 });
  const echecsReseau = limiteur({ max: 300, fenetreMs: 15 * 60 * 1000 });
  const inscriptions = limiteur({ max: 300, fenetreMs: 60 * 60 * 1000 });
  // Hash factice : une connexion avec un identifiant inconnu prend le même temps.
  const hashFactice = hacherMotDePasse('mot-de-passe-factice');

  const nbCartes = db.prepare('SELECT COUNT(*) AS n FROM cartes WHERE auteur_id = ?');

  function profil(u) {
    if (!u) return null;
    return {
      identifiant: u.identifiant,
      nomComplet: u.nomComplet,
      certificatValide: u.certificatValide,
      estAdmin: u.estAdmin,
      nbCartes: nbCartes.get(u.id).n,
    };
  }

  r.post('/inscription', async (req, res) => {
    const ip = req.ip;
    if (inscriptions.depasse(ip)) throw new ErreurClient('Trop d’inscriptions depuis cette connexion, réessaie plus tard.', 429);
    const { identifiant, motDePasse, codeAcces } = req.body ?? {};
    if (config.codeAcces && codeAcces !== config.codeAcces) {
      throw new ErreurClient('Code d’accès incorrect. Demande-le aux organisateurs.', 403);
    }
    if (typeof identifiant !== 'string' || !IDENTIFIANT.test(identifiant)) {
      throw new ErreurClient('Identifiant : 3 à 24 caractères parmi lettres, chiffres, point, tiret et tiret bas.');
    }
    controlerMotDePasse(motDePasse);
    const hash = await hacherMotDePasse(motDePasse);
    let id;
    try {
      id = db
        .prepare('INSERT INTO utilisateurs (identifiant, hash, cree_le) VALUES (?, ?, ?)')
        .run(identifiant, hash, maintenant().toISOString()).lastInsertRowid;
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) throw new ErreurClient('Cet identifiant est déjà pris.', 409);
      throw err;
    }
    inscriptions.noter(ip);
    creerSession(db, res, Number(id), config);
    res.status(201).json({ ok: true });
  });

  r.post('/connexion', async (req, res) => {
    const { identifiant, motDePasse } = req.body ?? {};
    const cleCompte = `${req.ip}|${String(identifiant ?? '').toLowerCase()}`;
    if (echecsCompte.depasse(cleCompte) || echecsReseau.depasse(req.ip)) {
      throw new ErreurClient('Trop de tentatives. Réessaie dans un quart d’heure.', 429);
    }
    const ligne =
      typeof identifiant === 'string' ? db.prepare('SELECT id, hash FROM utilisateurs WHERE identifiant = ?').get(identifiant) : null;
    const valide = await verifierMotDePasse(String(motDePasse ?? ''), ligne?.hash ?? (await hashFactice));
    if (!ligne || !valide) {
      echecsCompte.noter(cleCompte);
      echecsReseau.noter(req.ip);
      throw new ErreurClient('Identifiant ou mot de passe incorrect.', 401);
    }
    echecsCompte.effacer(cleCompte);
    creerSession(db, res, ligne.id, config);
    res.json({ ok: true });
  });

  r.post('/deconnexion', (req, res) => {
    fermerSession(db, req, res);
    res.json({ ok: true });
  });

  r.get('/moi', exigerConnexion, (req, res) => res.json(profil(req.utilisateur)));

  r.post('/moi/mot-de-passe', exigerConnexion, async (req, res) => {
    const { actuel, nouveau } = req.body ?? {};
    const { hash } = db.prepare('SELECT hash FROM utilisateurs WHERE id = ?').get(req.utilisateur.id);
    if (!(await verifierMotDePasse(String(actuel ?? ''), hash))) throw new ErreurClient('Mot de passe actuel incorrect.', 403);
    controlerMotDePasse(nouveau);
    db.prepare('UPDATE utilisateurs SET hash = ? WHERE id = ?').run(await hacherMotDePasse(nouveau), req.utilisateur.id);
    // Déconnecte les autres appareils.
    db.prepare('DELETE FROM sessions WHERE utilisateur_id = ? AND jeton_hash != ?').run(req.utilisateur.id, jetonCourant(req));
    res.json({ ok: true });
  });

  // Retrait du consentement : supprime le compte, ses cartes, ses signalements et son certificat.
  r.delete('/moi', exigerConnexion, async (req, res) => {
    const { motDePasse } = req.body ?? {};
    const { hash } = db.prepare('SELECT hash FROM utilisateurs WHERE id = ?').get(req.utilisateur.id);
    if (!(await verifierMotDePasse(String(motDePasse ?? ''), hash))) throw new ErreurClient('Mot de passe incorrect.', 403);
    db.prepare('DELETE FROM utilisateurs WHERE id = ?').run(req.utilisateur.id);
    fermerSession(db, req, res);
    res.json({ ok: true });
  });

  r.get('/certificat', exigerConnexion, (req, res) => {
    const ligne = db.prepare('SELECT * FROM certificats WHERE utilisateur_id = ?').get(req.utilisateur.id);
    res.json({
      version: VERSION_CERTIFICAT,
      clauses: CLAUSES,
      signature: ligne
        ? {
            nomComplet: ligne.nom_complet,
            version: ligne.version,
            numero: ligne.numero,
            signeLe: ligne.signe_le,
            valide: ligne.version === VERSION_CERTIFICAT,
          }
        : null,
    });
  });

  r.post('/certificat', exigerConnexion, (req, res) => {
    const { nomComplet, accords } = req.body ?? {};
    const nom = String(nomComplet ?? '').replace(/\s+/g, ' ').trim();
    if ([...nom].length < 3 || [...nom].length > 80) throw new ErreurClient('Écris ton prénom et ton nom (3 à 80 caractères).');
    const coches = new Set(Array.isArray(accords) ? accords : []);
    if (!CLAUSES.every((c) => coches.has(c.id))) throw new ErreurClient('Coche toutes les clauses pour signer.');
    const signeLe = maintenant().toISOString();
    const numero = createHash('sha256')
      .update(`${req.utilisateur.id}|${VERSION_CERTIFICAT}|${nom}|${signeLe}`)
      .digest('hex')
      .slice(0, 12)
      .toUpperCase()
      .replace(/(.{4})(?=.)/g, '$1-');
    db.prepare(
      `INSERT INTO certificats (utilisateur_id, nom_complet, version, numero, signe_le) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (utilisateur_id) DO UPDATE SET nom_complet = excluded.nom_complet, version = excluded.version,
         numero = excluded.numero, signe_le = excluded.signe_le`,
    ).run(req.utilisateur.id, nom, VERSION_CERTIFICAT, numero, signeLe);
    res.status(201).json({ ok: true, numero });
  });

  // Registre des signataires : permet de vérifier qui a accepté d'apparaître sur une carte.
  r.get('/registre', exigerCertificat, (_req, res) => {
    const lignes = db
      .prepare(
        `SELECT u.identifiant, c.nom_complet, c.signe_le, c.version,
           (SELECT COUNT(*) FROM cartes WHERE auteur_id = u.id AND statut = 'visible') AS nb_cartes
         FROM certificats c JOIN utilisateurs u ON u.id = c.utilisateur_id
         ORDER BY c.nom_complet COLLATE NOCASE`,
      )
      .all();
    res.json(
      lignes.map((l) => ({
        identifiant: l.identifiant,
        nomComplet: l.nom_complet,
        signeLe: l.signe_le,
        aJour: l.version === VERSION_CERTIFICAT,
        nbCartes: l.nb_cartes,
      })),
    );
  });

  return { router: r, profil };
}
