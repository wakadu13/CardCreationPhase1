import { FILIERES, LIMITE_CARTES, MOTIFS_SIGNALEMENT, filiere } from '/shared/regles.js';
import { SECTIONS_TEXTES, VARIABLES, champTexte } from '/shared/textes.js';
import { actualiser, naviguer } from '../app.js';
import { api } from '../api.js';
import { rendreCarte } from '../carte.js';
import { etat, formatDate } from '../etat.js';
import { html, monter } from '../html.js';
import { icone } from '../icones.js';
import { formater } from '../textes.js';
import { confirmer, ouvrirDialogue, pendant, toast } from '../ui.js';

export const titre = 'Organisation';

const nomMotif = (id) => MOTIFS_SIGNALEMENT.find((m) => m.id === id)?.nom ?? id;
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const normaliser = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const ONGLETS = [
  { id: 'comptes', nom: 'Comptes' },
  { id: 'signalements', nom: 'Signalements' },
  { id: 'cartes', nom: 'Cartes' },
  { id: 'parametres', nom: 'Paramètres' },
  { id: 'personnalisation', nom: 'Personnalisation' },
];

// --- Outils : copier, CSV, fiches à imprimer ------------------------------------------------

async function copier(texte) {
  try {
    await navigator.clipboard.writeText(texte);
    toast('Copié dans le presse-papiers.');
  } catch {
    toast('Copie impossible ici : sélectionne le texte à la main.', 'erreur');
  }
}

function telechargerCsv(comptes) {
  const champ = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lignes = [
    ['Nom', 'Identifiant', 'Mot de passe provisoire'].map(champ).join(';'),
    ...comptes.map((c) => [c.nomComplet, c.identifiant, c.motDePasse].map(champ).join(';')),
  ];
  // BOM : pour que les accents s'affichent bien dans Excel
  const url = URL.createObjectURL(new Blob([`﻿${lignes.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `comptes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Fiches à découper et distribuer : une par personne.
function imprimerFiches(racine, comptes) {
  const zone = racine.querySelector('.fiches-impression');
  monter(
    zone,
    comptes.map(
      (c) => html`<div class="fiche-acces">
        <p class="fiche-acces__titre">${etat.serveur.nomJeu}${etat.serveur.promo && ` · ${etat.serveur.promo}`}</p>
        <p class="fiche-acces__nom">${c.nomComplet}</p>
        <dl>
          <div><dt>Site</dt><dd>${location.origin}</dd></div>
          <div><dt>Identifiant</dt><dd class="mono">${c.identifiant}</dd></div>
          <div><dt>Mot de passe provisoire</dt><dd class="mono">${c.motDePasse}</dd></div>
        </dl>
        <p class="fiche-acces__note">Tu choisiras ton propre mot de passe à la première connexion.</p>
      </div>`,
    ),
  );
  document.body.classList.add('impression-fiches');
  window.addEventListener('afterprint', () => document.body.classList.remove('impression-fiches'), { once: true });
  window.print();
}

function tableauIdentifiants(comptes) {
  return html`<div class="table-defilante">
    <table class="tableau">
      <thead><tr><th scope="col">Nom</th><th scope="col">Identifiant</th><th scope="col">Mot de passe provisoire</th></tr></thead>
      <tbody>
        ${comptes.map(
          (c) => html`<tr><th scope="row">${c.nomComplet}</th><td class="mono">${c.identifiant}</td><td class="mono mdp">${c.motDePasse}</td></tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

const texteIdentifiants = (comptes) =>
  comptes.map((c) => `${c.nomComplet} — identifiant : ${c.identifiant} — mot de passe provisoire : ${c.motDePasse}`).join('\n');

// Affiche des identifiants tout juste générés, avec copie, CSV et impression.
function rendreIdentifiants(zone, racine, comptes, message) {
  monter(
    zone,
    html`<div class="resultat-creation">
      <p class="alerte-or">${icone('cadenas')} <span>${message} <strong>Note-les maintenant : ils ne seront plus affichés.</strong></span></p>
      ${tableauIdentifiants(comptes)}
      <div class="groupe-boutons">
        <button type="button" class="btn btn--petit btn--secondaire" data-copier>${icone('copier')} Copier</button>
        <button type="button" class="btn btn--petit btn--secondaire" data-csv>${icone('telecharger')} Télécharger (CSV)</button>
        <button type="button" class="btn btn--petit" data-fiches>${icone('imprimer')} Imprimer les fiches</button>
      </div>
    </div>`,
  );
  zone.querySelector('[data-copier]').addEventListener('click', () => copier(texteIdentifiants(comptes)));
  zone.querySelector('[data-csv]').addEventListener('click', () => telechargerCsv(comptes));
  zone.querySelector('[data-fiches]').addEventListener('click', () => imprimerFiches(racine, comptes));
}

// --- Onglet Comptes -------------------------------------------------------------------------

function statutCompte(c) {
  if (c.role === 'admin') return html`<span class="puce puce--or">Organisateur</span>`;
  if (c.motDePasseProvisoire) return html`<span class="puce puce--alerte">Pas encore connecté</span>`;
  if (c.certificat === 'signe') return html`<span class="puce puce--succes">${icone('verifie')} Certificat signé</span>`;
  if (c.certificat === 'ancien') return html`<span class="puce puce--alerte">Doit re-signer</span>`;
  return html`<span class="puce">Certificat à signer</span>`;
}

function ligneCompte(c, moi) {
  return html`<tr data-compte="${c.id}" data-nom="${c.nomComplet}" data-identifiant="${c.identifiant}">
    <th scope="row">${c.nomComplet || '—'}</th>
    <td class="mono">@${c.identifiant}</td>
    <td>${statutCompte(c)}</td>
    <td class="mono">${c.role === 'admin' ? '—' : `${c.nbCartes}/${LIMITE_CARTES}`}${c.nbMasquees > 0 && html` <span class="texte-danger">(${c.nbMasquees} masquée${c.nbMasquees > 1 ? 's' : ''})</span>`}</td>
    <td class="mono">${c.nbSignalements}</td>
    <td>${c.derniereConnexion ? formatDate(c.derniereConnexion, { dateStyle: 'short' }) : html`<span class="discret">jamais</span>`}</td>
    <td>
      <div class="actions-ligne">
        <button type="button" class="btn-icone" data-action="renommer" title="Corriger le nom" aria-label="Corriger le nom de ${c.nomComplet}">${icone('crayon')}</button>
        ${c.identifiant !== moi &&
        html`<button type="button" class="btn-icone" data-action="mot-de-passe" title="Nouveau mot de passe provisoire" aria-label="Nouveau mot de passe pour ${c.nomComplet}">${icone('cadenas')}</button>
          <button type="button" class="btn-icone btn-icone--danger" data-action="supprimer" title="Supprimer le compte" aria-label="Supprimer le compte de ${c.nomComplet}">${icone('poubelle')}</button>`}
      </div>
    </td>
  </tr>`;
}

// « Prénom Nom » ou « Prénom Nom ; identifiant », une personne par ligne.
function lireListe(texte) {
  return texte
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [nomComplet, identifiant = ''] = l.split(/[;\t]/).map((x) => x.trim());
      return { nomComplet, identifiant };
    });
}

async function ongletComptes(zone, racine) {
  const comptes = await api('/admin/comptes');
  if (zone.childElementCount > 0) rafraichirEntete();
  const moi = etat.serveur.utilisateur.identifiant;
  const participants = comptes.filter((c) => c.role === 'participant');

  monter(
    zone,
    html`<section class="panneau panneau--hud">
        <h2>Créer des comptes</h2>
        <p class="discret">
          Seules les personnes que tu ajoutes ici pourront se connecter. Une personne par ligne : <strong>Prénom Nom</strong>.
          L’identifiant est créé automatiquement (camille.martin) ; pour le choisir, écris <strong>Prénom Nom ; identifiant</strong>.
          Chaque compte reçoit un mot de passe provisoire, à changer à la première connexion.
        </p>
        <form class="creation-comptes" novalidate>
          <div class="champ">
            <div class="champ__ligne">
              <label for="liste-comptes">Participants à ajouter</label>
              <span class="compteur" data-nb-lignes>0 personne</span>
            </div>
            <textarea id="liste-comptes" name="liste" rows="6" spellcheck="false" placeholder="Camille Martin&#10;Léa Bernard&#10;Hugo Roux ; hugo.r"></textarea>
          </div>
          <div class="creation-comptes__pied">
            <fieldset>
              <legend class="sr-only">Rôle</legend>
              <div class="segments">
                <label><input type="radio" name="role" value="participant" checked /><span>Participants</span></label>
                <label><input type="radio" name="role" value="admin" /><span>Organisateurs</span></label>
              </div>
            </fieldset>
            <button class="btn" type="submit">${icone('plus')} Créer les comptes</button>
          </div>
          <div class="erreur-formulaire" role="alert"></div>
        </form>
        <div data-resultat></div>
      </section>

      <section class="panneau">
        <div class="panneau__titre">
          <h2>${pluriel(comptes.length, 'compte')}</h2>
          <div class="champ champ--compact">
            <label for="recherche-comptes" class="sr-only">Rechercher un compte</label>
            <input id="recherche-comptes" type="search" placeholder="Rechercher…" />
          </div>
        </div>
        <p class="discret petit">
          ${participants.filter((c) => c.motDePasseProvisoire).length} participant(s) pas encore connecté(s) ·
          ${participants.filter((c) => c.certificat === 'signe').length} certificat(s) signé(s).
          Mot de passe oublié : ${icone('cadenas', 'icone-texte')} donne un nouveau mot de passe provisoire.
        </p>
        <div class="table-defilante">
          <table class="tableau tableau--comptes">
            <thead>
              <tr>
                <th scope="col">Personne</th><th scope="col">Identifiant</th><th scope="col">Statut</th>
                <th scope="col">Cartes</th><th scope="col" title="Signalements faits par cette personne">Signal. faits</th>
                <th scope="col">Dernière connexion</th><th scope="col"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>${comptes.map((c) => ligneCompte(c, moi))}</tbody>
          </table>
        </div>
      </section>`,
  );

  const form = zone.querySelector('.creation-comptes');
  const compteur = zone.querySelector('[data-nb-lignes]');
  form.liste.addEventListener('input', () => {
    const n = lireListe(form.liste.value).length;
    compteur.textContent = pluriel(n, 'personne');
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erreur = form.querySelector('.erreur-formulaire');
    erreur.textContent = '';
    const liste = lireListe(form.liste.value);
    if (liste.length === 0) {
      erreur.textContent = 'Écris au moins un nom.';
      return;
    }
    const role = form.querySelector('input[name=role]:checked').value;
    await pendant(form.querySelector('[type=submit]'), async () => {
      try {
        const { comptes: crees } = await api('/admin/comptes', { methode: 'POST', corps: { comptes: liste, role } });
        await ongletComptes(zone, racine);
        rendreIdentifiants(
          zone.querySelector('[data-resultat]'),
          racine,
          crees,
          `${pluriel(crees.length, 'compte')} ${crees.length > 1 ? 'créés' : 'créé'}.`,
        );
        toast(`${pluriel(crees.length, 'compte')} ${crees.length > 1 ? 'créés' : 'créé'}.`);
      } catch (err) {
        erreur.textContent = err.message;
      }
    });
  });

  zone.querySelector('#recherche-comptes').addEventListener('input', (ev) => {
    const q = normaliser(ev.target.value.trim());
    for (const tr of zone.querySelectorAll('tbody tr[data-compte]')) {
      tr.hidden = Boolean(q) && !normaliser(`${tr.dataset.nom} ${tr.dataset.identifiant}`).includes(q);
    }
  });

  zone.querySelector('tbody').addEventListener('click', async (ev) => {
    const bouton = ev.target.closest('[data-action]');
    if (!bouton) return;
    const tr = bouton.closest('tr');
    const { compte: id, nom, identifiant } = tr.dataset;
    const action = bouton.dataset.action;
    try {
      if (action === 'renommer') {
        const d = ouvrirDialogue({
          titre: 'Corriger le nom',
          contenu: html`<form class="pile" novalidate>
            <div class="champ">
              <label for="nouveau-nom">Prénom et nom de @${identifiant}</label>
              <input id="nouveau-nom" name="nom" type="text" maxlength="80" value="${nom}" />
              <span class="champ__aide">Corrigé aussi sur son certificat et dans le registre.</span>
            </div>
            <div class="erreur-formulaire" role="alert"></div>
          </form>`,
          actions: html`<button type="button" class="btn btn--secondaire" data-fermer>Annuler</button>
            <button type="button" class="btn" data-ok>Enregistrer</button>`,
        });
        const valider = async () => {
          try {
            await api(`/admin/comptes/${id}`, { methode: 'PATCH', corps: { nomComplet: d.querySelector('[name=nom]').value } });
            d.close();
            toast('Nom corrigé.');
            await ongletComptes(zone, racine);
          } catch (err) {
            d.querySelector('.erreur-formulaire').textContent = err.message;
          }
        };
        d.querySelector('[data-ok]').addEventListener('click', valider);
        d.querySelector('form').addEventListener('submit', (e) => {
          e.preventDefault();
          valider();
        });
      } else if (action === 'mot-de-passe') {
        const ok = await confirmer({
          titre: 'Nouveau mot de passe ?',
          message: `${nom} (@${identifiant}) recevra un nouveau mot de passe provisoire et sera déconnecté(e). L’ancien ne fonctionnera plus.`,
          bouton: 'Générer',
        });
        if (!ok) return;
        const { motDePasse } = await api(`/admin/comptes/${id}/mot-de-passe`, { methode: 'POST', corps: {} });
        const compte = { nomComplet: nom, identifiant, motDePasse };
        const d = ouvrirDialogue({ titre: 'Nouveau mot de passe provisoire', contenu: html`<div data-resultat></div>` });
        rendreIdentifiants(d.querySelector('[data-resultat]'), racine, [compte], `Mot de passe réinitialisé pour ${nom}.`);
        d.addEventListener('close', () => ongletComptes(zone, racine).catch(() => {}));
      } else if (action === 'supprimer') {
        const ok = await confirmer({
          titre: 'Supprimer ce compte ?',
          message: `Le compte de ${nom} (@${identifiant}), ses cartes, ses signalements et son certificat seront supprimés définitivement.`,
          bouton: 'Supprimer',
          danger: true,
        });
        if (!ok) return;
        await api(`/admin/comptes/${id}`, { methode: 'DELETE' });
        toast('Compte supprimé.');
        await ongletComptes(zone, racine);
      }
    } catch (err) {
      toast(err.message, 'erreur');
    }
  });
}

// --- Onglets Signalements et Cartes -----------------------------------------------------------

function actionsCarte(c) {
  return html`<div class="groupe-boutons" data-carte="${c.id}" data-nom="${c.nom}">
    ${c.statut === 'visible'
      ? html`<button type="button" class="btn btn--petit btn--secondaire" data-action="masquer">${icone('masquer')} Masquer</button>`
      : html`<button type="button" class="btn btn--petit btn--secondaire" data-action="retablir">${icone('oeil')} Réafficher</button>`}
    ${c.statut === 'visible' && (c.nbSignalements > 0 || c.signalements?.length > 0) &&
    html`<button type="button" class="btn btn--petit btn--secondaire" data-action="retablir">${icone('verifie')} Classer les signalements</button>`}
    <button type="button" class="btn btn--petit btn--danger" data-action="supprimer">${icone('poubelle')} Supprimer</button>
  </div>`;
}

function puceStatut(c) {
  if (c.statut === 'visible') return html`<span class="puce puce--succes">Visible</span>`;
  return html`<span class="puce puce--danger">${c.masqueePar === 'organisation' ? 'Masquée par l’organisation' : 'Masquée automatiquement'}</span>`;
}

// Gestion commune des boutons Masquer / Réafficher / Supprimer.
function brancherActionsCartes(zone, recharger) {
  zone.addEventListener('click', async (ev) => {
    const bouton = ev.target.closest('[data-action]');
    const bloc = bouton?.closest('[data-carte]');
    if (!bloc) return;
    const { carte: id, nom } = bloc.dataset;
    try {
      if (bouton.dataset.action === 'masquer') {
        await api(`/admin/cartes/${id}/masquer`, { methode: 'POST', corps: {} });
        toast(`« ${nom} » est masquée.`);
      } else if (bouton.dataset.action === 'retablir') {
        await api(`/admin/cartes/${id}/retablir`, { methode: 'POST', corps: {} });
        toast(`« ${nom} » est visible, signalements classés.`);
      } else if (bouton.dataset.action === 'supprimer') {
        const ok = await confirmer({
          titre: 'Supprimer la carte ?',
          message: `« ${nom} » sera supprimée définitivement et libérera une place à son auteur.`,
          bouton: 'Supprimer',
          danger: true,
        });
        if (!ok) return;
        await api(`/admin/cartes/${id}`, { methode: 'DELETE' });
        toast('Carte supprimée.');
      } else {
        return;
      }
      await recharger();
    } catch (err) {
      toast(err.message, 'erreur');
    }
  });
}

async function ongletSignalements(zone) {
  const { seuil, cartes } = await api('/admin/signalements');
  monter(
    zone,
    html`<p class="discret">
        Une carte est masquée automatiquement à ${pluriel(seuil, 'signalement')} (réglable dans Paramètres).
        <strong>Masquer</strong> retire la carte de la galerie, <strong>Classer les signalements</strong> ou <strong>Réafficher</strong>
        écartent les signalements actuels (leurs auteurs ne pourront pas re-signaler), <strong>Supprimer</strong> est définitif.
      </p>
      ${cartes.length === 0
        ? html`<div class="vide"><p>Aucun signalement en cours. Ciel dégagé.</p></div>`
        : html`<ul class="liste-admin">
            ${cartes.map(
              (c) => html`<li class="panneau admin-carte">
                ${rendreCarte({ ...c, statut: 'visible' }, { largeur: 200 })}
                <div class="admin-carte__infos">
                  <div class="groupe-boutons">
                    ${puceStatut(c)}
                    <span class="puce">${c.signalements.length} / ${seuil} signalements</span>
                    <span class="puce mono">par @${c.auteur}</span>
                  </div>
                  ${c.signalements.length
                    ? html`<ul class="liste-signalements">
                        ${c.signalements.map(
                          (s) => html`<li>
                            <strong>${nomMotif(s.motif)}</strong>
                            <span class="discret petit">· ${s.nomPar || `@${s.par}`}, le ${formatDate(s.le)}</span>
                            ${s.commentaire && html`<p>« ${s.commentaire} »</p>`}
                          </li>`,
                        )}
                      </ul>`
                    : html`<p class="discret petit">Pas de signalement actif.</p>`}
                  ${actionsCarte(c)}
                </div>
              </li>`,
            )}
          </ul>`}`,
  );
}

async function ongletCartes(zone) {
  const cartes = await api('/admin/cartes');
  const filtres = { filiere: 'toutes', statut: 'toutes', q: '' };
  monter(
    zone,
    html`<div class="barre-filtres panneau">
        <div class="filtres-filieres" role="group" aria-label="Filtrer par filière">
          <button type="button" class="filtre" data-filiere="toutes" aria-pressed="true">Toutes</button>
          ${FILIERES.map(
            (f) => html`<button type="button" class="filtre" data-filiere="${f.id}" aria-pressed="false" style="--c:${f.couleur}">
              <span class="pastille-filiere"></span>${f.nom}
            </button>`,
          )}
        </div>
        <div class="filtres-ligne">
          <div class="champ champ--compact">
            <label for="adm-recherche" class="sr-only">Rechercher</label>
            <input id="adm-recherche" type="search" placeholder="Rechercher un nom de carte ou un auteur…" />
          </div>
          <div class="champ champ--compact">
            <label for="adm-statut" class="sr-only">Statut</label>
            <select id="adm-statut">
              <option value="toutes">Tous les statuts</option>
              <option value="visible">Visibles</option>
              <option value="masquee">Masquées</option>
              <option value="signalee">Avec signalements</option>
            </select>
          </div>
        </div>
      </div>
      <p class="resultat-galerie mono" aria-live="polite"></p>
      <div class="grille-admin"></div>`,
  );
  const grille = zone.querySelector('.grille-admin');
  const resultat = zone.querySelector('.resultat-galerie');
  const rendre = () => {
    const q = normaliser(filtres.q.trim());
    const liste = cartes.filter(
      (c) =>
        (filtres.filiere === 'toutes' || c.filiere === filtres.filiere) &&
        (filtres.statut === 'toutes' ||
          (filtres.statut === 'signalee' ? c.nbSignalements > 0 : c.statut === filtres.statut)) &&
        (!q || normaliser(`${c.nom} ${c.auteur} ${c.sousTitre}`).includes(q)),
    );
    resultat.textContent = pluriel(liste.length, 'carte');
    monter(
      grille,
      liste.length
        ? liste.map(
            (c) => html`<div class="carte-admin">
              ${rendreCarte({ ...c, statut: 'visible' }, { largeur: 200 })}
              <div class="groupe-boutons carte-admin__infos">
                ${puceStatut(c)}
                ${c.nbSignalements > 0 && html`<span class="puce puce--alerte">${icone('drapeau')} ${c.nbSignalements}</span>`}
              </div>
              ${actionsCarte(c)}
            </div>`,
          )
        : html`<div class="vide grille-cartes__vide"><p>Aucune carte ne correspond.</p></div>`,
    );
  };
  zone.querySelector('.filtres-filieres').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-filiere]');
    if (!b) return;
    filtres.filiere = b.dataset.filiere;
    zone.querySelectorAll('[data-filiere]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    rendre();
  });
  zone.querySelector('#adm-recherche').addEventListener('input', (ev) => {
    filtres.q = ev.target.value;
    rendre();
  });
  zone.querySelector('#adm-statut').addEventListener('change', (ev) => {
    filtres.statut = ev.target.value;
    rendre();
  });
  rendre();
}

// --- Onglet Paramètres ---------------------------------------------------------------------------

const deux = (n) => String(n).padStart(2, '0');
function versChampDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}`;
}
const depuisChampDate = (v) => (v ? new Date(v).toISOString() : null);

const LIBELLES_STATUT = { 'a-venir': 'À venir', ouverte: 'Ouverte', terminee: 'Terminée' };

async function ongletParametres(zone) {
  const p = await api('/admin/parametres');
  monter(
    zone,
    html`<div class="grille-2">
      <form class="panneau panneau--hud" novalidate>
        <h2>Campagne de création</h2>
        <p class="discret petit">Statut actuel : <strong>${LIBELLES_STATUT[p.statut]}</strong>. Heures de ton appareil.</p>
        <div class="champ">
          <label for="par-debut">Ouverture</label>
          <input id="par-debut" name="debut" type="datetime-local" value="${versChampDate(p.campagneDebut)}" />
        </div>
        <div class="champ">
          <label for="par-fin">Clôture</label>
          <input id="par-fin" name="fin" type="datetime-local" value="${versChampDate(p.campagneFin)}" />
          <span class="champ__aide">Laisser vide : pas de limite. Après la clôture, plus de création ni de modification.</span>
        </div>
        <button type="button" class="btn btn--petit btn--secondaire" data-semaine>Ouvrir maintenant pour 7 jours</button>
        <hr class="separateur" />
        <div class="champ">
          <label for="par-seuil">Seuil de masquage automatique</label>
          <input id="par-seuil" name="seuil" type="number" min="1" max="50" step="1" value="${p.seuilSignalements}" />
          <span class="champ__aide">Nombre de signalements (de personnes différentes) qui masquent une carte.</span>
        </div>
        <div class="champ">
          <label for="par-promo">Nom de la promo</label>
          <input id="par-promo" name="promo" type="text" maxlength="40" value="${p.promo}" placeholder="Ex. Promo 2026" />
          <span class="champ__aide">Imprimé en bas de chaque carte.</span>
        </div>
        <div class="erreur-formulaire" role="alert"></div>
        <button class="btn" type="submit">Enregistrer</button>
      </form>

      <section class="panneau">
        <h2>Préparer la phase 2</h2>
        <p>Exporte toutes les cartes visibles (avec leurs images) dans un fichier JSON, pour les importer dans le jeu.</p>
        <a class="btn btn--secondaire" href="/api/admin/export" download>${icone('telecharger')} Exporter les cartes (JSON)</a>
      </section>
    </div>`,
  );
  const form = zone.querySelector('form');
  zone.querySelector('[data-semaine]').addEventListener('click', () => {
    const debut = new Date();
    debut.setSeconds(0, 0);
    form.debut.value = versChampDate(debut.toISOString());
    form.fin.value = versChampDate(new Date(debut.getTime() + 7 * 24 * 3600 * 1000).toISOString());
    toast('Dates remplies : pense à enregistrer.');
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erreur = form.querySelector('.erreur-formulaire');
    erreur.textContent = '';
    await pendant(form.querySelector('[type=submit]'), async () => {
      try {
        const r = await api('/admin/parametres', {
          methode: 'PUT',
          corps: {
            campagneDebut: depuisChampDate(form.debut.value),
            campagneFin: depuisChampDate(form.fin.value),
            seuilSignalements: Number(form.seuil.value),
            promo: form.promo.value,
          },
        });
        await actualiser();
        toast(r.masquees > 0 ? `Paramètres enregistrés. ${pluriel(r.masquees, 'carte')} masquée(s) avec le nouveau seuil.` : 'Paramètres enregistrés.');
        await ongletParametres(zone);
      } catch (err) {
        erreur.textContent = err.message;
      }
    });
  });
}

// --- Onglet Personnalisation : textes du site -----------------------------------------------------

function apercuTexte(champ, valeur) {
  const rendu = formater(valeur, { enLigne: champ.type === 'ligne' });
  return rendu || html`<span class="discret">Vide : rien ne s’affiche.</span>`;
}

function champPerso(champ, valeur, defaut) {
  const id = `perso-${champ.cle.replace(/\./g, '-')}`;
  const lignes = valeur.split('\n').length + Math.floor(valeur.length / 90);
  return html`<div class="champ champ-perso ${valeur !== defaut ? 'est-personnalise' : ''}" data-cle="${champ.cle}">
    <div class="champ__ligne">
      <label for="${id}">${champ.libelle}${champ.obligatoire && html` <span aria-hidden="true">*</span>`}</label>
      <span class="champ-perso__etat">
        <span class="puce puce--or champ-perso__badge">Personnalisé</span>
        <span class="compteur" data-compteur>${[...valeur].length}/${champ.max}</span>
      </span>
    </div>
    ${champ.type === 'texte'
      ? html`<textarea id="${id}" name="${champ.cle}" maxlength="${champ.max}" rows="${Math.min(10, Math.max(3, lignes + 1))}">${valeur}</textarea>`
      : html`<input id="${id}" name="${champ.cle}" type="text" maxlength="${champ.max}" value="${valeur}" />`}
    ${champ.aide && html`<span class="champ__aide">${champ.aide}</span>`}
    <div class="champ-perso__pied">
      <div class="apercu-texte texte-riche" data-apercu aria-label="Aperçu">${apercuTexte(champ, valeur)}</div>
      <button type="button" class="lien-bouton" data-retablir>Texte d’origine</button>
    </div>
  </div>`;
}

async function ongletPersonnalisation(zone) {
  const { valeurs, defauts } = await api('/admin/personnalisation');
  monter(
    zone,
    html`<section class="panneau panneau--hud aide-perso">
        <h2>Personnaliser le site</h2>
        <p>Modifie les textes vus par les participants sans toucher au code. Ils changent pour tout le monde dès l’enregistrement.</p>
        <div class="aide-perso__grille">
          <div>
            <h3 class="petit-titre">Mise en forme</h3>
            <ul class="memo">
              <li><code>**gras**</code> → <strong>gras</strong></li>
              <li><code>*italique*</code> → <em>italique</em></li>
              <li><code>[texte](https://…)</code> → un lien</li>
              <li><code>- </code> en début de ligne → une liste</li>
              <li>une ligne vide → un nouveau paragraphe</li>
            </ul>
          </div>
          <div>
            <h3 class="petit-titre">Variables (mises à jour automatiquement)</h3>
            <ul class="memo">
              ${VARIABLES.map((v) => html`<li><code>{${v.nom}}</code> → ${formater(`{${v.nom}}`, { enLigne: true }) || '—'} <span class="discret">(${v.aide})</span></li>`)}
            </ul>
          </div>
        </div>
      </section>
      <form class="personnalisation pile" novalidate>
        ${SECTIONS_TEXTES.map(
          (section) => html`<fieldset class="panneau">
            <legend class="panneau__legende">${section.titre}</legend>
            ${section.champs.map((champ) => champPerso(champ, valeurs[champ.cle], defauts[champ.cle]))}
          </fieldset>`,
        )}
        <div class="barre-enregistrement">
          <span class="barre-enregistrement__etat" data-modifs aria-live="polite">Aucune modification en cours.</span>
          <div class="erreur-formulaire" role="alert"></div>
          <button type="button" class="btn btn--secondaire" data-annuler disabled>Annuler</button>
          <button type="submit" class="btn" disabled>Enregistrer</button>
        </div>
      </form>`,
  );

  const form = zone.querySelector('form');
  const etatModifs = form.querySelector('[data-modifs]');
  const boutonEnregistrer = form.querySelector('[type=submit]');
  const boutonAnnuler = form.querySelector('[data-annuler]');

  const lireValeurs = () => Object.fromEntries([...form.querySelectorAll('[name]')].map((el) => [el.name, el.value]));
  const modifications = () => Object.entries(lireValeurs()).filter(([cle, v]) => v !== valeurs[cle]).length;

  function majChamp(bloc) {
    const champ = champTexte(bloc.dataset.cle);
    const valeur = bloc.querySelector('[name]').value;
    bloc.querySelector('[data-compteur]').textContent = `${[...valeur].length}/${champ.max}`;
    monter(bloc.querySelector('[data-apercu]'), apercuTexte(champ, valeur));
    bloc.classList.toggle('est-personnalise', valeur.trim() !== defauts[champ.cle]);
    bloc.classList.toggle('est-modifie', valeur !== valeurs[champ.cle]);
  }

  function majBarre() {
    const n = modifications();
    etatModifs.textContent = n ? `${n} texte${n > 1 ? 's' : ''} modifié${n > 1 ? 's' : ''}, pas encore enregistré${n > 1 ? 's' : ''}.` : 'Aucune modification en cours.';
    form.classList.toggle('a-des-modifs', n > 0);
    boutonEnregistrer.disabled = n === 0;
    boutonAnnuler.disabled = n === 0;
  }

  form.addEventListener('input', (ev) => {
    const bloc = ev.target.closest('[data-cle]');
    if (!bloc) return;
    majChamp(bloc);
    majBarre();
  });

  form.addEventListener('click', (ev) => {
    const bouton = ev.target.closest('[data-retablir]');
    if (!bouton) return;
    const bloc = bouton.closest('[data-cle]');
    const entree = bloc.querySelector('[name]');
    entree.value = defauts[bloc.dataset.cle];
    majChamp(bloc);
    majBarre();
    entree.focus();
  });

  boutonAnnuler.addEventListener('click', () => ongletPersonnalisation(zone));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erreur = form.querySelector('.erreur-formulaire');
    erreur.textContent = '';
    await pendant(boutonEnregistrer, async () => {
      try {
        await api('/admin/personnalisation', { methode: 'PUT', corps: { valeurs: lireValeurs() } });
        await actualiser();
        toast('Textes enregistrés : le site est à jour.');
        await ongletPersonnalisation(zone);
      } catch (err) {
        erreur.textContent = err.message;
        majBarre();
      }
    });
  });

  // Avertit avant de quitter la page avec des textes non enregistrés.
  const avantDepart = (ev) => {
    if (!form.isConnected || modifications() === 0) return;
    ev.preventDefault();
    ev.returnValue = '';
  };
  window.addEventListener('beforeunload', avantDepart);
  return () => window.removeEventListener('beforeunload', avantDepart);
}

// --- Page ----------------------------------------------------------------------------------------

// Remet à jour les chiffres de l'en-tête après une action sur les comptes.
let rafraichirEntete = async () => {};

const AFFICHEURS = {
  comptes: ongletComptes,
  signalements: ongletSignalements,
  cartes: ongletCartes,
  parametres: ongletParametres,
  personnalisation: ongletPersonnalisation,
};

function enteteResume(resume, onglet) {
  const badges = { comptes: resume.comptes, signalements: resume.aTraiter, cartes: resume.cartes };
  return html`<div class="entete-page">
      <div>
        <p class="surtitre">Espace organisateurs</p>
        <h1>Organisation</h1>
        <p>
          ${pluriel(resume.comptes, 'participant')}, dont ${resume.enAttente} pas encore connecté(s) ·
          ${resume.certificats} certificat(s) signé(s) · ${pluriel(resume.cartes, 'carte')}${resume.masquees > 0 ? `, ${resume.masquees} masquée(s)` : ''}.
        </p>
      </div>
    </div>
    <nav class="onglets onglets--admin" aria-label="Sections">
      ${ONGLETS.map(
        (o) => html`<a href="#/admin/${o.id}" ${o.id === onglet ? html`aria-current="page"` : ''}>
          ${o.nom}${badges[o.id] !== undefined &&
          html`<span class="nav__badge ${o.id === 'signalements' && badges[o.id] > 0 ? 'nav__badge--alerte' : ''}">${badges[o.id]}</span>`}
        </a>`,
      )}
    </nav>`;
}

export async function afficher(racine, onglet = 'comptes') {
  const resume = await api('/admin/resume');
  monter(
    racine,
    html`<div class="admin__entete">${enteteResume(resume, onglet)}</div>
      <div class="admin__contenu pile"></div>
      <div class="fiches-impression" aria-hidden="true"></div>`,
  );
  const entete = racine.querySelector('.admin__entete');
  rafraichirEntete = async () => {
    try {
      monter(entete, enteteResume(await api('/admin/resume'), onglet));
    } catch {}
  };
  const zone = racine.querySelector('.admin__contenu');
  if (onglet === 'signalements' || onglet === 'cartes') {
    const recharger = () => naviguer(`/admin/${onglet}`);
    brancherActionsCartes(zone, recharger);
  }
  // Sur mobile, les onglets défilent : on amène l'onglet actif à l'écran une fois la page affichée.
  setTimeout(() => racine.querySelector('.onglets--admin [aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'center' }), 0);
  // Un onglet peut renvoyer une fonction de nettoyage (appelée en quittant la page).
  return AFFICHEURS[onglet](zone, racine);
}
