const mysql = require('mysql2/promise');

/**
 * Pool de connexions partagé par toute l'API.
 * Aucun mot de passe ni autre donnée sensible n'est inscrit dans le code :
 * toutes les valeurs viennent des variables d'environnement.
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true'
    ? { minVersion: 'TLSv1.2' }
    : undefined,
  waitForConnections: true,
  connectionLimit: Math.max(1, Number(process.env.DB_POOL_LIMIT || 10)),
  queueLimit: Math.max(0, Number(process.env.DB_QUEUE_LIMIT || 100)),
});

/**
 * Vérifie explicitement la configuration et l'accès à MySQL au démarrage.
 * La connexion de vérification est fermée après le ping pour éviter qu'un
 * pool ne réutilise une connexion d'initialisation devenue inactive.
 */
async function verifierConnexionBDD() {
  const variablesRequises = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const variablesManquantes = variablesRequises.filter((nom) => !process.env[nom]);

  if (variablesManquantes.length > 0) {
    throw new Error(
      `Variables d'environnement manquantes : ${variablesManquantes.join(', ')}`,
    );
  }

  const connexion = await pool.getConnection();

  try {
    await connexion.ping();
  } finally {
    connexion.destroy();
  }
}

module.exports = { pool, verifierConnexionBDD };
