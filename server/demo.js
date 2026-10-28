import { VERSION_CERTIFICAT } from '../shared/certificat.js';
import { EXEMPLES } from '../shared/exemples.js';
import { validerCarte } from '../shared/regles.js';
import { hacherMotDePasse } from './auth.js';
import { genererMotDePasse, numeroCertificat } from './comptes.js';
import { transaction } from './db.js';

// Données fictives pour un site de démonstration (variable DEMO=1) : de quoi voir chaque page
// sans rien saisir. Rien n'est ajouté si la base contient déjà au moins un participant,
// pour ne jamais mélanger démonstration et vraie campagne.

const PARTICIPANTS = [
  {
    identifiant: 'camille.martin',
    nomComplet: 'Camille Martin',
    cartes: [
      EXEMPLES[0],
      {
        nom: 'Major Ronflex',
        sousTitre: 'Dort en amphi depuis 2024',
        filiere: 'tesa',
        pv: 120,
        attaques: [
          { nom: 'Sieste tactique', energie: 1, degats: 10, effet: 'soin', texte: 'Zzz.' },
          { nom: 'Réveil brutal', energie: 3, degats: 80, effet: 'epuisement', texte: '' },
        ],
        description: 'Capable de dormir debout pendant une prise d’armes.',
      },
    ],
  },
  {
    identifiant: 'lea.bernard',
    nomComplet: 'Léa Bernard',
    cartes: [
      EXEMPLES[1],
      {
        nom: 'Wifi Instable',
        sousTitre: 'Admin réseau autoproclamée',
        filiere: 'ned',
        pv: 50,
        attaques: [
          { nom: 'Redémarrage', energie: 1, degats: 0, effet: 'renfort', texte: 'Tu as essayé de rebrancher ?' },
          { nom: 'Coupure générale', energie: 4, degats: 120, effet: 'epuisement', texte: '' },
        ],
        description: '',
      },
    ],
  },
  {
    identifiant: 'hugo.roux',
    nomComplet: 'Hugo Roux',
    cartes: [
      EXEMPLES[2],
      {
        nom: 'Sondage Express',
        sousTitre: 'Questionne même le distributeur',
        filiere: 'egid',
        pv: 90,
        attaques: [{ nom: 'Enquête de terrain', energie: 2, degats: 40, effet: 'brouillage', texte: '' }],
        description: 'Échantillon : une personne. Conclusion : universelle.',
      },
    ],
  },
  // Sans carte : pour essayer l'atelier depuis un hangar vide
  { identifiant: 'ines.moreau', nomComplet: 'Inès Moreau', cartes: [] },
];

export async function remplirDemo(db, { motDePasse, maintenant = new Date() } = {}) {
  if (db.prepare(`SELECT COUNT(*) AS n FROM utilisateurs WHERE role = 'participant'`).get().n > 0) return null;
  const mdp = motDePasse || genererMotDePasse();
  const hash = await hacherMotDePasse(mdp);
  const date = maintenant.toISOString();

  transaction(db, () => {
    const ids = {};
    for (const p of PARTICIPANTS) {
      const id = Number(
        db
          .prepare(
            `INSERT INTO utilisateurs (identifiant, hash, nom_complet, role, doit_changer_mdp, derniere_connexion, cree_le)
             VALUES (?, ?, ?, 'participant', 0, ?, ?)`,
          )
          .run(p.identifiant, hash, p.nomComplet, date, date).lastInsertRowid,
      );
      ids[p.identifiant] = id;
      db.prepare('INSERT INTO certificats (utilisateur_id, nom_complet, version, numero, signe_le) VALUES (?, ?, ?, ?, ?)').run(
        id,
        p.nomComplet,
        VERSION_CERTIFICAT,
        numeroCertificat(id, VERSION_CERTIFICAT, p.nomComplet, date),
        date,
      );
      for (const brute of p.cartes) {
        const { ok, carte, erreurs } = validerCarte(brute);
        if (!ok) throw new Error(`Carte de démonstration invalide (${brute.nom}) : ${erreurs.join(' ')}`);
        db.prepare(
          `INSERT INTO cartes (auteur_id, nom, sous_titre, filiere, pv, description, attaques, image_x, image_y, image_zoom, cree_le, modifie_le)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
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
          date,
        );
      }
    }
    // Un signalement en attente, pour voir l'onglet Signalements des organisateurs
    const cible = db.prepare(`SELECT id FROM cartes WHERE nom = 'Wifi Instable'`).get();
    if (cible) {
      db.prepare('INSERT INTO signalements (carte_id, auteur_id, motif, commentaire, cree_le) VALUES (?, ?, ?, ?, ?)').run(
        cible.id,
        ids['hugo.roux'],
        'vie-privee',
        'Exemple de signalement (démonstration).',
        date,
      );
    }
  });

  return { identifiants: PARTICIPANTS.map((p) => p.identifiant), motDePasse: mdp };
}
