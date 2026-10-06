const { validationResult } = require('express-validator');

function valider(req, res, next) {
  const erreurs = validationResult(req);
  if (!erreurs.isEmpty()) {
    return res.status(422).json({ message: 'Données invalides.', erreurs: erreurs.array() });
  }
  return next();
}

module.exports = { valider };
