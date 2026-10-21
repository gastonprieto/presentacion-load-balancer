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

## Laboratorio con Docker

Lo mismo que muestran las simulaciones, pero con servicios reales: tres copias de una app (`app1`, `app2`, `app3`) detrás de **HAProxy**, más un **Redis** para las sesiones compartidas. Hace falta Docker con Compose.

```bash
docker compose up -d --build        # levanta todo
docker compose logs -f app1 app2 app3   # en otra terminal: ver a qué app llega cada pedido
docker compose down                 # al terminar
```

| Puerto | Qué es | Slide |
|---|---|---|
| `localhost:8001` | `app1` directo, sin load balancer | Un cliente, un servidor · SPOF · Saturación · Cada deploy es una caída |
| `localhost:8080` | LB round robin | Round Robin · Health checks · Sesión · Rolling deploy |
| `localhost:8081` | LB least connections | Least Connections |
| `localhost:8082` | LB IP hash | IP Hash y Weighted |
| `localhost:8083` | LB weighted (app1 pesa 3, app2 y app3 pesan 1) | IP Hash y Weighted |
| `localhost:8084` | LB con sticky sessions (cookie) | ¿Dónde vive la sesión? |
| `localhost:8085` | LB en capa 4 (TCP) | Capa 4 vs. Capa 7 |
| `localhost:8404` | Panel de HAProxy: estado de cada app, pedidos y health checks (se refresca solo) | todas |

La configuración del LB está en `lab/haproxy/haproxy.cfg` (comentada); si la cambiás, `docker compose restart lb` la aplica. La app (`lab/app/server.js`) atiende 4 pedidos en paralelo (`WORKERS`), deja esperar 10 más (`COLA`) y al resto le responde **503**; cada pedido tarda 100 ms (`WORK_MS`). Se cambia en `docker-compose.yml`.

Endpoints de la app (en cualquier puerto):

| Endpoint | Qué hace |
|---|---|
| `GET /` | trabaja 100 ms y responde qué app lo atendió (`app2 · pedido #14 · 103 ms`) |
| `GET /lento?ms=5000` | un pedido que ocupa un worker 5 s |
| `GET /health` | lo que consulta el LB cada 2 s (200 sana, 503 enferma) |
| `POST /enfermar` · `POST /curar` | hace que `/health` responda 503 / 200 sin apagar la app |
| `GET /cliente` | muestra desde qué IP llega la conexión y los headers que agregó el LB |
| `GET /sesion` | contador de visitas guardado en la memoria de esa app |
| `GET /sesion-compartida` | el mismo contador, guardado en Redis |

### Generador de carga

```bash
docker compose run --rm carga http://lb:8080/ -c 20 -n 300   # 300 pedidos, 20 en paralelo
docker compose run --rm carga http://lb:8080/ -c 5 -d 30     # 30 segundos, una línea por segundo
```

Muestra cuántos pedidos atendió cada app (`LB` = respuestas que dio el propio balanceador, como un 503 o 504), cuántos dieron 5xx o no pudieron conectarse, y p50/p95/p99. Corre dentro de la red de Docker, por eso las URLs son `http://lb:8080/` o `http://app1:3000/` (no `localhost`).

### Recorrido

**Un solo nodo y saturación.** Con una sola app, 30 clientes a la vez no entran (4 trabajando + 10 en cola): casi todo vuelve 503. Con el LB, la misma carga se reparte entre tres y no hay errores.

```bash
docker compose run --rm carga http://app1:3000/ -c 30 -n 300   # ok ~14 · 5xx ~286
docker compose run --rm carga http://lb:8080/  -c 30 -n 300    # app1:100 app2:100 app3:100 · 5xx 0
```

**Round robin.** Cada pedido va a la siguiente app, en orden:

```bash
for i in $(seq 6); do curl -s localhost:8080/; done
```

**Least connections.** Dejá dos pedidos lentos colgados y mandá pedidos rápidos. En round robin los rápidos siguen yendo también a las apps ocupadas; en least connections van todos a la que está libre.

```bash
curl -s "localhost:8081/lento?ms=8000" & curl -s "localhost:8081/lento?ms=8000" &
for i in $(seq 6); do curl -s localhost:8081/; done      # todos a la misma app (la libre)
# repetir con 8080 para comparar
```

**p50, p95, p99.** Cargá el LB por encima de lo que da y mirá cómo se separan los percentiles: la mediana sigue bien y la cola se estira.

```bash
docker compose run --rm carga http://lb:8080/ -c 45 -n 600
```

**IP hash y weighted.** Desde tu máquina, todos los pedidos tienen la misma IP de origen, así que siempre caen en la misma app. El generador de carga corre en otro contenedor (otra IP) y puede caer en otra. Con weighted, app1 recibe el triple que las demás.

```bash
for i in $(seq 4); do curl -s localhost:8082/; done                       # siempre la misma app
docker compose run --rm carga http://lb:8082/ -n 20 -c 1                  # quizás otra
docker compose run --rm carga http://lb:8083/ -n 100 -c 5                 # app1:60 app2:20 app3:20
```

**¿Dónde vive la sesión?** `-b/-c` hacen que curl guarde y mande la cookie como un navegador.

```bash
rm -f /tmp/cj; for i in $(seq 4); do curl -s -b /tmp/cj -c /tmp/cj localhost:8080/sesion; done
#  → el contador "se reinicia" cada vez que cambia de app: la sesión vive en la memoria de cada una
rm -f /tmp/cj; for i in $(seq 4); do curl -s -b /tmp/cj -c /tmp/cj localhost:8084/sesion; done
#  → sticky: el LB agrega la cookie LB_SERVIDOR y siempre te manda a la misma app
rm -f /tmp/cj; for i in $(seq 4); do curl -s -b /tmp/cj -c /tmp/cj localhost:8080/sesion-compartida; done
#  → Redis: cambia de app en cada pedido y el contador sigue subiendo
```

Con sticky, apagá la app que te tocó (`docker compose stop app1`) y volvé a pedir: el LB te manda a otra y la sesión se pierde.

**Capa 4 vs. capa 7.** En capa 7 el LB lee HTTP: agrega `X-Forwarded-For` (la IP real del cliente) y `X-Balanceador`. En capa 4 sólo pasa bytes: la app ve la IP del LB y ningún header nuevo.

```bash
curl -s localhost:8080/cliente
curl -s localhost:8085/cliente
docker compose logs lb --tail 5     # el log de capa 7 tiene la URL y el código HTTP; el de capa 4, sólo bytes
```

### Romper cosas

Dejá abiertos el panel `http://localhost:8404` y, en otra terminal, carga continua mientras rompés:

```bash
docker compose run --rm carga http://lb:8080/ -c 5 -d 120
```

| Qué romper | Comando | Qué se ve | Volver |
|---|---|---|---|
| Una app sin LB (SPOF) | `docker compose stop app1` y `curl localhost:8001/` | `Failed to connect`: no hay nadie más que atienda | `docker compose start app1` |
| Una app detrás del LB | `docker compose stop app2` | En el panel app2 pasa a rojo (DOWN) en ~4 s; la carga sigue con app1 y app3 y sin errores (si la conexión falla, HAProxy reintenta en otra) | `docker compose start app2` (vuelve a UP tras 2 checks) |
| Una app que sigue viva pero responde mal | `docker compose exec app3 wget -qO- --post-data= localhost:3000/enfermar` | El proceso está levantado pero `/health` da 503: el LB la saca igual. Es lo que mira el health check, no si el contenedor existe | `… /curar` |
| Una app colgada (no responde nada) | `docker compose pause app3` | Peor que caída: el health check la saca en ~4 s, pero los pedidos que ya estaban adentro quedan esperando y frenan a sus clientes (la carga baja casi a cero). A los 10 s el LB se cansa (`timeout server`) y les responde **504** (en la carga aparecen como `LB:`). Por eso importan los timeouts | `docker compose unpause app3` |
| Todas las apps | `docker compose stop app1 app2 app3` | El LB sigue vivo y contesta **503** él mismo (no hay servidores sanos) | `docker compose start app1 app2 app3` |
| El load balancer (nuevo SPOF) | `docker compose stop lb` | Todos los puertos 808x dan `Failed to connect` aunque las tres apps están perfectas | `docker compose start lb` |
| Redis | `docker compose stop redis` | `/sesion-compartida` da 500: la sesión compartida depende de otra pieza | `docker compose start redis` |
| Saturar | `docker compose run --rm carga http://lb:8080/ -c 60 -n 600` | 503 de las apps (cola llena) aunque ninguna esté caída | — |

**Cada deploy es una caída vs. rolling deploy.** Reiniciar la única app corta el servicio; detrás del LB, reemplazar las apps de a una no pierde ningún pedido. La app, al recibir la señal de apagado, primero hace que `/health` responda 503, sigue atendiendo 6 s mientras el LB la saca y recién después se cierra.

```bash
# sin LB: aparecen pedidos "sin conexión" mientras reinicia
docker compose run --rm carga http://app1:3000/ -c 3 -d 15 &
sleep 3; docker compose restart -t 0 app1

# con LB: deploy de a una app, carga corriendo, 0 errores
docker compose run --rm carga http://lb:8080/ -c 5 -d 60 &
for app in app1 app2 app3; do docker compose up -d --build --force-recreate --no-deps $app; sleep 12; done
```
