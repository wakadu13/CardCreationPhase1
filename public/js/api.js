export class ErreurApi extends Error {
  constructor(message, status, donnees) {
    super(message);
    this.status = status;
    this.donnees = donnees;
  }
}

export async function api(chemin, { methode = 'GET', corps } = {}) {
  const options = { method: methode, credentials: 'same-origin', headers: {} };
  if (corps !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(corps);
  }
  let reponse;
  try {
    reponse = await fetch(`/api${chemin}`, options);
  } catch {
    throw new ErreurApi('Connexion au serveur impossible. Vérifie ta connexion.', 0, null);
  }
  let donnees = null;
  try {
    donnees = await reponse.json();
  } catch {}
  if (!reponse.ok) throw new ErreurApi(donnees?.erreur ?? `Erreur ${reponse.status}`, reponse.status, donnees);
  return donnees;
}
