const mysql = require('mysql2/promise');

/**
 * Pool de connexions partagé par toute l'API.
 * Aucun mot de passe ni autre donnée sensible n'est inscrit dans le code :
 * toutes les valeurs viennent du fichier .env.
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

/**
 * Vérifie explicitement la configuration et l'accès à MySQL au démarrage.
 * La connexion de vérification est fermée après le ping. Sur Vercel, le pool
 * ne doit pas réutiliser cette connexion d'initialisation devenue inactive.
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
