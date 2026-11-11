# ¿Hay lugar? — Mesas libres en las cafeterías

Página web que muestra **en tiempo real** si hay mesas libres en las cafeterías de la universidad.
El personal de cada cafetería marca las mesas como **libres** u **ocupadas**. Los alumnos lo ven al instante, sin recargar, y deciden si ir ya o esperar.

## Cómo usarlo

Solo necesitas [Node.js](https://nodejs.org) 18 o más nuevo. No hay que instalar nada más.

```bash
node server.js
```

Después abre en el navegador:

| Quién | Dirección | Qué hace |
|---|---|---|
| Alumnos | http://localhost:3000 | Ve si hay lugar en cada cafetería y qué mesas están libres |
| Personal | http://localhost:3000/panel | Marca mesas libres u ocupadas (PIN: **1234**) |

Para detenerlo presiona `Ctrl + C`.

### Abrirlo desde celulares

Los celulares deben estar en **la misma red Wi‑Fi** que la computadora donde corre el servidor.
Al iniciar, la consola muestra una dirección como `http://192.168.1.50:3000`; ábrela en el celular.
La primera vez, Windows puede preguntar si permites que Node.js use la red: acepta en **redes privadas**.

### Cambiar el PIN del panel

En PowerShell:

```powershell
$env:PIN_PANEL="4821"; node server.js
```

## Código QR

Abre **`/qr`** (o en el panel: **Código QR ↗**). Sale un cartel listo para imprimir con el QR que lleva a la página de alumnos, y también se puede descargar el QR como imagen.

- Si lo abres desde la dirección pública (por ejemplo `https://hay-lugar.onrender.com/qr`), el QR lleva a esa dirección.
- Si lo abres desde tu computadora (`localhost`), usa la dirección de tu red Wi‑Fi y solo funciona en celulares conectados a esa misma red.

## Publicarla en internet (Render, gratis)

1. Crea una cuenta en [GitHub](https://github.com) y sube este proyecto a un repositorio.
2. Crea una cuenta en [Render](https://render.com) entrando con tu cuenta de GitHub.
3. En Render: **New → Blueprint** y elige el repositorio. Render lee `render.yaml` y arma todo solo.
4. Te pedirá el **PIN_PANEL**: escribe un PIN difícil de adivinar (por ejemplo 6 números o una palabra).
5. En unos minutos te da una dirección como `https://hay-lugar.onrender.com`. Esa es la página pública.

**Cosas del plan gratuito:**
- Si nadie abre la página en 15 minutos, el servidor se duerme. La siguiente visita tarda cerca de un minuto en cargar. Mientras alguien tenga la página o el panel abiertos, no se duerme.
- Al reiniciarse, todas las mesas vuelven a **libre** y las cafeterías vuelven a las de la variable `CAFETERIAS`. Para cambiar las cafeterías de forma permanente, edita esa variable en Render (tu servicio → **Environment**) con el formato `Nombre:mesas;Nombre:mesas`.
- Cada vez que subas cambios a GitHub, Render publica la nueva versión sola.

## Qué hace cada parte

**Página de alumnos** (`/`)
- Una tarjeta por cafetería con la respuesta corta: **Hay lugar**, **Pocas mesas libres** o **Sin lugares**.
- Cuántas mesas libres hay y cuándo se actualizó por última vez.
- El mapa de mesas de la cafetería elegida, en verde (libre) o rojo (ocupada).
- Se actualiza sola. Si el alumno deja la pestaña abierta esperando, el título de la pestaña también cambia ("3 mesas libres · Cafetería Central").

**Panel del personal** (`/panel`)
- **Mesas:** se toca una mesa para cambiarla entre libre y ocupada. Hay botones de **Todo libre** y **Todo ocupado**.
- **Configurar:** agregar o quitar cafeterías, cambiarles el nombre y decir cuántas mesas tiene cada una.

## Cómo funciona el tiempo real

1. Cada navegador abre una conexión que se queda abierta con el servidor (`/api/eventos`). Usa *Server‑Sent Events*, que viene incluido en todos los navegadores (`EventSource`).
2. Cuando el personal toca una mesa, el panel manda el cambio al servidor (`POST /api/mesa`).
3. El servidor guarda el cambio en `datos/estado.json` y se lo envía al instante a todos los navegadores conectados.
4. Si se pierde la conexión, el navegador se reconecta solo. Arriba a la derecha se ve **En vivo** o **Sin conexión**.

## Archivos

```
server.js            Servidor: guarda el estado, revisa el PIN y avisa los cambios en tiempo real
public/
  index.html         Página de alumnos
  panel.html         Panel del personal
  qr.html            Cartel con el código QR para imprimir
  js/qr.js           Arma el código QR
  js/vendor/         Librería del código QR (qrcode-generator, licencia MIT)
  css/estilos.css    Diseño (incluye modo oscuro)
  js/comun.js        Funciones compartidas (dibujar mesas, conexión en vivo)
  js/alumnos.js      Lógica de la página de alumnos
  js/panel.js        Lógica del panel
render.yaml          Configuración para publicarla en Render
datos/estado.json    Se crea solo: cafeterías, mesas y si están ocupadas
```

Para empezar de cero, detén el servidor y borra la carpeta `datos/`.

## Relación con los objetivos del proyecto

| Objetivo | Dónde se cumple |
|---|---|
| Diseñar la interfaz para consultar de forma ágil y clara | Página de alumnos: respuesta corta por cafetería y mapa de mesas con colores e íconos |
| Módulo de control de disponibilidad para el personal | Panel con PIN: un toque por mesa, o todas a la vez |
| Sincronizar en tiempo real sin recargar | Server‑Sent Events: los cambios llegan a todos al instante |
| Evaluar la efectividad del sistema | Se hace aparte. Por ejemplo, con una encuesta antes y después de usar la página sobre cuánto tardan en encontrar mesa |
