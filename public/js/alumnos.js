// Página de alumnos: muestra si hay mesas libres en cada cafetería, en tiempo real.
import { el, plural, resumen, nivel, haceCuanto, crearMesa, conectarEnVivo, pintarIndicador, almacen } from './comun.js';

const $ = (id) => document.getElementById(id);
const local = almacen('local');

let estado = null;
let seleccion = local.leer('cafeteria'); // la última cafetería que vio el alumno

function cafeteriaSeleccionada() {
  return estado.cafeterias.find((c) => c.id === seleccion) || estado.cafeterias[0];
}

function textoLibres(libres) {
  return libres === 1 ? 'mesa libre' : 'mesas libres';
}

function pintarCafeterias(actual) {
  const tarjetas = estado.cafeterias.map((c) => {
    const r = resumen(c);
    const nv = nivel(r);

    const boton = el('button', 'cafe');
    boton.type = 'button';
    boton.dataset.nivel = nv.clase;
    boton.setAttribute('aria-pressed', String(c === actual));

    const chip = el('span', 'chip chip-nivel');
    chip.append(el('span', 'chip-icono', nv.icono), document.createTextNode(nv.texto));
    const cabeza = el('span', 'cafe-cabeza');
    cabeza.append(el('span', 'cafe-nombre', c.nombre), chip);

    const numero = el('span', 'cafe-numero');
    numero.append(el('b', '', String(r.libres)), document.createTextNode(` ${textoLibres(r.libres)} de ${r.total}`));

    const medidor = el('span', 'medidor');
    const relleno = el('span', 'medidor-relleno');
    relleno.style.width = r.porcentaje + '%';
    medidor.append(relleno);

    const hora = el('span', 'cafe-hora');
    hora.dataset.ts = c.actualizado;
    hora.textContent = 'Actualizado ' + haceCuanto(c.actualizado);

    boton.append(cabeza, numero, medidor, hora);
    boton.addEventListener('click', () => {
      seleccion = c.id;
      local.guardar('cafeteria', c.id);
      pintar();
      // En celular las mesas quedan más abajo: se baja hasta ellas si no se ven.
      if ($('detalle').getBoundingClientRect().top > window.innerHeight * 0.6) {
        $('detalle').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    return boton;
  });
  $('cafeterias').replaceChildren(...tarjetas);
}

function pintarDetalle(c) {
  const r = resumen(c);
  $('detalle').hidden = false;
  $('detalle-titulo').textContent = `Mesas · ${c.nombre}`;
  $('detalle-subtitulo').textContent = `${plural(r.libres, 'libre', 'libres')} y ${plural(r.ocupadas, 'ocupada', 'ocupadas')}`;
  $('mesas').replaceChildren(...c.mesas.map((m) => crearMesa(m)));

  // El título de la pestaña también avisa, por si el alumno deja la página abierta esperando.
  document.title = `${r.libres === 0 ? 'Sin lugares' : `${r.libres} ${textoLibres(r.libres)}`} · ${c.nombre}`;
  $('anuncio').textContent = `${c.nombre}: ${r.libres} ${textoLibres(r.libres)} de ${r.total}.`;
}

function pintar() {
  if (!estado) return;
  if (!estado.cafeterias.length) {
    $('cafeterias').replaceChildren(el('p', 'cargando', 'Todavía no hay cafeterías registradas.'));
    $('detalle').hidden = true;
    return;
  }
  const actual = cafeteriaSeleccionada();
  pintarCafeterias(actual);
  pintarDetalle(actual);
}

// "Actualizado hace X min" se refresca solo.
setInterval(() => {
  for (const nodo of document.querySelectorAll('.cafe-hora')) {
    nodo.textContent = 'Actualizado ' + haceCuanto(Number(nodo.dataset.ts));
  }
}, 15 * 1000);

conectarEnVivo({
  alEstado(nuevo) {
    estado = nuevo;
    pintar();
  },
  alConexion(conectado) {
    pintarIndicador($('en-vivo'), conectado);
  },
});
