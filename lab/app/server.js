// App de ejemplo para el laboratorio de load balancing. Sin dependencias.
// Cada pedido ocupa un "worker" durante WORK_MS; si no hay libres espera en una
// cola de hasta COLA pedidos, y si la cola está llena responde 503 (como en las slides).
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const crypto = require('node:crypto');

const NAME = process.env.NAME || os.hostname();
const PORT = Number(process.env.PORT || 3000);
const WORKERS = Number(process.env.WORKERS || 4);
const COLA = Number(process.env.COLA || 10);
const WORK_MS = Number(process.env.WORK_MS || 100);
const DRAIN_MS = Number(process.env.DRAIN_MS || 6000);
const REDIS_HOST = process.env.REDIS_HOST || 'redis';

let enCurso = 0;
let atendidos = 0;
let sano = true;
const espera = [];
const sesiones = new Map(); // sesiones en la memoria de ESTA instancia

const log = (...a) => console.log(`[${NAME}]`, ...a);

function ocupar() {
  if (enCurso < WORKERS) { enCurso++; return Promise.resolve(); }
  if (espera.length >= COLA) return null;
  return new Promise((resolve) => espera.push(resolve));
}
function liberar() {
  const siguiente = espera.shift();
  if (siguiente) siguiente(); else enCurso--;
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Cliente Redis mínimo (INCR) para las sesiones compartidas.
function redisIncr(key) {
  return new Promise((resolve, reject) => {
    const s = net.connect(6379, REDIS_HOST);
    s.setTimeout(1000, () => s.destroy(new Error('timeout de Redis')));
    s.on('error', reject);
    s.on('data', (d) => { s.end(); const m = /^:(\d+)/.exec(d.toString()); m ? resolve(Number(m[1])) : reject(new Error(d.toString().trim())); });
    s.write(`*2\r\n$4\r\nINCR\r\n$${Buffer.byteLength(key)}\r\n${key}\r\n`);
  });
}

function sid(req, res) {
  const m = /(?:^|;\s*)sid=([\w-]+)/.exec(req.headers.cookie || '');
  if (m) return m[1];
  const nuevo = crypto.randomUUID().slice(0, 8);
  res.setHeader('Set-Cookie', `sid=${nuevo}; Path=/; HttpOnly`);
  return nuevo;
}

function responder(res, code, texto) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Servidor': NAME });
  res.end(texto + '\n');
}

async function trabajar(req, res, ms) {
  const lugar = ocupar();
  if (!lugar) {
    log(`503 ${req.method} ${req.url}: ${WORKERS} workers ocupados y ${COLA} en cola`);
    return responder(res, 503, `${NAME}: saturado (503)`);
  }
  const t0 = Date.now();
  await lugar;
  await dormir(ms);
  liberar();
  atendidos++;
  const total = Date.now() - t0;
  log(`${req.method} ${req.url} · ${total} ms · en curso ${enCurso}/${WORKERS} · en cola ${espera.length}`);
  responder(res, 200, `${NAME} · pedido #${atendidos} · ${total} ms`);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    switch (`${req.method} ${url.pathname}`) {
      case 'GET /': return await trabajar(req, res, WORK_MS);
      case 'GET /lento': return await trabajar(req, res, Number(url.searchParams.get('ms') || 3000));
      case 'GET /health': return responder(res, sano ? 200 : 503, sano ? 'ok' : 'enfermo');
      case 'POST /enfermar': sano = false; log('marcado como enfermo: /health responde 503'); return responder(res, 200, `${NAME}: /health ahora responde 503`);
      case 'POST /curar': sano = true; log('curado: /health responde 200'); return responder(res, 200, `${NAME}: /health ahora responde 200`);
      case 'GET /cliente': {
        const ip = req.socket.remoteAddress.replace('::ffff:', '');
        log(`GET /cliente · conexión desde ${ip} · X-Forwarded-For: ${req.headers['x-forwarded-for'] || '(no vino)'}`);
        return responder(res, 200, [
          `${NAME} ve la conexión desde: ${ip}`,
          `X-Forwarded-For: ${req.headers['x-forwarded-for'] || '(no vino: el LB no miró HTTP)'}`,
          `X-Balanceador: ${req.headers['x-balanceador'] || '(no vino)'}`,
        ].join('\n'));
      }
      case 'GET /sesion': {
        const id = sid(req, res);
        const n = (sesiones.get(id) || 0) + 1;
        sesiones.set(id, n);
        log(`GET /sesion · sid=${id} · visitas en mi memoria: ${n}`);
        return responder(res, 200, `${NAME} · sesión ${id} · visitas: ${n} (guardadas en la memoria de ${NAME})`);
      }
      case 'GET /sesion-compartida': {
        const id = sid(req, res);
        const n = await redisIncr(`sesion:${id}`);
        log(`GET /sesion-compartida · sid=${id} · visitas en Redis: ${n}`);
        return responder(res, 200, `${NAME} · sesión ${id} · visitas: ${n} (guardadas en Redis)`);
      }
      default: return responder(res, 404, `${NAME}: no conozco ${url.pathname}`);
    }
  } catch (e) {
    log('error:', e.message);
    responder(res, 500, `${NAME}: ${e.message}`);
  }
});

server.listen(PORT, () => log(`escuchando en :${PORT} · ${WORKERS} workers · cola ${COLA} · ${WORK_MS} ms por pedido`));

// Apagado prolijo: primero /health pasa a 503 para que el LB deje de mandar,
// se terminan los pedidos en curso y recién después se cierra.
process.on('SIGTERM', async () => {
  sano = false;
  log(`SIGTERM: /health → 503, sigo atendiendo ${DRAIN_MS} ms mientras el LB me saca`);
  await dormir(DRAIN_MS);
  server.close(() => { log('cerrado'); process.exit(0); });
  setTimeout(() => process.exit(0), 2000).unref();
});
