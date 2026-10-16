# De un nodo a muchos · Load Balancing

Presentación interactiva (reveal.js + GSAP + Chart.js) sobre los problemas de tener un solo nodo y cómo resolverlos con un load balancer.

## Cómo abrirla

Doble clic en `index.html`. Funciona offline y sin build: las librerías están en `vendor/`.

## Teclas

| Tecla | Acción |
|---|---|
| `→` / `←` | avanzar / retroceder |
| `S` | notas del orador (ventana aparte, con guion y preguntas para la clase) |
| `F` | pantalla completa |
| `O` / `Esc` | vista general |
| `-` / `+` | velocidad de las simulaciones (también con 🐢/🐇 abajo a la izquierda; se recuerda entre sesiones) |

## Celular

En un teléfono se carga automáticamente una versión móvil: las slides quedan una debajo de la otra con scroll, los diagramas son verticales y cada simulación se activa al llegar a ella. Se puede forzar con `?mobile=1` (o desactivar con `?mobile=0`).

## Estructura

```
index.html        slides y notas del orador
css/theme.css     tema oscuro
js/sim.js         motor de simulación (clientes → LB → servidores), reloj sobre gsap.ticker
js/widgets.js     contadores, gráfico en vivo y barra de disponibilidad
js/scenes.js      configuración e interacción de cada slide
js/main.js        reveal.js + pausa/reanuda la simulación al cambiar de slide
vendor/           reveal.js 5.1.0, GSAP 3.12.5, Chart.js 4.4.1
```

Cada simulación sólo corre mientras su slide está visible.
