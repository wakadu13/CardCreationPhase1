import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { VERSION_CERTIFICAT } from '../shared/certificat.js';
import { LIMITE_CARTES } from '../shared/regles.js';
import { chargerUtilisateur } from './auth.js';
import { chargerParametres, statutCampagne } from './config.js';
import { gestionnaireErreurs } from './erreurs.js';
import { routesAdmin } from './routes/admin.js';
import { routesCartes } from './routes/cartes.js';
import { routesCompte } from './routes/compte.js';
import { chargerTextes, textesEffectifs } from './textes.js';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const POLICES = ['barlow', 'barlow-condensed', 'saira-stencil-one', 'share-tech-mono'];

function entetesSecurite(_req, res, next) {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
}

// Protection CSRF : les écritures doivent venir du site lui-même et être envoyées en JSON.
function origineMemeSite(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origine = req.get('origin');
  if (origine) {
    let hote = null;
    try {
      hote = new URL(origine).host;
    } catch {}
    // req.host tient compte de X-Forwarded-Host quand TRUST_PROXY est réglé.
    if (hote !== req.host) return res.status(403).json({ erreur: 'Origine refusée.' });
  }
  if (req.headers['content-length'] && req.headers['content-length'] !== '0' && !req.is('application/json')) {
    return res.status(415).json({ erreur: 'Requête JSON attendue.' });
  }
  next();
}

export function creerApp({ db, config, maintenant = () => new Date() }) {
  // Les réglages modifiés depuis l'espace organisateurs priment sur le fichier .env.
  chargerParametres(db, config);
  chargerTextes(db, config);

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(entetesSecurite);

  const api = express.Router();
  api.use(origineMemeSite);
  api.use(express.json({ limit: '3mb' }));
  api.use(chargerUtilisateur(db));
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const ctx = { db, config, maintenant };
  const compte = routesCompte(ctx);

  api.get('/etat', (req, res) => {
    const textes = textesEffectifs(config);
    res.json({
      nomJeu: textes.nomJeu,
      textes,
      promo: config.promo,
      maintenant: maintenant().toISOString(),
      campagne: {
        debut: config.campagneDebut?.toISOString() ?? null,
        fin: config.campagneFin?.toISOString() ?? null,
        statut: statutCampagne(config, maintenant()),
      },
      limiteCartes: LIMITE_CARTES,
      seuilSignalements: config.seuilSignalements,
      versionCertificat: VERSION_CERTIFICAT,
      utilisateur: compte.profil(req.utilisateur),
    });
  });

  api.use(compte.router);
  api.use(routesCartes(ctx));
  api.use(routesAdmin(ctx));
  api.use((_req, res) => res.status(404).json({ erreur: 'Route inconnue.' }));
  api.use(gestionnaireErreurs);

  app.use('/api', api);

  for (const police of POLICES) {
    app.use(
      `/polices/${police}`,
      express.static(join(RACINE, 'node_modules', '@fontsource', police, 'files'), { maxAge: '30d', immutable: true }),
    );
  }
  app.use('/shared', express.static(join(RACINE, 'shared'), { maxAge: 0 }));
  app.use(express.static(join(RACINE, 'public'), { maxAge: 0 }));

  return app;
}
