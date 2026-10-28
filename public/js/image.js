// Prépare une image dans le navigateur avant l'envoi : redimensionnée (900 px max),
// réencodée en JPEG. Ça allège l'envoi et supprime les métadonnées (position GPS…).
const COTE_MAX = 900;
const POIDS_MAX = 1_300_000; // octets, sous la limite serveur de 1,5 Mo

export async function preparerImage(fichier) {
  if (!fichier.type.startsWith('image/')) throw new Error('Choisis un fichier image (JPEG, PNG, WebP…).');
  if (fichier.size > 25 * 1024 * 1024) throw new Error('Image trop lourde (25 Mo maximum avant compression).');
  let source;
  try {
    source = await createImageBitmap(fichier);
  } catch {
    throw new Error('Impossible de lire cette image. Essaie un JPEG ou un PNG.');
  }
  const ratio = Math.min(1, COTE_MAX / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * ratio);
  canvas.height = Math.round(source.height * ratio);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0c1a33';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  let qualite = 0.86;
  let url = canvas.toDataURL('image/jpeg', qualite);
  while (url.length * 0.75 > POIDS_MAX && qualite > 0.4) {
    qualite -= 0.12;
    url = canvas.toDataURL('image/jpeg', qualite);
  }
  return url;
}
