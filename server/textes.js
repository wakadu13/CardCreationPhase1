import { CHAMPS_TEXTES, champTexte, nettoyerTexte } from '../shared/textes.js';
import { transaction } from './db.js';
import { ErreurClient } from './erreurs.js';

// Seuls les textes modifiés sont enregistrés en base (table « textes ») ; les autres gardent leur valeur d'origine.

export function chargerTextes(db, config) {
  config.textes = Object.fromEntries(
    db
      .prepare('SELECT cle, valeur FROM textes')
      .all()
      .filter((l) => champTexte(l.cle))
      .map((l) => [l.cle, l.valeur]),
  );
}

// Valeurs d'origine (le nom du jeu peut venir du fichier .env).
export function textesParDefaut(config) {
  return Object.fromEntries(CHAMPS_TEXTES.map((c) => [c.cle, c.cle === 'nomJeu' ? config.nomJeu : c.defaut]));
}

export function textesEffectifs(config) {
  const defauts = textesParDefaut(config);
  return Object.fromEntries(Object.entries(defauts).map(([cle, defaut]) => [cle, config.textes?.[cle] ?? defaut]));
}

// Tout ou rien : un texte invalide et rien n'est enregistré.
export function enregistrerTextes(db, config, valeurs) {
  if (!valeurs || typeof valeurs !== 'object' || Array.isArray(valeurs)) throw new ErreurClient('Textes manquants.');
  const defauts = textesParDefaut(config);
  const propres = Object.entries(valeurs).map(([cle, brut]) => {
    const champ = champTexte(cle);
    if (!champ) throw new ErreurClient(`Texte inconnu : ${cle}.`);
    if (typeof brut !== 'string') throw new ErreurClient(`« ${champ.libelle} » doit être un texte.`);
    const valeur = nettoyerTexte(brut, champ.type);
    if ([...valeur].length > champ.max) throw new ErreurClient(`« ${champ.libelle} » : ${champ.max} caractères maximum.`);
    if (champ.obligatoire && !valeur) throw new ErreurClient(`« ${champ.libelle} » ne peut pas être vide.`);
    return [cle, valeur];
  });
  const ecrire = db.prepare('INSERT INTO textes (cle, valeur) VALUES (?, ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur');
  const effacer = db.prepare('DELETE FROM textes WHERE cle = ?');
  transaction(db, () => {
    for (const [cle, valeur] of propres) {
      if (valeur === defauts[cle]) effacer.run(cle);
      else ecrire.run(cle, valeur);
    }
  });
  chargerTextes(db, config);
}
