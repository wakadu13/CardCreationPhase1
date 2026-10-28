// Lecture de la configuration depuis les variables d'environnement (voir .env.example).

function date(valeur, nom) {
  if (!valeur) return null;
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) throw new Error(`${nom} n'est pas une date valide : « ${valeur} »`);
  return d;
}

// TRUST_PROXY : nombre de proxys (« 1 »), « true », ou liste d'adresses comprise par Express.
function proxy(valeur) {
  if (!valeur || valeur === 'false') return false;
  if (valeur === 'true') return true;
  return /^\d+$/.test(valeur) ? Number(valeur) : valeur;
}

function entier(valeur, defaut) {
  const n = Number.parseInt(valeur ?? '', 10);
  return Number.isInteger(n) && n > 0 ? n : defaut;
}

export function lireConfig(env = process.env) {
  const config = {
    port: entier(env.PORT, 3000),
    cheminBase: env.DB_PATH || 'data/as-de-salon.sqlite',
    nomJeu: env.NOM_JEU || 'Les As de Salon',
    promo: env.PROMO || '',
    campagneDebut: date(env.CAMPAGNE_DEBUT, 'CAMPAGNE_DEBUT'),
    campagneFin: date(env.CAMPAGNE_FIN, 'CAMPAGNE_FIN'),
    seuilSignalements: entier(env.SEUIL_SIGNALEMENTS, 3),
    codeAcces: env.CODE_ACCES || '',
    admins: (env.ADMINS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    cookieSecurise: env.COOKIE_SECURE ? env.COOKIE_SECURE === '1' : env.NODE_ENV === 'production',
    trustProxy: proxy(env.TRUST_PROXY),
  };
  if (config.campagneDebut && config.campagneFin && config.campagneFin <= config.campagneDebut) {
    throw new Error('CAMPAGNE_FIN doit être après CAMPAGNE_DEBUT');
  }
  return config;
}

// 'a-venir' | 'ouverte' | 'terminee'
export function statutCampagne(config, maintenant = new Date()) {
  if (config.campagneDebut && maintenant < config.campagneDebut) return 'a-venir';
  if (config.campagneFin && maintenant >= config.campagneFin) return 'terminee';
  return 'ouverte';
}
