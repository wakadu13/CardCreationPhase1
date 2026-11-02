// Petits sons synthétisés (aucun fichier audio) : jeton qui claque, main jouée, mise passée.
// Désactivés par défaut ; le réglage est mémorisé dans le navigateur.

const CLE = 'as-de-salon:sons';
let contexte = null;

export function sonsActifs() {
  try {
    return localStorage.getItem(CLE) === '1';
  } catch {
    return false;
  }
}

export function activerSons(actif) {
  try {
    localStorage.setItem(CLE, actif ? '1' : '0');
  } catch {}
  if (actif) jouerSon('jeton');
}

function note(ctx, { frequence, duree, type = 'square', volume = 0.08, depart = 0, glissando = 0 }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequence, ctx.currentTime + depart);
  if (glissando) osc.frequency.exponentialRampToValueAtTime(glissando, ctx.currentTime + depart + duree);
  gain.gain.setValueAtTime(volume, ctx.currentTime + depart);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + depart + duree);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + depart);
  osc.stop(ctx.currentTime + depart + duree + 0.02);
}

const SONS = {
  jeton: (ctx) => note(ctx, { frequence: 1800, duree: 0.06, type: 'triangle', volume: 0.12, glissando: 900 }),
  main: (ctx) => {
    note(ctx, { frequence: 440, duree: 0.09, depart: 0 });
    note(ctx, { frequence: 660, duree: 0.09, depart: 0.08 });
    note(ctx, { frequence: 880, duree: 0.14, depart: 0.16 });
  },
  victoire: (ctx) => {
    [523, 659, 784, 1047].forEach((f, i) => note(ctx, { frequence: f, duree: 0.18, depart: i * 0.11, volume: 0.1 }));
  },
  defaite: (ctx) => {
    note(ctx, { frequence: 300, duree: 0.25, type: 'sawtooth', volume: 0.07, glissando: 120 });
  },
  defausse: (ctx) => note(ctx, { frequence: 220, duree: 0.08, type: 'triangle', volume: 0.08, glissando: 160 }),
};

export function jouerSon(nom) {
  if (!sonsActifs() || !SONS[nom]) return;
  try {
    contexte ??= new (window.AudioContext || window.webkitAudioContext)();
    if (contexte.state === 'suspended') contexte.resume();
    SONS[nom](contexte);
  } catch {}
}
