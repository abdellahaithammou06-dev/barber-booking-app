require('dotenv').config();

const app = require('./app');
const { verifierConnexionBDD } = require('./config/database');
const { verifierSecretsJWT } = require('./config/tokens');

const port = Number(process.env.PORT || 3000);

/**
 * Le serveur ne démarre qu'après validation de l'accès à la base.
 * Cela évite de servir une API qui ne pourrait pas réaliser ses opérations.
 */
async function demarrerServeur() {
  verifierSecretsJWT();
  await verifierConnexionBDD();

  app.listen(port, () => {
    console.log(`API Barber Booking disponible sur le port ${port}.`);
  });
}

demarrerServeur().catch((erreur) => {
  console.error('Impossible de démarrer l’API :', erreur.message);
  process.exit(1);
});
