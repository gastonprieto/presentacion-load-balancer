# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Presentación interactiva en español (reveal.js + GSAP + Chart.js) para estudiantes de diseño de sistemas: problemas de un solo nodo y cómo los resuelve un load balancer. Todo el contenido visible y las notas del orador están en español.

## Comandos

- No hay build, linter ni tests. Se abre `index.html` directo (`open -a "Google Chrome" index.html#/6` abre la slide 7; el hash es 0-based).
- Deploy: GitHub Pages sirve la rama `main` desde la raíz (https://gastonprieto.github.io/presentacion-load-balancer/). Un push a `main` publica.
- `vendor/` tiene versiones fijas descargadas (reveal.js 5.1.0, GSAP 3.12.5, Chart.js 4.4.1). No usar CDN: la presentación tiene que funcionar offline.

## Restricciones que no son obvias

- Scripts clásicos con globals (`window.NetKit`, `Widgets`, `Scenes`), **no ES modules**: los módulos fallan por CORS al abrir con `file://`. El orden de los `<script>` en `index.html` importa.
- reveal.js escala un lienzo fijo de 1280×720. El panel derecho de cada demo tiene 566px de alto (`.demo`); al agregar controles hay que verificar que no desborde (achicar `.chart-box` o el texto).
- No usar la clase `.controls`: choca con las flechas de navegación de reveal.js y las oculta. Los botones van en `.actions`.
- `<aside class="notes">` son las notas del orador (tecla `S`) y quedan públicas en la página.

## Arquitectura

**Ciclo de vida** (`js/main.js`): cada `<section data-scene="x">` se asocia a `Scenes.x(section)`, que se llama de forma lazy la primera vez que se visita la slide y devuelve `{ start, stop }`. Al cambiar de slide (o al ocultar la pestaña) se para la escena anterior, así que sólo corre la simulación visible. Las slides sin `data-scene` (L4/L7, resumen) son estáticas. `main.js` también monta el control global de velocidad (🐢/🐇, teclas `-`/`+`, persistido en localStorage).

**Motor** (`js/sim.js`, `window.NetKit`):
- `Clock`: reloj propio colgado de `gsap.ticker`. Todo el tiempo de simulación (llegadas, procesamiento, viajes de paquetes, health checks, `wait`/`until`) avanza con `now += dt × Speed.value`, por eso pausar o cambiar la velocidad no altera la dinámica. Las animaciones GSAP sueltas (pops, rebotes) no dependen de este reloj.
- `Sim`: topología clientes → LB opcional → servidores (→ Redis si `sessions: 'shared'`), dibujada en un SVG con viewBox 900×590. Las opciones (`DEFAULTS`) controlan algoritmo (`rr`, `lc`, `random`, `iphash`, `weighted`), tasa, capacidad (workers), cola, health checks, sesiones (`local`/`sticky`/`shared`), etc. API pública: `setRate`, `setUp`/`toggleServer`, `addServer`/`removeServer` (remoción graceful), `setHealthChecks`, `drain`, `deployServer`, `until`, `banner`, `window(sec)` para métricas.
- `reset(opts)` borra el SVG, los timers y el estado, y emite `'reset'`. Los scripts async de las escenas (deploys) comparan `sim.gen` antes y después de cada `await` para abortar si hubo un reset.
- Una request "lenta" se mide por el tiempo dentro del servidor (cola + proceso > `slowThreshold`), no por la latencia total, que incluye el viaje animado de los puntos. La latencia p95 que muestran los widgets sí es la total.

**Widgets** (`js/widgets.js`): contadores, gráfico en vivo y barra de disponibilidad. Leen la `Sim` suscribiéndose a los eventos `'tick'`/`'reset'` (no usan timers, que el `reset` borraría). El helper `setup()` de `scenes.js` los conecta automáticamente según lo que haya en la slide: `.stats` (con `data-fields` opcional), `.strip` y `canvas.chart`. Por eso un canvas con otro propósito tiene que usar otra clase (p. ej. `canvas.cost-chart` en la slide 5).

**Escenas** (`js/scenes.js`): una por slide interactiva. Casi todas son `setup(slide, opts)` más handlers de botones (`on(slide, '[data-act=x]')`), controles segmentados (`seg(slide, group, fn)` sobre `.seg[data-group]`) y bloques de texto por modo (`showMode` sobre `[data-mode]`). Hay dos excepciones:
- `vertical` (slide 5) usa `Sim` pero manipula a mano el único servidor (`hw`/`hh`/`y`/`capacity`, `name` y `status` como etiquetas) y dibuja techo y piso detrás de la simulación.
- `lbha` (slide 14) no usa `Sim`: tiene su propio `Clock` y dibuja dos LBs con VIP, heartbeats y failover.

## Verificación

No hay suite de tests. Para validar cambios visuales o de comportamiento, abrir la slide en Chrome headless (por ejemplo con `puppeteer-core` apuntando al Chrome del sistema), capturar pantalla y revisar errores de consola y si `.panel` desborda (`scrollHeight > clientHeight`).
