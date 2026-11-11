// Funciones que usan tanto la página de alumnos como el panel del personal.

/** Crea un elemento con clase y texto (el texto se inserta de forma segura). */
export function el(etiqueta, clase = '', texto) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
}

export function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** Cuántas mesas libres y ocupadas tiene una cafetería. */
export function resumen(cafeteria) {
  const total = cafeteria.mesas.length;
  const libres = cafeteria.mesas.filter((m) => !m.ocupada).length;
  return { total, libres, ocupadas: total - libres, porcentaje: total ? Math.round(((total - libres) / total) * 100) : 0 };
}

/** La respuesta corta a "¿hay lugar?": 'libre', 'medio' o 'lleno'. */
export function nivel({ total, libres, porcentaje }) {
  if (total === 0 || libres === 0) return { clase: 'lleno', texto: 'Sin lugares', icono: '✕' };
  if (porcentaje >= 80) return { clase: 'medio', texto: 'Pocas mesas libres', icono: '!' };
  return { clase: 'libre', texto: 'Hay lugar', icono: '✓' };
}

export function haceCuanto(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 15) return 'justo ahora';
  if (s < 60) return `hace ${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${plural(horas, 'hora', 'horas')}`;
  return 'el ' + new Date(ts).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

const DIBUJO_MESA =
  '<svg viewBox="0 0 44 30" aria-hidden="true" focusable="false">' +
  '<circle cx="13" cy="4.5" r="4"/><circle cx="31" cy="4.5" r="4"/>' +
  '<rect x="2" y="10" width="40" height="10" rx="3.5"/>' +
  '<circle cx="13" cy="25.5" r="4"/><circle cx="31" cy="25.5" r="4"/></svg>';

/**
 * Dibuja una mesa. Si se pasa `alTocar`, la mesa es un botón (panel del personal).
 */
export function crearMesa(mesa, { alTocar } = {}) {
  const estadoTexto = mesa.ocupada ? 'Ocupada' : 'Libre';
  const tarjeta = el(alTocar ? 'button' : 'div', 'mesa');
  tarjeta.dataset.estado = mesa.ocupada ? 'ocupada' : 'libre';
  tarjeta.dataset.id = mesa.id;

  const dibujo = el('span', 'mesa-dibujo');
  dibujo.innerHTML = DIBUJO_MESA; // dibujo fijo, no viene de datos del usuario
  const estado = el('span', 'mesa-estado');
  estado.append(el('span', 'mesa-icono', mesa.ocupada ? '✕' : '✓'), document.createTextNode(estadoTexto));
  tarjeta.append(dibujo, el('span', 'mesa-nombre', mesa.nombre), estado);

  if (alTocar) {
    tarjeta.type = 'button';
    tarjeta.setAttribute('aria-pressed', String(mesa.ocupada));
    tarjeta.setAttribute('aria-label', `${mesa.nombre}: ${estadoTexto}. Toca para cambiar.`);
    tarjeta.addEventListener('click', () => alTocar(mesa));
  }
  return tarjeta;
}

/**
 * Abre la conexión en tiempo real con el servidor.
 * Si se pierde la conexión, el navegador se reconecta solo.
 */
export function conectarEnVivo({ alEstado, alConexion }) {
  let fuente;
  const abrir = () => {
    fuente = new EventSource('/api/eventos');
    fuente.addEventListener('estado', (e) => alEstado(JSON.parse(e.data)));
    fuente.onopen = () => alConexion?.(true);
    fuente.onerror = () => {
      alConexion?.(false);
      if (fuente.readyState === EventSource.CLOSED) setTimeout(abrir, 4000);
    };
  };
  abrir();

  // Los hostings gratuitos "duermen" el servidor si no reciben visitas en un rato.
  // Mientras la página esté abierta, una consulta ligera cada 4 minutos lo mantiene despierto.
  const despierto = setInterval(() => fetch('/api/estado', { cache: 'no-store' }).catch(() => {}), 4 * 60 * 1000);

  return {
    cerrar: () => {
      clearInterval(despierto);
      fuente.close();
    },
  };
}

export function pintarIndicador(nodo, conectado) {
  nodo.dataset.estado = conectado ? 'conectado' : 'desconectado';
  nodo.querySelector('.texto').textContent = conectado ? 'En vivo' : 'Sin conexión';
}

/** localStorage / sessionStorage sin errores (pueden estar bloqueados en modo privado). */
export function almacen(tipo = 'local') {
  const obtener = () => (tipo === 'local' ? window.localStorage : window.sessionStorage);
  return {
    leer(clave) {
      try {
        return obtener().getItem(clave);
      } catch {
        return null;
      }
    },
    guardar(clave, valor) {
      try {
        obtener().setItem(clave, valor);
      } catch {}
    },
    borrar(clave) {
      try {
        obtener().removeItem(clave);
      } catch {}
    },
  };
}

let temporizadorAviso;
/** Muestra un mensaje corto abajo de la pantalla. */
export function aviso(texto, tipo = '') {
  const nodo = document.getElementById('aviso');
  if (!nodo) return;
  nodo.textContent = texto;
  nodo.className = 'aviso-flotante' + (tipo ? ' ' + tipo : '');
  nodo.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => (nodo.hidden = true), 3200);
}
