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
      const [colonnesPhoto] = await connexion.execute(
        `SELECT data_type FROM information_schema.columns
         WHERE table_schema = ? AND table_name = 'barber_photos' AND column_name = 'url'`,
        [process.env.DB_NAME],
      );
      if (colonnesPhoto[0]?.DATA_TYPE?.toLowerCase() !== 'longtext'
        && colonnesPhoto[0]?.data_type?.toLowerCase() !== 'longtext') {
        const migration = await fs.readFile(path.join(__dirname, '..', '..', 'database', 'migrations', '005_barbershop_cover_photos.sql'), 'utf8');
        await connexion.query(migration);
        console.log('La migration des photos de salon a été appliquée.');
      }
      await ajouterColonneSiAbsente(connexion, 'users', 'email_verified', 'BOOLEAN NOT NULL DEFAULT TRUE');
      await ajouterColonneSiAbsente(connexion, 'users', 'auth_version', 'INT NOT NULL DEFAULT 0');
      await ajouterColonneSiAbsente(connexion, 'barbers', 'verification_status', "ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved'");
      await connexion.query(`CREATE TABLE IF NOT EXISTS email_action_tokens (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        purpose ENUM('verify_email', 'reset_password') NOT NULL,
        token_hash CHAR(64) NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        consumed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_email_tokens_user_purpose (user_id, purpose, consumed_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
      console.log('Les migrations de sécurité des comptes sont à jour.');
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

async function ajouterColonneSiAbsente(connexion, table, colonne, definition) {
  const [[existe]] = await connexion.execute(
    `SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
    [process.env.DB_NAME, table, colonne],
  );
  if (Number(existe.total) === 0) await connexion.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${colonne}\` ${definition}`);
}

initialiserBase().catch((erreur) => {
  console.error('Initialisation de la base impossible :', erreur.message);
  process.exitCode = 1;
});
