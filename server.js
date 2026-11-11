/**
 * ¿Hay lugar? — servidor
 *
 * Página para saber, en tiempo real, si hay mesas libres en las cafeterías
 * de la universidad. El personal de cada cafetería marca las mesas como
 * libres u ocupadas y los alumnos lo ven al instante, sin recargar.
 *
 * No hay que instalar nada: solo Node.js 18 o más nuevo.
 *
 *   node server.js
 *
 *   Alumnos:  http://localhost:3000
 *   Personal: http://localhost:3000/panel   (PIN por defecto: 1234)
 *
 * El tiempo real usa Server-Sent Events (EventSource): cada navegador deja una
 * conexión abierta y el servidor le manda el estado nuevo cada vez que cambia.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PUERTO = Number(process.env.PORT) || 3000;
const PIN = String(process.env.PIN_PANEL || '1234');

const DIR_PUBLICO = path.join(__dirname, 'public');
const DIR_DATOS = path.join(__dirname, 'datos');
const ARCH_ESTADO = path.join(DIR_DATOS, 'estado.json');

const MAX_CAFETERIAS = 20;
const MAX_MESAS = 100;

// ───────────────────────── Datos ─────────────────────────

function nuevoId(prefijo) {
  return prefijo + Math.random().toString(36).slice(2, 9);
}

function crearMesas(cantidad, desde = 0) {
  return Array.from({ length: cantidad }, (_, i) => ({
    id: nuevoId('m'),
    nombre: `Mesa ${desde + i + 1}`,
    ocupada: false,
  }));
}

/**
 * Cafeterías con las que arranca la página.
 * Se pueden definir con la variable CAFETERIAS, por ejemplo:
 *   CAFETERIAS="Cafetería Central:12;Cafetería Norte:8"
 * Esto sirve en hostings gratuitos (como Render) donde los archivos se borran al reiniciar.
 */
function cafeteriasIniciales() {
  const lista = [];
  for (const parte of String(process.env.CAFETERIAS || '').split(';')) {
    const [nombre, mesas] = parte.split(':').map((s) => s?.trim());
    const cantidad = Math.round(Number(mesas));
    if (nombre && cantidad >= 1 && cantidad <= MAX_MESAS) lista.push({ nombre: nombre.slice(0, 50), cantidad });
  }
  if (lista.length) return lista.slice(0, MAX_CAFETERIAS);
  return [
    { nombre: 'Cafetería Central', cantidad: 12 },
    { nombre: 'Cafetería Norte', cantidad: 8 },
  ];
}

function estadoInicial() {
  const ahora = Date.now();
  return {
    cafeterias: cafeteriasIniciales().map(({ nombre, cantidad }) => ({
      id: nuevoId('c'),
      nombre,
      mesas: crearMesas(cantidad),
      actualizado: ahora,
    })),
  };
}

function cargarEstado() {
  try {
    const datos = JSON.parse(fs.readFileSync(ARCH_ESTADO, 'utf8'));
    if (Array.isArray(datos.cafeterias)) return datos;
  } catch {}
  return estadoInicial();
}

function guardarEstado() {
  fs.writeFileSync(ARCH_ESTADO, JSON.stringify(estado, null, 1));
}

fs.mkdirSync(DIR_DATOS, { recursive: true });
const estado = cargarEstado();
guardarEstado();

function buscarCafeteria(id) {
  return estado.cafeterias.find((c) => c.id === id);
}

/** Guarda el estado y se lo manda al instante a todos los navegadores conectados. */
function huboCambio(cafeteria) {
  if (cafeteria) cafeteria.actualizado = Date.now();
  guardarEstado();
  for (const res of clientes) enviar(res, 'estado', estado);
}

// ───────────────────── Tiempo real (SSE) ─────────────────────

const clientes = new Set();

function enviar(res, evento, datos) {
  res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
}

function abrirEventos(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  clientes.add(res);
  enviar(res, 'estado', estado);
  req.on('close', () => clientes.delete(res));
}

// Un "ping" cada 25 s evita que la red cierre las conexiones que no tienen movimiento.
setInterval(() => {
  for (const res of clientes) res.write(': ping\n\n');
}, 25 * 1000);

// ───────────────────────── PIN del panel ─────────────────────────

// Si alguien se equivoca de PIN 8 veces seguidas, se bloquea 5 minutos.
const intentosFallidos = new Map();

/** IP de quien hace la petición (en internet llega a través del proxy del hosting). */
function ipDe(req) {
  const reenviada = req.headers['x-forwarded-for'];
  return (reenviada ? String(reenviada).split(',')[0].trim() : '') || req.socket.remoteAddress;
}

function pinCorrecto(req, res) {
  const ip = ipDe(req);
  const registro = intentosFallidos.get(ip) || { n: 0, hasta: 0 };
  if (registro.hasta > Date.now()) {
    responder(res, 429, { error: 'Demasiados intentos. Espera unos minutos.' });
    return false;
  }
  if (req.headers['x-pin'] === PIN) {
    intentosFallidos.delete(ip);
    return true;
  }
  registro.n++;
  if (registro.n >= 8) {
    registro.n = 0;
    registro.hasta = Date.now() + 5 * 60 * 1000;
  }
  intentosFallidos.set(ip, registro);
  responder(res, 401, { error: 'PIN incorrecto' });
  return false;
}

// ───────────────────────── API ─────────────────────────

function responder(res, codigo, datos) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(datos));
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let texto = '';
    req.setEncoding('utf8');
    req.on('data', (parte) => {
      texto += parte;
      if (texto.length > 100_000) {
        reject(new Error('Solicitud demasiado grande'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(texto ? JSON.parse(texto) : {});
      } catch {
        reject(new Error('Datos no válidos'));
      }
    });
    req.on('error', reject);
  });
}

async function api(req, res, url) {
  const ruta = `${req.method} ${url.pathname}`;

  // Rutas públicas (alumnos)
  if (ruta === 'GET /api/estado') return responder(res, 200, estado);
  if (ruta === 'GET /api/eventos') return abrirEventos(req, res);
  // Direcciones de la red Wi‑Fi local, para armar el QR cuando se usa desde la computadora
  if (ruta === 'GET /api/direcciones') {
    return responder(res, 200, { urls: ipsDeLaRed().map((ip) => `http://${ip}:${PUERTO}`) });
  }

  // Todo lo demás es del panel del personal y necesita el PIN
  if (!pinCorrecto(req, res)) return;

  switch (ruta) {
    case 'POST /api/login':
      // En Render gratis los archivos se borran al reiniciar: el panel avisa de eso.
      return responder(res, 200, { ok: true, almacenamientoTemporal: Boolean(process.env.RENDER) });

    // Marca una mesa como libre u ocupada
    case 'POST /api/mesa': {
      const { cafeteria, mesa, ocupada } = await leerCuerpo(req);
      const c = buscarCafeteria(cafeteria);
      const m = c?.mesas.find((x) => x.id === mesa);
      if (!m) return responder(res, 400, { error: 'Mesa no encontrada' });
      m.ocupada = Boolean(ocupada);
      huboCambio(c);
      return responder(res, 200, { ok: true });
    }

    // Marca todas las mesas de una cafetería como libres u ocupadas
    case 'POST /api/todas': {
      const { cafeteria, ocupada } = await leerCuerpo(req);
      const c = buscarCafeteria(cafeteria);
      if (!c) return responder(res, 400, { error: 'Cafetería no encontrada' });
      for (const m of c.mesas) m.ocupada = Boolean(ocupada);
      huboCambio(c);
      return responder(res, 200, { ok: true });
    }

    case 'POST /api/configuracion':
      return guardarConfiguracion(req, res);
  }
  responder(res, 404, { error: 'Ruta no encontrada' });
}

/** Cambia la lista de cafeterías y cuántas mesas tiene cada una. */
async function guardarConfiguracion(req, res) {
  const { cafeterias } = await leerCuerpo(req);
  if (!Array.isArray(cafeterias) || cafeterias.length < 1 || cafeterias.length > MAX_CAFETERIAS) {
    return responder(res, 400, { error: `Debe haber de 1 a ${MAX_CAFETERIAS} cafeterías.` });
  }
  const usadas = new Set();
  const nuevas = [];
  for (const item of cafeterias) {
    const nombre = String(item?.nombre ?? '').trim().slice(0, 50);
    const cantidad = Math.round(Number(item?.mesas));
    if (!nombre) return responder(res, 400, { error: 'Cada cafetería necesita un nombre.' });
    if (!(cantidad >= 1 && cantidad <= MAX_MESAS)) {
      return responder(res, 400, { error: `Cada cafetería debe tener de 1 a ${MAX_MESAS} mesas.` });
    }
    // Si la cafetería ya existía se conservan sus mesas (y si están libres u ocupadas).
    const anterior = usadas.has(item.id) ? null : buscarCafeteria(item.id);
    if (anterior) {
      usadas.add(anterior.id);
      const mesas = anterior.mesas.slice(0, cantidad);
      mesas.push(...crearMesas(cantidad - mesas.length, mesas.length));
      const cambio = anterior.nombre !== nombre || anterior.mesas.length !== cantidad;
      nuevas.push({ ...anterior, nombre, mesas, actualizado: cambio ? Date.now() : anterior.actualizado });
    } else {
      nuevas.push({ id: nuevoId('c'), nombre, mesas: crearMesas(cantidad), actualizado: Date.now() });
    }
  }
  estado.cafeterias = nuevas;
  huboCambio();
  responder(res, 200, { ok: true });
}

// ───────────────────── Archivos de la página ─────────────────────

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const PAGINAS = { '/': 'index.html', '/panel': 'panel.html', '/qr': 'qr.html' };

function servirArchivo(res, ruta) {
  const relativo = PAGINAS[ruta] || decodeURIComponent(ruta).replace(/^\/+/, '');
  const archivo = path.resolve(DIR_PUBLICO, relativo);
  if (!archivo.startsWith(DIR_PUBLICO + path.sep)) return noEncontrado(res);
  fs.readFile(archivo, (err, datos) => {
    if (err) return noEncontrado(res);
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(datos);
  });
}

function noEncontrado(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Página no encontrada');
}

// ───────────────────────── Servidor ─────────────────────────

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return noEncontrado(res);
    servirArchivo(res, url.pathname);
  } catch (err) {
    if (!res.headersSent) responder(res, 400, { error: err.message || 'Solicitud no válida' });
  }
});

function ipsDeLaRed() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && (i.family === 'IPv4' || i.family === 4) && !i.internal)
    .map((i) => i.address);
}

servidor.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  El puerto ${PUERTO} ya está en uso. Cierra el otro programa o usa otro puerto:`);
    console.error('    PowerShell:  $env:PORT=3001; node server.js\n');
  } else {
    console.error(err);
  }
  process.exit(1);
});

servidor.listen(PUERTO, () => {
  console.log('\n  ¿Hay lugar? está funcionando\n');
  console.log(`  Alumnos:   http://localhost:${PUERTO}`);
  console.log(`  Personal:  http://localhost:${PUERTO}/panel`);
  console.log(`  Código QR: http://localhost:${PUERTO}/qr`);
  for (const ip of ipsDeLaRed()) console.log(`  Desde celulares en la misma red:  http://${ip}:${PUERTO}`);
  if (PIN === '1234') {
    console.log('\n  PIN del panel: 1234  (cámbialo con la variable PIN_PANEL)');
    if (process.env.RENDER) console.warn('  ⚠ La página está en internet con el PIN de ejemplo. Define PIN_PANEL en Render.');
  }
  console.log('\n  Para detenerlo presiona Ctrl + C\n');
});
