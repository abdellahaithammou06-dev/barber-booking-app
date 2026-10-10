const { performance } = require('node:perf_hooks');

async function main() {
const base = process.env.LOAD_TEST_URL;
if (!base) throw new Error('Définissez LOAD_TEST_URL. Le test ne cible jamais le site de production par défaut.');
const url = new URL('/api/ready', base);
const production = url.hostname.endsWith('.up.railway.app');
const allowProduction = process.env.ALLOW_PRODUCTION_LOAD === 'true';
if (production && !allowProduction) throw new Error('Test bloqué sur Railway production. Utilisez staging ou définissez ALLOW_PRODUCTION_LOAD=true pour autoriser explicitement un test léger.');
const concurrency = Math.max(1, Math.min(Number(process.env.LOAD_TEST_CONCURRENCY || 5), production ? 5 : 30));
const durationSeconds = Math.max(1, Math.min(Number(process.env.LOAD_TEST_SECONDS || 10), production ? 20 : 60));
const latencies = [];
let requests = 0;
let failures = 0;
let stop = false;

async function worker() {
  while (!stop) {
    const started = performance.now();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      latencies.push(performance.now() - started);
      requests += 1;
      if (!response.ok) failures += 1;
      await response.body?.cancel();
    } catch {
      latencies.push(performance.now() - started);
      requests += 1;
      failures += 1;
    }
  }
}

const started = performance.now();
await Promise.all([new Promise((resolve) => setTimeout(() => { stop = true; resolve(); }, durationSeconds * 1000)), ...Array.from({ length: concurrency }, worker)]);
latencies.sort((a, b) => a - b);
const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] || 0;
console.log(JSON.stringify({ target: url.origin, endpoint: url.pathname, concurrency, duration_seconds: Math.round((performance.now() - started) / 1000), requests, failures, rps: Number((requests / durationSeconds).toFixed(1)), p50_ms: Math.round(percentile(0.5)), p95_ms: Math.round(percentile(0.95)), p99_ms: Math.round(percentile(0.99)) }, null, 2));
if (failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
