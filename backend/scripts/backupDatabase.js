require('dotenv').config();
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { createGzip } = require('node:zlib');

async function backup() {
  const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Variables de base manquantes : ${missing.join(', ')}`);
  const directory = process.env.BACKUP_DIRECTORY || path.resolve('backups');
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.join(directory, `barber-booking-${stamp}.sql.gz`);
  const child = spawn('mysqldump', [
    '--single-transaction', '--quick', '--routines', '--triggers', '--hex-blob', '--no-tablespaces',
    '--host', process.env.DB_HOST, '--port', String(process.env.DB_PORT || 3306),
    '--user', process.env.DB_USER, process.env.DB_NAME,
  ], { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD }, stdio: ['ignore', 'pipe', 'inherit'] });
  const childFinished = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  try {
    const [, status] = await Promise.all([
      pipeline(child.stdout, createGzip({ level: 9 }), fs.createWriteStream(destination, { mode: 0o600, flags: 'wx' })),
      childFinished,
    ]);
    if (status !== 0) throw new Error(`mysqldump a terminé avec le code ${status}.`);
    console.log(`Sauvegarde créée : ${destination}`);
  } catch (error) {
    child.kill();
    await fs.promises.rm(destination, { force: true });
    throw error;
  }
}

backup().catch((error) => { console.error(`Échec de sauvegarde : ${error.message}`); process.exitCode = 1; });
