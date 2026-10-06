require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');

const tablesAttendues = [
  'users',
  'barbers',
  'barber_photos',
  'services',
  'barber_services',
  'working_hours',
  'time_off',
  'appointments',
  'reviews',
  'notifications',
];

async function initialiserBase() {
  const variablesRequises = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const variablesManquantes = variablesRequises.filter((nom) => !process.env[nom]);
  if (variablesManquantes.length > 0) {
    throw new Error(`Variables d'environnement manquantes : ${variablesManquantes.join(', ')}`);
  }

  const connexion = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  try {
    const [lignes] = await connexion.execute(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
      [process.env.DB_NAME],
    );
    const tablesExistantes = new Set(lignes.map((ligne) => ligne.TABLE_NAME || ligne.table_name));
    const tablesManquantes = tablesAttendues.filter((table) => !tablesExistantes.has(table));

    if (tablesManquantes.length === 0) {
      console.log('La base Barber Booking est déjà initialisée.');
      return;
    }

    if (tablesExistantes.size > 0) {
      throw new Error(
        `La base contient déjà des tables mais son schéma est incomplet. Tables manquantes : ${tablesManquantes.join(', ')}. ` +
        'Sauvegardez et vérifiez la base avant de la modifier.',
      );
    }

    const schema = await fs.readFile(path.join(__dirname, '..', '..', 'database', 'schema.sql'), 'utf8');
    await connexion.query(schema);
    console.log('La base Barber Booking a été initialisée avec schema.sql.');
  } finally {
    await connexion.end();
  }
}

initialiserBase().catch((erreur) => {
  console.error('Initialisation de la base impossible :', erreur.message);
  process.exitCode = 1;
});
