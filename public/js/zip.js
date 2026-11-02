// Fabrication d'un fichier ZIP dans le navigateur, sans compression (les PNG sont déjà compressés).
// Suffit pour regrouper des images à télécharger d'un coup.

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(octets) {
  let c = 0xffffffff;
  for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dateDos(d = new Date()) {
  const heure = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { heure, date };
}

// fichiers : [{ nom: 'dossier/image.png', donnees: Uint8Array }] → Blob zip
export function fabriquerZip(fichiers) {
  const encodeur = new TextEncoder();
  const morceaux = [];
  const central = [];
  let decalage = 0;
  const { heure, date } = dateDos();

  for (const f of fichiers) {
    const nom = encodeur.encode(f.nom);
    const donnees = f.donnees;
    const crc = crc32(donnees);
    const entete = new DataView(new ArrayBuffer(30));
    entete.setUint32(0, 0x04034b50, true);
    entete.setUint16(4, 20, true);
    entete.setUint16(6, 0x0800, true); // noms en UTF-8
    entete.setUint16(8, 0, true); // stockage sans compression
    entete.setUint16(10, heure, true);
    entete.setUint16(12, date, true);
    entete.setUint32(14, crc, true);
    entete.setUint32(18, donnees.length, true);
    entete.setUint32(22, donnees.length, true);
    entete.setUint16(26, nom.length, true);
    entete.setUint16(28, 0, true);
    morceaux.push(entete.buffer, nom, donnees);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, heure, true);
    c.setUint16(14, date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, donnees.length, true);
    c.setUint32(24, donnees.length, true);
    c.setUint16(28, nom.length, true);
    c.setUint32(42, decalage, true);
    central.push(c.buffer, nom);
    decalage += 30 + nom.length + donnees.length;
  }

  const tailleCentral = central.reduce((s, m) => s + m.byteLength, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, fichiers.length, true);
  fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentral, true);
  fin.setUint32(16, decalage, true);
  return new Blob([...morceaux, ...central, fin.buffer], { type: 'application/zip' });
}

export function telechargerBlob(blob, nomFichier) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
