require('dotenv').config();
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { createGunzip } = require('node:zlib');
const { pipeline } = require('node:stream/promises');

async function restoreVerify() {
  const file = process.env.BACKUP_FILE;
  const database = process.env.RESTORE_DB_NAME;
  if (process.env.NODE_ENV === 'production') throw new Error('La restauration de vérification est interdite en NODE_ENV=production.');
  if (!file || !database) throw new Error('Définissez BACKUP_FILE et RESTORE_DB_NAME pour une base de test vide.');
  if (database === process.env.DB_NAME) throw new Error('La base de vérification doit être différente de la base source.');
  if (!['DB_HOST', 'DB_USER', 'DB_PASSWORD'].every((key) => process.env[key])) throw new Error('Variables MySQL manquantes.');
  const args = ['--host', process.env.DB_HOST, '--port', String(process.env.DB_PORT || 3306), '--user', process.env.DB_USER, database];
  const child = spawn('mysql', args, { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD }, stdio: ['pipe', 'inherit', 'inherit'] });
  const childFinished = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  const [, status] = await Promise.all([pipeline(fs.createReadStream(file), createGunzip(), child.stdin), childFinished]);
  if (status !== 0) throw new Error(`mysql a terminé avec le code ${status}.`);
  const check = spawn('mysqlcheck', ['--host', process.env.DB_HOST, '--port', String(process.env.DB_PORT || 3306), '--user', process.env.DB_USER, database], { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD }, stdio: 'inherit' });
  const checkStatus = await new Promise((resolve, reject) => { check.once('error', reject); check.once('close', resolve); });
  if (checkStatus !== 0) throw new Error(`mysqlcheck a terminé avec le code ${checkStatus}.`);
  console.log(`Restauration de vérification terminée pour ${database}.`);
}

restoreVerify().catch((error) => { console.error(`Échec de la vérification : ${error.message}`); process.exitCode = 1; });
