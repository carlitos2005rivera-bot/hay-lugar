// Página del código QR: arma un cartel para imprimir que lleva a la página de alumnos.
import qrcode from './vendor/qrcode.mjs';

const $ = (id) => document.getElementById(id);

// ¿Se está usando desde la computadora o la red local (no desde internet)?
const esLocal =
  ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ||
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);

let svgActual = '';

function dibujar(url) {
  const qr = qrcode(0, 'M'); // tamaño automático, corrección de errores media
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const margen = 3;
  const lado = n + margen * 2;
  let cuadros = '';
  for (let fila = 0; fila < n; fila++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(fila, col)) cuadros += `M${col + margen} ${fila + margen}h1v1h-1z`;
    }
  }
  svgActual =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges">` +
    `<rect width="${lado}" height="${lado}" fill="#fff"/><path d="${cuadros}" fill="#000"/></svg>`;
  $('qr').innerHTML = svgActual; // generado aquí mismo, solo contiene cuadros
  $('url-texto').textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function usarDireccion(valor) {
  try {
    const url = new URL(valor.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    dibujar(url.href);
  } catch {
    // Dirección incompleta mientras se escribe: se deja el QR anterior.
  }
}

async function direccionInicial() {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return location.origin + '/';
  // En la computadora, "localhost" no sirve para los celulares: se usa la IP de la red Wi‑Fi.
  try {
    const { urls } = await (await fetch('/api/direcciones')).json();
    if (urls?.length) return urls[0] + '/';
  } catch {}
  return location.origin + '/';
}

async function descargarImagen() {
  const imagen = new Image();
  imagen.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgActual);
  await imagen.decode();
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 1024;
  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(imagen, 0, 0, 1024, 1024);
  lienzo.toBlob((blob) => {
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(blob);
    enlace.download = 'qr-hay-lugar.png';
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
  }, 'image/png');
}

$('aviso-local').hidden = !esLocal;
$('imprimir').addEventListener('click', () => window.print());
$('descargar').addEventListener('click', descargarImagen);
$('direccion').addEventListener('input', (e) => usarDireccion(e.target.value));

const inicial = await direccionInicial();
$('direccion').value = inicial;
dibujar(inicial);
