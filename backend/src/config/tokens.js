const jwt = require('jsonwebtoken');

function verifierSecretsJWT() {
  if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
    throw new Error('Les secrets JWT doivent être renseignés dans le fichier .env.');
  }
}

function creerTokens(utilisateur) {
  verifierSecretsJWT();
  const chargeUtile = { id: utilisateur.id, role: utilisateur.role, auth_version: utilisateur.auth_version || 0 };

  return {
    accessToken: jwt.sign(chargeUtile, process.env.JWT_ACCESS_SECRET, {
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    }),
    refreshToken: jwt.sign(chargeUtile, process.env.JWT_REFRESH_SECRET, {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    }),
  };
}

module.exports = { creerTokens, verifierSecretsJWT };
