import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { VERSION_CERTIFICAT } from '../shared/certificat.js';

const scrypt = promisify(scryptCb);
const PARAMS = { N: 16384, r: 8, p: 1 };
const LONGUEUR_CLE = 64;

export const NOM_COOKIE = 'ads_session';
const DUREE_SESSION_MS = 30 * 24 * 3600 * 1000;

export async function hacherMotDePasse(motDePasse) {
  const sel = randomBytes(16);
  const cle = await scrypt(motDePasse, sel, LONGUEUR_CLE, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, sel.toString('base64'), cle.toString('base64')].join('$');
}

export async function verifierMotDePasse(motDePasse, stocke) {
  const [algo, N, r, p, sel, cle] = String(stocke).split('$');
  if (algo !== 'scrypt') return false;
  const attendu = Buffer.from(cle, 'base64');
  const obtenu = await scrypt(motDePasse, Buffer.from(sel, 'base64'), attendu.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(attendu, obtenu);
}

const empreinte = (jeton) => createHash('sha256').update(jeton).digest('hex');

function lireCookie(req, nom) {
  const brut = req.headers.cookie ?? '';
  for (const morceau of brut.split(';')) {
    const i = morceau.indexOf('=');
    if (i > 0 && morceau.slice(0, i).trim() === nom) return decodeURIComponent(morceau.slice(i + 1).trim());
  }
  return null;
}

export function creerSession(db, res, utilisateurId, config) {
  const jeton = randomBytes(32).toString('base64url');
  const expire = Date.now() + DUREE_SESSION_MS;
  db.prepare('DELETE FROM sessions WHERE expire_le < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (jeton_hash, utilisateur_id, expire_le) VALUES (?, ?, ?)').run(
    empreinte(jeton),
    utilisateurId,
    expire,
  );
  res.cookie(NOM_COOKIE, jeton, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecurise,
    maxAge: DUREE_SESSION_MS,
    path: '/',
  });
}

export function fermerSession(db, req, res) {
  const jeton = lireCookie(req, NOM_COOKIE);
  if (jeton) db.prepare('DELETE FROM sessions WHERE jeton_hash = ?').run(empreinte(jeton));
  res.clearCookie(NOM_COOKIE, { path: '/' });
}

export function jetonCourant(req) {
  const jeton = lireCookie(req, NOM_COOKIE);
  return jeton ? empreinte(jeton) : null;
}

// Attache req.utilisateur (ou null) à chaque requête.
export function chargerUtilisateur(db) {
  const requete = db.prepare(`
    SELECT u.id, u.identifiant, u.role, u.doit_changer_mdp, u.nom_complet AS nom_compte,
      c.version AS version_certificat, c.nom_complet
    FROM sessions s
    JOIN utilisateurs u ON u.id = s.utilisateur_id
    LEFT JOIN certificats c ON c.utilisateur_id = u.id
    WHERE s.jeton_hash = ? AND s.expire_le > ?
  `);
  return (req, _res, next) => {
    const hash = jetonCourant(req);
    const ligne = hash ? requete.get(hash, Date.now()) : null;
    req.utilisateur = ligne
      ? {
          id: ligne.id,
          identifiant: ligne.identifiant,
          nomComplet: ligne.nom_complet || ligne.nom_compte || null,
          certificatValide: ligne.version_certificat === VERSION_CERTIFICAT,
          estAdmin: ligne.role === 'admin',
          doitChangerMdp: ligne.doit_changer_mdp === 1,
        }
      : null;
    next();
  };
}

// Contrôles d'accès, du plus large au plus strict. Chacun renvoie un message d'erreur, ou null.
const controles = {
  connexion: (u) => (u ? null : [401, { erreur: 'Connecte-toi pour continuer.' }]),
  motDePasse: (u) =>
    controles.connexion(u) ??
    (u.doitChangerMdp ? [403, { erreur: 'Choisis d’abord ton mot de passe personnel.', code: 'mot-de-passe' }] : null),
  certificat: (u) =>
    controles.motDePasse(u) ??
    (u.certificatValide ? null : [403, { erreur: 'Signe d’abord le certificat de consentement.', code: 'certificat' }]),
  admin: (u) => controles.motDePasse(u) ?? (u.estAdmin ? null : [403, { erreur: 'Réservé aux organisateurs.' }]),
  // Lire les cartes : participant ayant signé, ou organisateur
  lecture: (u) => controles.motDePasse(u) ?? (u.estAdmin ? null : controles.certificat(u)),
};

const exiger = (controle) => (req, res, next) => {
  const refus = controle(req.utilisateur);
  if (refus) return res.status(refus[0]).json(refus[1]);
  next();
};

export const exigerConnexion = exiger(controles.connexion);
export const exigerMotDePassePerso = exiger(controles.motDePasse);
export const exigerCertificat = exiger(controles.certificat);
export const exigerAdmin = exiger(controles.admin);
export const exigerLecture = exiger(controles.lecture);

// Limiteur simple en mémoire (suffisant pour une seule instance).
export function limiteur({ max, fenetreMs }) {
  const compteurs = new Map();
  return {
    depasse(cle) {
      const now = Date.now();
      const c = compteurs.get(cle);
      if (!c || c.reset < now) return false;
      return c.n >= max;
    },
    noter(cle) {
      const now = Date.now();
      const c = compteurs.get(cle);
      if (!c || c.reset < now) compteurs.set(cle, { n: 1, reset: now + fenetreMs });
      else c.n += 1;
      if (compteurs.size > 10_000) {
        for (const [k, v] of compteurs) if (v.reset < now) compteurs.delete(k);
      }
    },
    effacer(cle) {
      compteurs.delete(cle);
    },
  };
}
