import { createHash } from 'node:crypto';
import { Router } from 'express';
import { CLAUSES, VERSION_CERTIFICAT } from '../../shared/certificat.js';
import {
  creerSession,
  exigerCertificat,
  exigerConnexion,
  exigerMotDePassePerso,
  fermerSession,
  hacherMotDePasse,
  jetonCourant,
  limiteur,
  verifierMotDePasse,
} from '../auth.js';
import { ErreurClient } from '../erreurs.js';

export function controlerMotDePasse(mdp) {
  if (typeof mdp !== 'string' || mdp.length < 8) throw new ErreurClient('Le mot de passe doit faire au moins 8 caractères.');
  if (mdp.length > 200) throw new ErreurClient('Mot de passe trop long.');
}

// Pas d'inscription libre : les comptes sont créés par les organisateurs (voir routes/admin.js).
export function routesCompte({ db, config, maintenant }) {
  const r = Router();
  // Toute une promo peut partager la même adresse IP (Wi-Fi de l'école) : les limites restent larges
  // par réseau, et les échecs de connexion sont surtout comptés par compte.
  const echecsCompte = limiteur({ max: 10, fenetreMs: 15 * 60 * 1000 });
  const echecsReseau = limiteur({ max: 300, fenetreMs: 15 * 60 * 1000 });
  // Hash factice : une connexion avec un identifiant inconnu prend le même temps.
  const hashFactice = hacherMotDePasse('mot-de-passe-factice');

  const nbCartes = db.prepare('SELECT COUNT(*) AS n FROM cartes WHERE auteur_id = ?');
  const lireHash = (id) => db.prepare('SELECT hash FROM utilisateurs WHERE id = ?').get(id).hash;

  function profil(u) {
    if (!u) return null;
    return {
      identifiant: u.identifiant,
      nomComplet: u.nomComplet,
      certificatValide: u.certificatValide,
      estAdmin: u.estAdmin,
      doitChangerMdp: u.doitChangerMdp,
      nbCartes: nbCartes.get(u.id).n,
    };
  }

  r.post('/connexion', async (req, res) => {
    const { identifiant, motDePasse } = req.body ?? {};
    const cleCompte = `${req.ip}|${String(identifiant ?? '').toLowerCase()}`;
    if (echecsCompte.depasse(cleCompte) || echecsReseau.depasse(req.ip)) {
      throw new ErreurClient('Trop de tentatives. Réessaie dans un quart d’heure.', 429);
    }
    const ligne =
      typeof identifiant === 'string' ? db.prepare('SELECT id, hash FROM utilisateurs WHERE identifiant = ?').get(identifiant.trim()) : null;
    const valide = await verifierMotDePasse(String(motDePasse ?? ''), ligne?.hash ?? (await hashFactice));
    if (!ligne || !valide) {
      echecsCompte.noter(cleCompte);
      echecsReseau.noter(req.ip);
      throw new ErreurClient('Identifiant ou mot de passe incorrect.', 401);
    }
    echecsCompte.effacer(cleCompte);
    db.prepare('UPDATE utilisateurs SET derniere_connexion = ? WHERE id = ?').run(maintenant().toISOString(), ligne.id);
    creerSession(db, res, ligne.id, config);
    res.json({ ok: true });
  });

  r.post('/deconnexion', (req, res) => {
    fermerSession(db, req, res);
    res.json({ ok: true });
  });

  r.get('/moi', exigerConnexion, (req, res) => res.json(profil(req.utilisateur)));

  // Changement de mot de passe. À la première connexion (mot de passe provisoire),
  // l'ancien n'est pas redemandé : il vient d'être saisi pour se connecter.
  r.post('/moi/mot-de-passe', exigerConnexion, async (req, res) => {
    const { actuel, nouveau } = req.body ?? {};
    const hash = lireHash(req.utilisateur.id);
    if (!req.utilisateur.doitChangerMdp && !(await verifierMotDePasse(String(actuel ?? ''), hash))) {
      throw new ErreurClient('Mot de passe actuel incorrect.', 403);
    }
    controlerMotDePasse(nouveau);
    if (await verifierMotDePasse(nouveau, hash)) throw new ErreurClient('Choisis un mot de passe différent de l’actuel.');
    db.prepare('UPDATE utilisateurs SET hash = ?, doit_changer_mdp = 0 WHERE id = ?').run(
      await hacherMotDePasse(nouveau),
      req.utilisateur.id,
    );
    // Déconnecte les autres appareils.
    db.prepare('DELETE FROM sessions WHERE utilisateur_id = ? AND jeton_hash != ?').run(req.utilisateur.id, jetonCourant(req));
    res.json({ ok: true });
  });

  // Retrait du consentement : supprime le compte, ses cartes, ses signalements et son certificat.
  r.delete('/moi', exigerConnexion, async (req, res) => {
    const { motDePasse } = req.body ?? {};
    if (!(await verifierMotDePasse(String(motDePasse ?? ''), lireHash(req.utilisateur.id)))) {
      throw new ErreurClient('Mot de passe incorrect.', 403);
    }
    if (req.utilisateur.estAdmin && db.prepare(`SELECT COUNT(*) AS n FROM utilisateurs WHERE role = 'admin'`).get().n <= 1) {
      throw new ErreurClient('Tu es le dernier compte organisateur : crée-en un autre avant de supprimer celui-ci.', 409);
    }
    db.prepare('DELETE FROM utilisateurs WHERE id = ?').run(req.utilisateur.id);
    fermerSession(db, req, res);
    res.json({ ok: true });
  });

  r.get('/certificat', exigerMotDePassePerso, (req, res) => {
    const ligne = db.prepare('SELECT * FROM certificats WHERE utilisateur_id = ?').get(req.utilisateur.id);
    const { nom_complet: nomCompte } = db.prepare('SELECT nom_complet FROM utilisateurs WHERE id = ?').get(req.utilisateur.id);
    res.json({
      version: VERSION_CERTIFICAT,
      clauses: CLAUSES,
      // Nom enregistré par les organisateurs : c'est lui qui figure sur le certificat et dans le registre.
      nomCompte: nomCompte || null,
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

  r.post('/certificat', exigerMotDePassePerso, (req, res) => {
    const { nomComplet, accords } = req.body ?? {};
    const { nom_complet: nomCompte } = db.prepare('SELECT nom_complet FROM utilisateurs WHERE id = ?').get(req.utilisateur.id);
    const nom = (nomCompte || String(nomComplet ?? '')).replace(/\s+/g, ' ').trim();
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
