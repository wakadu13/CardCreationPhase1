import { api } from './api.js';

// État partagé de l'application (configuration du serveur + utilisateur connecté).
export const etat = {
  serveur: null,
  decalage: 0,
};

export async function rafraichirEtat() {
  const s = await api('/etat');
  etat.serveur = s;
  etat.decalage = Date.parse(s.maintenant) - Date.now();
  return s;
}

export const utilisateur = () => etat.serveur?.utilisateur ?? null;

// Heure du serveur (évite les écarts si l'horloge du téléphone est fausse).
export const maintenant = () => new Date(Date.now() + etat.decalage);

export function statutCampagne() {
  const c = etat.serveur?.campagne;
  if (!c) return 'ouverte';
  const t = maintenant().getTime();
  if (c.debut && t < Date.parse(c.debut)) return 'a-venir';
  if (c.fin && t >= Date.parse(c.fin)) return 'terminee';
  return 'ouverte';
}

export function compteARebours(cible) {
  const ms = Math.max(0, Date.parse(cible) - maintenant().getTime());
  const s = Math.floor(ms / 1000);
  return { jours: Math.floor(s / 86400), heures: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), secondes: s % 60 };
}

const deux = (n) => String(n).padStart(2, '0');

export function formatRebours(cible) {
  const r = compteARebours(cible);
  return `${r.jours > 0 ? `${r.jours} J ` : ''}${deux(r.heures)}:${deux(r.minutes)}:${deux(r.secondes)}`;
}

export const formatDate = (iso, options = {}) =>
  new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris', ...options });
