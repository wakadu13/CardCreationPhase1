import { api } from './api.js';
import { etat, formatRebours, rafraichirEtat, statutCampagne, utilisateur } from './etat.js';
import { html, monter } from './html.js';
import { icone, logo } from './icones.js';
import { enLigne, texte } from './textes.js';
import { chargement, toast } from './ui.js';

// acces : public · premier-vol (mot de passe provisoire) · connexion · certificat (participant) · admin
const ROUTES = [
  { motif: /^\/$/, page: 'accueil', acces: 'public' },
  { motif: /^\/regles$/, page: 'regles', acces: 'public' },
  { motif: /^\/premier-vol$/, page: 'premier-vol', acces: 'premier-vol' },
  { motif: /^\/certificat$/, page: 'certificat', acces: 'connexion' },
  { motif: /^\/compte$/, page: 'compte', acces: 'connexion' },
  { motif: /^\/hangar$/, page: 'hangar', acces: 'certificat' },
  { motif: /^\/atelier(?:\/(\d+))?$/, page: 'atelier', acces: 'certificat' },
  { motif: /^\/galerie$/, page: 'galerie', acces: 'certificat' },
  { motif: /^\/registre$/, page: 'registre', acces: 'certificat' },
  { motif: /^\/admin(?:\/(comptes|signalements|cartes|parametres|personnalisation))?$/, page: 'admin', acces: 'admin' },
];

// Page d'arrivée selon le profil.
function accueilDe(u) {
  if (!u) return '/';
  if (u.doitChangerMdp) return '/premier-vol';
  if (u.estAdmin) return '/admin';
  return u.certificatValide ? '/hangar' : '/certificat';
}

let nettoyage = null;
let numeroRoute = 0;

export function naviguer(chemin) {
  if (location.hash === `#${chemin}`) afficherRoute();
  else location.hash = chemin;
}

// Recharge l'état (après connexion, signature, création de carte…) et redessine l'en-tête.
export async function actualiser() {
  await rafraichirEtat();
  rendreBarre();
}

function cheminCourant() {
  return location.hash.replace(/^#/, '') || '/';
}

function lienNav(chemin, texte, pageActive, extra = '') {
  const actif = pageActive === chemin.split('/')[1] || (chemin === '/' && pageActive === 'accueil');
  return html`<a href="#${chemin}" ${actif ? html`aria-current="page"` : ''}>${texte}${extra}</a>`;
}

function rendreBarre(pageActive = ROUTES.find((r) => r.motif.test(cheminCourant()))?.page) {
  const u = utilisateur();
  const s = etat.serveur;
  let liens;
  const deconnexion = html`<button type="button" class="nav__lien" data-deconnexion>Déconnexion</button>`;
  if (!u) {
    liens = [lienNav('/regles', 'Règles', pageActive), lienNav('/', 'Connexion', pageActive)];
  } else if (u.doitChangerMdp) {
    liens = [lienNav('/premier-vol', 'Premier vol', pageActive), lienNav('/regles', 'Règles', pageActive), deconnexion];
  } else if (u.estAdmin) {
    liens = [
      lienNav('/admin', 'Organisation', pageActive),
      lienNav('/regles', 'Règles', pageActive),
      lienNav('/compte', 'Compte', pageActive),
      deconnexion,
    ];
  } else if (!u.certificatValide) {
    liens = [
      lienNav('/certificat', 'Certificat', pageActive),
      lienNav('/regles', 'Règles', pageActive),
      lienNav('/compte', 'Compte', pageActive),
      html`<button type="button" class="nav__lien" data-deconnexion>Déconnexion</button>`,
    ];
  } else {
    liens = [
      lienNav('/hangar', 'Hangar', pageActive, html`<span class="nav__badge">${u.nbCartes}/${s.limiteCartes}</span>`),
      lienNav('/galerie', 'Galerie', pageActive),
      lienNav('/registre', 'Registre', pageActive),
      lienNav('/regles', 'Règles', pageActive),
      lienNav('/compte', 'Compte', pageActive),
      html`<button type="button" class="nav__lien" data-deconnexion>Déconnexion</button>`,
    ];
  }
  monter(
    document.getElementById('barre'),
    html`<a class="marque" href="#/">
        ${logo()}
        <span><span class="marque__nom">${s.nomJeu}</span><span class="marque__sous">${texte('slogan')}</span></span>
      </a>
      <button type="button" class="btn btn--secondaire btn--petit nav__menu" aria-expanded="false" aria-controls="nav" data-menu>
        ${icone('menu')}<span class="sr-only">Menu</span>
      </button>
      <nav class="nav" id="nav" aria-label="Navigation principale">${liens}</nav>`,
  );
  rendreBandeau();
  rendreTextesCommuns();
}

// Annonce des organisateurs et pied de page (textes personnalisables).
function rendreTextesCommuns() {
  const annonce = document.getElementById('annonce');
  const contenu = enLigne('annonce');
  annonce.hidden = !contenu;
  monter(annonce, contenu ? html`<div class="annonce__contenu">${icone('megaphone')}<span>${contenu}</span></div>` : '');
  const pied = enLigne('piedDePage');
  monter(
    document.getElementById('pied-texte'),
    html`Projet étudiant non officiel${pied && html` · ${pied}`} · <a href="#/regles">règles du jeu</a>`,
  );
}

function rendreBandeau() {
  const c = etat.serveur.campagne;
  const statut = statutCampagne();
  let voyant = '';
  let texte = 'Campagne de création ouverte';
  let rebours = '';
  if (statut === 'a-venir') {
    voyant = 'voyant--attente';
    texte = 'Campagne de création : ouverture imminente';
    rebours = html`Ouverture dans <span class="mono" data-rebours="${c.debut}">${formatRebours(c.debut)}</span>`;
  } else if (statut === 'terminee') {
    voyant = 'voyant--arret';
    texte = 'Campagne de création terminée · place au jeu bientôt';
  } else if (c.fin) {
    rebours = html`Clôture dans <span class="mono" data-rebours="${c.fin}">${formatRebours(c.fin)}</span>`;
  }
  monter(
    document.getElementById('bandeau'),
    html`${etat.serveur.demo && html`<span class="badge-demo" title="Données fictives, remises à zéro à chaque mise à jour du site">Démonstration</span>`}
      <span class="bandeau__statut"><span class="voyant ${voyant}"></span>Phase 1 · ${texte}</span>
      ${rebours && html`<span>${rebours}</span>`}
      <span class="bandeau__coords">${etat.serveur.promo || 'Salon-de-Provence'} · Faire face</span>`,
  );
}

let statutAffiche = null;
setInterval(() => {
  if (!etat.serveur) return;
  for (const el of document.querySelectorAll('[data-rebours]')) el.textContent = formatRebours(el.dataset.rebours);
  const statut = statutCampagne();
  if (statutAffiche && statut !== statutAffiche) rendreBandeau();
  statutAffiche = statut;
}, 1000);

async function afficherRoute() {
  const chemin = cheminCourant();
  const route = ROUTES.find((r) => r.motif.test(chemin));
  if (!route) return naviguer('/');
  const u = utilisateur();
  if (route.acces !== 'public' && !u) return naviguer('/');
  if (u) {
    const arrivee = accueilDe(u);
    const autorise =
      route.acces === 'public'
        ? route.page !== 'accueil'
        : u.doitChangerMdp
          ? route.acces === 'premier-vol'
          : route.acces === 'connexion' ||
            (route.acces === 'admin' && u.estAdmin) ||
            (route.acces === 'certificat' && !u.estAdmin && u.certificatValide);
    if (!autorise && chemin !== arrivee) return naviguer(arrivee);
  }

  nettoyage?.();
  nettoyage = null;
  const numero = ++numeroRoute;
  const main = document.getElementById('contenu');
  rendreBarre(route.page);
  monter(main, chargement());
  try {
    const page = await import(`./pages/${route.page}.js`);
    if (numero !== numeroRoute) return;
    // Conteneur neuf à chaque page : les écouteurs de la page précédente disparaissent avec lui.
    const racine = document.createElement('div');
    racine.className = `page page--${route.page}`;
    document.title = `${page.titre} · ${etat.serveur.nomJeu}`;
    const resultat = await page.afficher(racine, ...chemin.match(route.motif).slice(1));
    if (numero !== numeroRoute) {
      if (typeof resultat === 'function') resultat();
      return;
    }
    main.replaceChildren(racine);
    nettoyage = typeof resultat === 'function' ? resultat : null;
  } catch (err) {
    if (numero !== numeroRoute) return;
    if (err?.status === 401 || ['certificat', 'mot-de-passe'].includes(err?.donnees?.code)) {
      await actualiser();
      return naviguer(accueilDe(utilisateur()));
    }
    console.error(err);
    monter(main, html`<div class="vide"><h2>Turbulences</h2><p>${err?.message ?? 'Erreur inattendue.'}</p>
      <a class="btn btn--secondaire" href="#/">Retour à l’accueil</a></div>`);
  }
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

document.addEventListener('click', async (ev) => {
  const menu = ev.target.closest('[data-menu]');
  if (menu) {
    const nav = document.getElementById('nav');
    const ouvert = nav.classList.toggle('est-ouverte');
    menu.setAttribute('aria-expanded', String(ouvert));
    return;
  }
  if (ev.target.closest('.nav a')) document.getElementById('nav')?.classList.remove('est-ouverte');
  if (ev.target.closest('[data-deconnexion]')) {
    try {
      await api('/deconnexion', { methode: 'POST', corps: {} });
    } catch {}
    await actualiser();
    toast('À bientôt au hangar !');
    naviguer('/');
  }
});

window.addEventListener('hashchange', afficherRoute);

async function demarrer() {
  const main = document.getElementById('contenu');
  monter(main, chargement('Mise en route des moteurs'));
  try {
    await rafraichirEtat();
  } catch (err) {
    monter(main, html`<div class="vide"><h2>Serveur injoignable</h2><p>${err.message}</p></div>`);
    return;
  }
  afficherRoute();
}

demarrer();
