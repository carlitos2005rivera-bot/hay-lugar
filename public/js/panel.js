// Panel del personal: marcar mesas libres u ocupadas y configurar las cafeterías.
import { el, plural, resumen, nivel, haceCuanto, crearMesa, conectarEnVivo, pintarIndicador, almacen, aviso } from './comun.js';

const $ = (id) => document.getElementById(id);
const sesion = almacen('session');
const local = almacen('local');

let pin = sesion.leer('pin');
let conexion = null;

let estado = null; // lo que se muestra en pantalla
let ultimoRecibido = null; // lo último que mandó el servidor
let pendientes = 0; // cambios enviados que aún no confirma el servidor
let seleccion = local.leer('panel-cafeteria');

let borrador = null; // copia editable de la configuración
let hayCambios = false;

// ───────────────────────── Entrar / salir ─────────────────────────

async function probarPin(valor) {
  const res = await fetch('/api/login', { method: 'POST', headers: { 'X-Pin': valor } });
  const datos = await res.json().catch(() => ({}));
  if (res.ok) {
    $('config-nota').hidden = !datos.almacenamientoTemporal;
    return null;
  }
  return datos.error || 'No se pudo entrar';
}

$('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const valor = $('pin').value.trim();
  $('login-error').textContent = '';
  try {
    const error = await probarPin(valor);
    if (error) {
      $('login-error').textContent = error;
      $('pin').select();
      return;
    }
    pin = valor;
    sesion.guardar('pin', pin);
    entrar();
  } catch {
    $('login-error').textContent = 'No hay conexión con el servidor.';
  }
});

function entrar() {
  $('vista-login').hidden = true;
  $('vista-app').hidden = false;
  $('pin').value = '';
  conexion = conectarEnVivo({
    alEstado: recibir,
    alConexion: (conectado) => pintarIndicador($('en-vivo'), conectado),
  });
}

function salir(mensaje = '') {
  conexion?.cerrar();
  conexion = null;
  pin = null;
  sesion.borrar('pin');
  $('vista-app').hidden = true;
  $('vista-login').hidden = false;
  $('login-error').textContent = mensaje;
  $('pin').focus();
}

$('salir').addEventListener('click', () => salir());

// ───────────────────────── Comunicación con el servidor ─────────────────────────

async function enviar(ruta, cuerpo) {
  let res;
  try {
    res = await fetch(ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Pin': pin },
      body: JSON.stringify(cuerpo),
    });
  } catch {
    throw new Error('Sin conexión: el cambio no se guardó.');
  }
  if (res.status === 401) {
    salir('Tu sesión terminó. Escribe el PIN otra vez.');
    throw new Error('PIN incorrecto');
  }
  if (!res.ok) {
    const datos = await res.json().catch(() => ({}));
    throw new Error(datos.error || 'No se pudo guardar el cambio.');
  }
}

function recibir(nuevo) {
  ultimoRecibido = nuevo;
  if (pendientes === 0) aplicar(nuevo);
}

function aplicar(nuevo) {
  estado = structuredClone(nuevo);
  pintarControl();
  if (!hayCambios && !$('config-lista').contains(document.activeElement)) {
    cargarBorrador();
  }
}

/**
 * Cambia la pantalla de inmediato y después avisa al servidor.
 * Si el servidor no acepta el cambio, se regresa a lo que tiene el servidor.
 */
async function cambiar(ruta, cuerpo, cambioEnPantalla) {
  cambioEnPantalla();
  pintarControl();
  pendientes++;
  try {
    await enviar(ruta, cuerpo);
  } catch (err) {
    if (pin) aviso(err.message, 'error');
  } finally {
    pendientes--;
    if (pendientes === 0 && ultimoRecibido) aplicar(ultimoRecibido);
  }
}

// ───────────────────────── Pestaña "Mesas" ─────────────────────────

function cafeteriaActual() {
  return estado.cafeterias.find((c) => c.id === seleccion) || estado.cafeterias[0];
}

/** Vuelve a dibujar un contenedor sin que el teclado pierda su lugar. */
function conservarFoco(contenedor, dibujar) {
  const activo = document.activeElement;
  const clave = contenedor.contains(activo) ? activo.dataset.id || activo.value : null;
  dibujar();
  if (clave) {
    const nuevo = [...contenedor.querySelectorAll('[data-id], input')].find(
      (n) => n.dataset.id === clave || n.value === clave
    );
    nuevo?.focus();
  }
}

function pintarControl() {
  if (!estado || !estado.cafeterias.length) return;
  const actual = cafeteriaActual();
  seleccion = actual.id;

  // Selector de cafetería (solo si hay más de una)
  const selector = $('selector-cafeteria');
  selector.hidden = estado.cafeterias.length < 2;
  conservarFoco(selector, () => {
    const leyenda = selector.querySelector('legend');
    const opciones = estado.cafeterias.map((c) => {
      const r = resumen(c);
      const etiqueta = el('label', 'opcion');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'cafeteria';
      radio.value = c.id;
      radio.checked = c === actual;
      radio.addEventListener('change', () => {
        seleccion = c.id;
        local.guardar('panel-cafeteria', c.id);
        pintarControl();
      });
      const texto = el('span', '', c.nombre);
      texto.append(el('small', '', `${r.libres}/${r.total}`));
      etiqueta.append(radio, texto);
      return etiqueta;
    });
    selector.replaceChildren(leyenda, ...opciones);
  });

  pintarResumen(actual);

  // Mesas
  const contenedor = $('mesas-control');
  conservarFoco(contenedor, () => {
    contenedor.replaceChildren(...actual.mesas.map((m) => crearMesa(m, { alTocar: () => tocarMesa(actual.id, m.id) })));
  });
}

function pintarResumen(actual) {
  const r = resumen(actual);
  const nv = nivel(r);
  $('control').dataset.nivel = nv.clase;
  $('control-nombre').textContent = actual.nombre;
  $('control-chip').replaceChildren(el('span', 'chip-icono', nv.icono), document.createTextNode(nv.texto));
  $('control-numeros').textContent =
    `${plural(r.libres, 'libre', 'libres')} · ${plural(r.ocupadas, 'ocupada', 'ocupadas')} · ` +
    `actualizado ${haceCuanto(actual.actualizado)}`;
}

function buscarMesa(idCafeteria, idMesa) {
  return estado.cafeterias.find((c) => c.id === idCafeteria)?.mesas.find((m) => m.id === idMesa);
}

function tocarMesa(idCafeteria, idMesa) {
  const mesa = buscarMesa(idCafeteria, idMesa);
  if (!mesa) return;
  const ocupada = !mesa.ocupada;
  cambiar('/api/mesa', { cafeteria: idCafeteria, mesa: idMesa, ocupada }, () => {
    mesa.ocupada = ocupada;
  });
}

function marcarTodas(ocupada) {
  const actual = cafeteriaActual();
  cambiar('/api/todas', { cafeteria: actual.id, ocupada }, () => {
    for (const m of actual.mesas) m.ocupada = ocupada;
  });
  aviso(ocupada ? `Todas las mesas de ${actual.nombre} están ocupadas` : `Todas las mesas de ${actual.nombre} están libres`);
}

$('todo-libre').addEventListener('click', () => marcarTodas(false));
$('todo-ocupado').addEventListener('click', () => marcarTodas(true));

// "Actualizado hace X min" se refresca solo
setInterval(() => {
  if (estado?.cafeterias.length) pintarResumen(cafeteriaActual());
}, 30 * 1000);

// ───────────────────────── Pestaña "Configurar" ─────────────────────────

function cargarBorrador() {
  if (!estado) return;
  borrador = estado.cafeterias.map((c) => ({ id: c.id, nombre: c.nombre, mesas: c.mesas.length }));
  marcarCambios(false);
  pintarConfig();
}

function marcarCambios(valor) {
  hayCambios = valor;
  $('config-aviso').textContent = valor ? 'Tienes cambios sin guardar' : 'Sin cambios';
  $('config-guardar').disabled = !valor;
  $('config-descartar').disabled = !valor;
}

function pintarConfig() {
  const filas = borrador.map((c, i) => {
    const fila = el('div', 'fila-config');

    const campo = el('label', 'campo');
    const nombre = el('input', 'entrada');
    nombre.value = c.nombre;
    nombre.maxLength = 50;
    nombre.addEventListener('input', () => {
      c.nombre = nombre.value;
      marcarCambios(true);
    });
    campo.append(el('span', '', `Cafetería ${i + 1}`), nombre);

    const contador = el('div', 'contador');
    const menos = el('button', '', '−');
    const mas = el('button', '', '+');
    const numero = el('input', 'entrada');
    menos.type = mas.type = 'button';
    menos.setAttribute('aria-label', 'Una mesa menos');
    mas.setAttribute('aria-label', 'Una mesa más');
    numero.type = 'number';
    numero.min = 1;
    numero.max = 100;
    numero.inputMode = 'numeric';
    numero.value = c.mesas;
    numero.setAttribute('aria-label', `Número de mesas de ${c.nombre}`);
    const actualizarBotones = () => {
      menos.disabled = !(c.mesas > 1);
      mas.disabled = !(c.mesas < 100);
    };
    const cambiarMesas = (n) => {
      c.mesas = n;
      numero.value = n;
      actualizarBotones();
      marcarCambios(true);
    };
    menos.addEventListener('click', () => cambiarMesas(c.mesas - 1));
    mas.addEventListener('click', () => cambiarMesas(c.mesas + 1));
    numero.addEventListener('input', () => {
      c.mesas = Number(numero.value);
      actualizarBotones();
      marcarCambios(true);
    });
    actualizarBotones();
    contador.append(menos, numero, mas, el('span', 'suave', 'mesas'));

    const quitar = el('button', 'quitar', '✕');
    quitar.type = 'button';
    quitar.title = 'Quitar cafetería';
    quitar.setAttribute('aria-label', `Quitar ${c.nombre}`);
    quitar.disabled = borrador.length === 1;
    quitar.addEventListener('click', () => {
      if (!confirm(`¿Quitar "${c.nombre}"? Se borra al guardar los cambios.`)) return;
      borrador.splice(i, 1);
      marcarCambios(true);
      pintarConfig();
    });

    fila.append(campo, contador, quitar);
    return fila;
  });
  $('config-lista').replaceChildren(...filas);
}

$('config-agregar').addEventListener('click', () => {
  if (!borrador) return;
  borrador.push({ id: null, nombre: `Cafetería ${borrador.length + 1}`, mesas: 10 });
  marcarCambios(true);
  pintarConfig();
  const entradas = $('config-lista').querySelectorAll('.campo input');
  entradas[entradas.length - 1]?.select();
});

$('config-descartar').addEventListener('click', () => cargarBorrador());

$('config-guardar').addEventListener('click', async () => {
  for (const c of borrador) {
    if (!c.nombre.trim()) return aviso('Cada cafetería necesita un nombre.', 'error');
    if (!Number.isInteger(c.mesas) || c.mesas < 1 || c.mesas > 100) {
      return aviso(`"${c.nombre}" debe tener de 1 a 100 mesas.`, 'error');
    }
  }
  $('config-guardar').disabled = true;
  try {
    await enviar('/api/configuracion', { cafeterias: borrador });
    hayCambios = false;
    if (ultimoRecibido) aplicar(ultimoRecibido);
    cargarBorrador();
    aviso('Cambios guardados');
  } catch (err) {
    $('config-guardar').disabled = false;
    if (pin) aviso(err.message, 'error');
  }
});

window.addEventListener('beforeunload', (e) => {
  if (hayCambios) e.preventDefault();
});

// ───────────────────────── Pestañas ─────────────────────────

for (const boton of document.querySelectorAll('[data-pestana]')) {
  boton.addEventListener('click', () => {
    for (const otro of document.querySelectorAll('[data-pestana]')) {
      const activa = otro === boton;
      if (activa) otro.setAttribute('aria-current', 'page');
      else otro.removeAttribute('aria-current');
      $('pestana-' + otro.dataset.pestana).hidden = !activa;
    }
  });
}

// ───────────────────────── Inicio ─────────────────────────

(async () => {
  if (!pin) return $('pin').focus();
  try {
    const error = await probarPin(pin);
    if (error) return salir();
    entrar();
  } catch {
    salir('No hay conexión con el servidor.');
  }
})();
