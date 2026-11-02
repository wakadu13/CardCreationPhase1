// Erreur « prévue » renvoyée telle quelle au navigateur.
export class ErreurClient extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function gestionnaireErreurs(err, _req, res, _next) {
  if (err instanceof ErreurClient) {
    return res.status(err.status).json({ erreur: err.message, ...err.extra });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ erreur: 'Envoi trop volumineux (image trop lourde ?).' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ erreur: 'Requête mal formée.' });
  }
  console.error(err);
  res.status(500).json({ erreur: 'Erreur interne du serveur.' });
}

export function idParam(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ErreurClient('Carte introuvable.', 404);
  return id;
}
