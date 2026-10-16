/* Una función por slide interactiva. Cada una recibe el <section> y devuelve { start, stop }.
   main.js las crea la primera vez que se visita la slide y las pausa al salir. */
(function () {
  'use strict';

  const { Sim, Clock, svgEl, cubic, curve, edge, pop, C } = window.NetKit;
  const S = {};

  /* ---------- helpers ---------- */

  function setup(slide, opts) {
    const sim = new Sim(slide.querySelector('svg.sim'), opts);
    const st = slide.querySelector('.stats');
    if (st) Widgets.stats(st, sim, st.dataset.fields ? st.dataset.fields.split(',') : null);
    const strip = slide.querySelector('.strip');
    if (strip) Widgets.strip(strip, sim);
    const cv = slide.querySelector('canvas.chart');
    if (cv) Widgets.chart(cv, sim);
    return sim;
  }

  function on(slide, sel, fn) {
    slide.querySelectorAll(sel).forEach(b => b.addEventListener('click', e => { fn(b, e); b.blur(); }));
  }

  // Control segmentado: <div class="seg" data-group="x"><button data-v="a">…
  function seg(slide, group, fn) {
    const root = slide.querySelector(`.seg[data-group="${group}"]`);
    root.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      root.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      b.blur();
      fn(b.dataset.v);
    }));
  }

  // Muestra solo los elementos [data-mode] que coinciden
  function showMode(slide, mode) {
    slide.querySelectorAll('[data-mode]').forEach(el => { el.hidden = el.dataset.mode !== mode; });
  }

  const life = sim => ({ start: () => sim.start(), stop: () => sim.stop() });

  /* ---------- 1. portada ---------- */

  S.title = slide => {
    const sim = new Sim(slide.querySelector('svg.bg'), {
      clients: 3, servers: 4, rate: 5, colorByClient: true, showHandled: false, serviceTime: 0.6
    });
    return life(sim);
  };

  /* ---------- 2. un nodo ---------- */

  S.single = slide => life(setup(slide, { lb: false, servers: 1, rate: 1.6, serviceTime: 0.6 }));

  /* ---------- 3. SPOF ---------- */

  S.spof = slide => {
    const sim = setup(slide, { lb: false, servers: 1, rate: 2.5, serviceTime: 0.5 });
    on(slide, '[data-act=kill]', () => {
      sim.setUp(sim.servers[0], false);
      sim.banner('💀 SERVICIO CAÍDO: el 100% de los requests falla', C.err);
    });
    on(slide, '[data-act=revive]', () => {
      sim.setUp(sim.servers[0], true);
      sim.banner('');
    });
    return life(sim);
  };

  /* ---------- 4. saturación ---------- */

  S.saturation = slide => {
    const sim = setup(slide, {
      lb: false, servers: 1, rate: 2, arrival: 'poisson', capacity: 4,
      serviceTime: 0.8, serviceJitter: 0.2, queueMax: 10, slowThreshold: 2
    });
    const range = slide.querySelector('input[type=range]');
    const out = slide.querySelector('.rate-out');
    const util = slide.querySelector('.util-out');
    const sync = () => {
      const r = +range.value;
      out.textContent = `${r} req/s`;
      const u = Math.round((r / 5) * 100);
      util.textContent = `${u}%`;
      util.className = 'util-out ' + (u < 70 ? 'ok' : u <= 100 ? 'warn' : 'bad');
      sim.setRate(r);
    };
    range.addEventListener('input', sync);
    on(slide, '[data-act=reset]', () => { range.value = 2; sim.reset(); sync(); });
    sync();
    return life(sim);
  };

  /* ---------- 5. escalado vertical ---------- */

  S.vertical = slide => {
    const svg = slide.querySelector('svg.sim');
    svg.setAttribute('viewBox', '0 0 900 590');
    svg.classList.add('netsim');

    const steps = [
      { spec: '2 vCPU · 4 GB', label: '2', w: 130, h: 90, cap: 1, cost: 1 },
      { spec: '4 vCPU · 16 GB', label: '4', w: 150, h: 140, cap: 2, cost: 2.4 },
      { spec: '16 vCPU · 64 GB', label: '16', w: 180, h: 215, cap: 6, cost: 10 },
      { spec: '64 vCPU · 256 GB', label: '64', w: 210, h: 300, cap: 16, cost: 45 },
      { spec: '128 vCPU · 1 TB', label: '128', w: 235, h: 380, cap: 24, cost: 140 },
      { spec: '224 vCPU · 12 TB', label: '224', w: 255, h: 445, cap: 29, cost: 480 }
    ];
    const FLOOR = 540, CEIL = 80, X = 560;

    svgEl('rect', { x: 0, y: 0, width: 900, height: CEIL, class: 'ceil-zone' }, svg);
    const ceil = svgEl('line', { x1: 20, x2: 880, y1: CEIL, y2: CEIL, class: 'ceil' }, svg);
    svgEl('text', { x: 880, y: CEIL - 12, class: 't-sub', 'text-anchor': 'end' }, svg)
      .textContent = 'techo físico: la máquina más grande que se puede comprar';
    svgEl('line', { x1: 20, x2: 880, y1: FLOOR, y2: FLOOR, class: 'floor' }, svg);

    const client = { x: 130, y: 400, hw: 46, hh: 27 };
    const link = svgEl('path', { class: 'link' }, svg);
    const cg = svgEl('g', { class: 'client', transform: `translate(${client.x},${client.y})` }, svg);
    cg.style.setProperty('--c', '#7dd3fc');
    svgEl('rect', { class: 'node-box', x: -46, y: -27, width: 92, height: 54, rx: 10 }, cg);
    svgEl('text', { x: -28, y: 7, class: 't-emoji', 'text-anchor': 'middle' }, cg).textContent = '👥';
    svgEl('text', { x: -12, y: 5, class: 't-title small' }, cg).textContent = 'Usuarios';

    const sg = svgEl('g', { class: 'srv' }, svg);
    const box = svgEl('rect', { class: 'node-box', rx: 12 }, sg);
    const spec = svgEl('text', { class: 't-title', 'text-anchor': 'middle' }, sg);
    const note = svgEl('text', { class: 't-sub', 'text-anchor': 'middle' }, sg);
    const top = svgEl('g', {}, svg);

    const dim = { w: 0, h: 0 };
    let i = 0, busy = false;
    const draw = () => {
      box.setAttribute('x', X - dim.w / 2); box.setAttribute('y', FLOOR - dim.h);
      box.setAttribute('width', dim.w); box.setAttribute('height', dim.h);
      spec.setAttribute('x', X); spec.setAttribute('y', FLOOR - dim.h + 26);
      note.setAttribute('x', X); note.setAttribute('y', FLOOR - dim.h + 46);
      const srv = { x: X, y: Math.max(FLOOR - dim.h / 2, FLOOR - 120), hw: dim.w / 2, hh: 10 };
      link.setAttribute('d', curve(edge(client, srv), edge(srv, client)));
    };

    const canvas = slide.querySelector('canvas.chart');
    const ch = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          { label: 'Capacidad (×)', data: [], yAxisID: 'y', backgroundColor: 'rgba(56,189,248,.7)', borderRadius: 4 },
          {
            type: 'line', label: 'Costo (×)', data: [], yAxisID: 'y1', borderColor: '#f87171',
            backgroundColor: '#f87171', tension: 0.3, pointRadius: 4, borderWidth: 3
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#cbd5e1', boxWidth: 10, font: { size: 12 } } } },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { display: false }, title: { display: true, text: 'vCPU', color: '#64748b' } },
          y: { min: 0, max: 32, ticks: { color: '#38bdf8' }, grid: { color: 'rgba(148,163,184,.12)' } },
          y1: { position: 'right', min: 0, max: 500, ticks: { color: '#f87171' }, grid: { display: false } }
        }
      }
    });

    const apply = (k, animate) => {
      const st = steps[k];
      spec.textContent = st.spec;
      note.textContent = `capacidad ×${st.cap} · costo ×${st.cost}`;
      ch.data.labels.push(st.label);
      ch.data.datasets[0].data.push(st.cap);
      ch.data.datasets[1].data.push(st.cost);
      ch.update();
      if (animate) gsap.to(dim, { w: st.w, h: st.h, duration: 1, ease: 'elastic.out(1, 0.55)', onUpdate: draw });
      else { dim.w = st.w; dim.h = st.h; draw(); }
    };

    const reset = () => {
      i = 0; busy = false;
      gsap.killTweensOf(dim);
      sg.setAttribute('class', 'srv');
      ceil.classList.remove('hit');
      top.innerHTML = '';
      ch.data.labels = []; ch.data.datasets.forEach(d => { d.data = []; });
      apply(0, false);
    };

    on(slide, '[data-act=up]', () => {
      if (busy) return;
      if (i >= steps.length - 1) {
        ceil.classList.add('hit');
        gsap.fromTo(dim, { h: dim.h + 22 }, { h: dim.h, duration: 0.8, ease: 'elastic.out(1, 0.3)', onUpdate: draw });
        gsap.fromTo(sg, { x: -10 }, { x: 0, duration: 0.6, ease: 'elastic.out(1, 0.25)' });
        pop(top, X, CEIL + 40, '🚫 No existe una máquina más grande', C.err);
        return;
      }
      busy = true;
      i++;
      // redimensionar una VM implica apagarla: downtime
      sg.setAttribute('class', 'srv down');
      spec.textContent = '⏻ reiniciando…';
      note.textContent = 'redimensionar = apagar la VM';
      pop(top, X, FLOOR - dim.h - 14, 'downtime', C.err);
      gsap.delayedCall(0.9, () => {
        sg.setAttribute('class', 'srv');
        apply(i, true);
        busy = false;
      });
    });
    on(slide, '[data-act=reset]', reset);
    reset();
    return { start() {}, stop() {} };
  };

  /* ---------- 6. deploy con downtime ---------- */

  S.deploy = slide => {
    const sim = setup(slide, { lb: false, servers: 1, rate: 3, serviceTime: 0.5, showVersion: true });
    let busy = false, version = 1;
    on(slide, '[data-act=deploy]', async () => {
      if (busy) return;
      busy = true;
      const gen = sim.gen, v = `v${++version}`;
      sim.banner(`🚀 Deploy ${v}: detener → actualizar → arrancar`, C.slow);
      await sim.deployServer(sim.servers[0], v, 4);
      if (gen !== sim.gen) return;
      sim.banner(`✔ ${v} en producción… después de 4 s sin servicio`, C.ok);
      await sim.clock.wait(2.5);
      if (gen === sim.gen) sim.banner('');
      busy = false;
    });
    on(slide, '[data-act=reset]', () => { busy = false; version = 1; sim.reset(); });
    return life(sim);
  };

  /* ---------- 7. escalado horizontal ---------- */

  S.idea = slide => {
    const sim = setup(slide, {
      servers: 1, rate: 8, capacity: 4, serviceTime: 0.8, queueMax: 8, arrival: 'poisson', slowThreshold: 2.5
    });
    const out = slide.querySelector('.srv-out');
    const sync = () => {
      const n = sim.activeServers();
      out.innerHTML = `<b>${n}</b> servidor${n > 1 ? 'es' : ''} · capacidad ≈ <b>${n * 5}</b> req/s · tráfico <b>8</b> req/s`;
    };
    on(slide, '[data-act=add]', () => { sim.addServer(); sync(); });
    on(slide, '[data-act=remove]', () => { sim.removeServer(); sync(); });
    on(slide, '[data-act=reset]', () => { sim.reset(); sync(); });
    sync();
    return life(sim);
  };

  /* ---------- 8. round robin ---------- */

  S.rr = slide => {
    const sim = setup(slide, { servers: 3, rate: 2, arrival: 'steady', serviceTime: 1, serviceJitter: 0 });
    on(slide, '[data-act=add]', () => sim.addServer());
    on(slide, '[data-act=remove]', () => sim.removeServer());
    on(slide, '[data-act=reset]', () => sim.reset());
    return life(sim);
  };

  /* ---------- 9. least connections ---------- */

  S.lc = slide => {
    const base = {
      servers: 3, rate: 5, capacity: 3, serviceTime: 0.45, heavyRatio: 0.2, heavyFactor: 8,
      queueMax: 8, arrival: 'poisson', slowThreshold: 2.5
    };
    const sim = setup(slide, Object.assign({ algorithm: 'rr' }, base));
    seg(slide, 'algo', v => sim.reset(Object.assign({ algorithm: v }, base)));
    return life(sim);
  };

  /* ---------- 10. ip hash / weighted ---------- */

  S.hash = slide => {
    const modes = {
      iphash: { clients: 4, servers: 3, algorithm: 'iphash', colorByClient: true, rate: 3, serviceTime: 0.7 },
      weighted: { clients: 1, servers: 3, algorithm: 'weighted', weights: [3, 1, 1], capacity: 2, rate: 4, serviceTime: 0.7 }
    };
    const sim = setup(slide, modes.iphash);
    showMode(slide, 'iphash');
    seg(slide, 'mode', v => { showMode(slide, v); sim.reset(modes[v]); });
    on(slide, '[data-act=add]', () => sim.addServer());
    on(slide, '[data-act=remove]', () => sim.removeServer());
    return life(sim);
  };

  /* ---------- 11. health checks ---------- */

  S.health = slide => {
    const sim = setup(slide, {
      servers: 3, rate: 4, serviceTime: 0.6, clickToKill: true, healthChecks: false, hcInterval: 1, hcFall: 2
    });
    seg(slide, 'hc', v => sim.setHealthChecks(v === 'on'));
    on(slide, '[data-act=revive]', () => sim.servers.forEach(s => sim.setUp(s, true)));
    return life(sim);
  };

  /* ---------- 12. sesiones ---------- */

  S.sessions = slide => {
    const opts = mode => ({
      clients: 4, servers: 3, rate: 3, colorByClient: true, serviceTime: 0.6, sessions: mode,
      clickToKill: true, healthChecks: true, hcInterval: 1, hcFall: 1, showHandled: false
    });
    const sim = setup(slide, opts('local'));
    showMode(slide, 'local');
    seg(slide, 'mode', v => { showMode(slide, v); sim.reset(opts(v)); });
    return life(sim);
  };

  /* ---------- 14. LB redundante ---------- */

  S.lbha = slide => {
    const svg = slide.querySelector('svg.sim');
    svg.setAttribute('viewBox', '0 0 900 590');
    svg.classList.add('netsim');
    const stripEl = slide.querySelector('.strip');
    const clock = new Clock();
    let mode = 'ha', st;

    const node = (cls, n, title, sub) => {
      const g = svgEl('g', { class: cls, transform: `translate(${n.x},${n.y})` }, st.gN);
      const inner = svgEl('g', {}, g);
      n.box = svgEl('rect', { class: 'node-box', x: -n.hw, y: -n.hh, width: n.hw * 2, height: n.hh * 2, rx: 12 }, inner);
      n.title = svgEl('text', { x: 0, y: sub ? -4 : 5, class: 't-title', 'text-anchor': 'middle' }, inner);
      n.title.textContent = title;
      if (sub != null) {
        n.sub = svgEl('text', { x: 0, y: 16, class: 't-sub', 'text-anchor': 'middle' }, inner);
        n.sub.textContent = sub;
      }
      n.g = g; n.inner = inner;
      return n;
    };

    const move = (pk, a, b, done, dur = 0.45) => {
      clock.animate(dur, p => {
        const P = cubic(edge(a, b), edge(b, a), p);
        pk.setAttribute('cx', P.x); pk.setAttribute('cy', P.y);
      }, done);
    };
    const path = (pk, nodes, done) => {
      if (nodes.length < 2) { done && done(); return; }
      move(pk, nodes[0], nodes[1], () => path(pk, nodes.slice(1), done));
    };

    const vipPos = n => ({ x: n.x, y: n.y - n.hh - 22 });

    function refresh() {
      const { A, B, vip } = st;
      [A, B].filter(Boolean).forEach(n => {
        n.g.setAttribute('class', 'lb' + (n.up ? '' : ' down') + (vip === n ? ' active' : ' passive'));
        if (!n.up) n.sub.textContent = '✖ caído';
        else n.sub.textContent = vip === n ? 'ACTIVO' : 'pasivo (standby)';
      });
      st.links.forEach(l => l.el.classList.toggle('off', l.lb !== vip || !l.lb.up));
    }

    function build() {
      clock.clear();
      svg.innerHTML = '';
      st = {
        gL: svgEl('g', {}, svg), gN: svgEl('g', {}, svg), gP: svgEl('g', {}, svg), gT: svgEl('g', {}, svg),
        rr: 0, links: [], missed: 0, ok: 0, err: 0
      };
      const client = { x: 80, y: 295, hw: 46, hh: 27 };
      const A = { x: 380, y: mode === 'ha' ? 165 : 295, hw: 74, hh: 42, up: true };
      const B = mode === 'ha' ? { x: 380, y: 425, hw: 74, hh: 42, up: true } : null;
      const servers = [0, 1, 2].map(i => ({ x: 740, y: 130 + i * 165, hw: 82, hh: 34 }));
      Object.assign(st, { client, A, B, servers, vip: A });

      [A, B].filter(Boolean).forEach(lb => {
        const cl = { lb, el: svgEl('path', { class: 'link', d: curve(edge(client, lb), edge(lb, client)) }, st.gL) };
        st.links.push(cl);
        servers.forEach(s => st.links.push({ lb, el: svgEl('path', { class: 'link', d: curve(edge(lb, s), edge(s, lb)) }, st.gL) }));
      });
      if (B) st.hbLine = svgEl('path', { class: 'link hb', d: `M${A.x},${A.y + A.hh} L${B.x},${B.y - B.hh}` }, st.gL);

      const cg = svgEl('g', { class: 'client', transform: `translate(${client.x},${client.y})` }, st.gN);
      cg.style.setProperty('--c', '#7dd3fc');
      svgEl('rect', { class: 'node-box', x: -46, y: -27, width: 92, height: 54, rx: 10 }, cg);
      svgEl('text', { x: -28, y: 7, class: 't-emoji', 'text-anchor': 'middle' }, cg).textContent = '👥';
      svgEl('text', { x: -12, y: 5, class: 't-title small' }, cg).textContent = 'Usuarios';

      node('lb', A, 'LB-A', '');
      if (B) node('lb', B, 'LB-B', '');
      servers.forEach((s, i) => node('srv', s, `S${i + 1}`, null));

      const p = vipPos(A);
      st.vipG = svgEl('g', { class: 'vip', transform: `translate(${p.x},${p.y})` }, st.gT);
      svgEl('rect', { x: -58, y: -15, width: 116, height: 30, rx: 15 }, st.vipG);
      svgEl('text', { x: 0, y: 5, 'text-anchor': 'middle' }, st.vipG).textContent = 'VIP 10.0.0.100';
      st.hbText = svgEl('text', { x: 392, y: 300, class: 't-hb' }, st.gT);

      refresh();
      clock.every(0.4, spawn);
      if (B) clock.every(0.5, heartbeat);
      clock.every(0.5, tickStrip);
      stripEl.innerHTML = '';
    }

    function spawn() {
      const { client, servers } = st;
      const target = st.vip;
      const pk = svgEl('circle', { r: 5.5, fill: C.req, class: 'pk' }, st.gP);
      move(pk, client, target, () => {
        if (!target.up) {
          pop(st.gT, target.x - target.hw, target.y - target.hh - 8, 'timeout', C.err);
          pk.setAttribute('fill', C.err);
          move(pk, target, client, () => { pk.remove(); st.err++; });
          return;
        }
        const s = servers[st.rr++ % servers.length];
        path(pk, [target, s], () => {
          pk.style.opacity = 0;
          clock.after(0.35, () => {
            pk.style.opacity = 1;
            pk.setAttribute('fill', C.ok);
            path(pk, [s, target, client], () => { pk.remove(); st.ok++; });
          });
        });
      });
    }

    function heartbeat() {
      const { A, B } = st;
      const active = st.vip, passive = active === A ? B : A;
      if (active.up && passive.up) {
        st.missed = 0;
        st.hbText.textContent = '♥ heartbeat OK';
        [[active, passive], [passive, active]].forEach(([a, b]) => {
          const pk = svgEl('circle', { r: 4, fill: C.hc, class: 'pk' }, st.gP);
          clock.animate(0.35, p => {
            const y0 = a.y + Math.sign(b.y - a.y) * a.hh, y1 = b.y + Math.sign(a.y - b.y) * b.hh;
            pk.setAttribute('cx', a.x); pk.setAttribute('cy', y0 + (y1 - y0) * p);
          }, () => pk.remove());
        });
        return;
      }
      if (!active.up && passive.up) {
        st.missed++;
        st.hbText.textContent = `⚠ heartbeat perdido ${Math.min(st.missed, 3)}/3`;
        if (st.missed >= 3) failover(passive);
      }
    }

    function failover(to) {
      st.vip = to;
      st.missed = 0;
      st.hbText.textContent = '⇄ failover: LB-B toma la VIP';
      const p = vipPos(to);
      gsap.to(st.vipG, { attr: { transform: `translate(${p.x},${p.y})` }, duration: 0.8, ease: 'power3.inOut' });
      pop(st.gT, to.x, to.y - to.hh - 8, '✔ ahora soy el activo', C.ok);
      refresh();
    }

    function tickStrip() {
      const i = document.createElement('i');
      i.className = st.ok + st.err === 0 ? 'idle' : st.err === 0 ? 'up' : st.ok === 0 ? 'down' : 'partial';
      st.ok = st.err = 0;
      stripEl.appendChild(i);
      while (stripEl.children.length > 80) stripEl.firstChild.remove();
    }

    on(slide, '[data-act=kill]', () => {
      const n = st.vip;
      if (!n.up) return;
      n.up = false;
      gsap.fromTo(n.inner, { x: -8 }, { x: 0, duration: 0.6, ease: 'elastic.out(1, 0.3)' });
      st.hbText.textContent = mode === 'ha' ? '' : '💀 sin LB no entra ningún request';
      refresh();
    });
    on(slide, '[data-act=reset]', build);
    seg(slide, 'mode', v => { mode = v; build(); });
    build();
    return { start: () => clock.start(), stop: () => clock.stop() };
  };

  /* ---------- 15. rolling deploy ---------- */

  S.rolling = slide => {
    const sim = setup(slide, {
      servers: 4, rate: 5, capacity: 3, serviceTime: 0.6, healthChecks: true,
      hcInterval: 0.5, hcFall: 1, showVersion: true
    });
    let busy = false, version = 1;

    on(slide, '[data-act=rolling]', async () => {
      if (busy) return;
      busy = true;
      const gen = sim.gen, v = `v${++version}`;
      const list = [...sim.servers];
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        sim.banner(`Rolling deploy ${v}: ${s.name} (${i + 1}/${list.length})`, C.hc);
        await sim.drain(s);
        if (gen !== sim.gen) return;
        await sim.deployServer(s, v, 1.6);
        if (gen !== sim.gen) return;
        await sim.until(() => s.healthy);
        s.draining = false;
      }
      sim.banner(`✔ Todos en ${v}, sin cortar el servicio`, C.ok);
      await sim.clock.wait(3);
      if (gen === sim.gen) sim.banner('');
      busy = false;
    });

    on(slide, '[data-act=bigbang]', async () => {
      if (busy) return;
      busy = true;
      const gen = sim.gen, v = `v${++version}`;
      sim.banner(`💥 Deploy ${v} en todos a la vez`, C.err);
      await Promise.all(sim.servers.map(s => sim.deployServer(s, v, 3)));
      if (gen !== sim.gen) return;
      sim.banner('');
      busy = false;
    });

    on(slide, '[data-act=reset]', () => { busy = false; version = 1; sim.reset(); });
    return life(sim);
  };

  /* ---------- 16. playground ---------- */

  S.playground = slide => {
    const sim = setup(slide, {
      clients: 4, servers: 3, rate: 6, capacity: 4, serviceTime: 0.7, arrival: 'poisson',
      clickToKill: true, healthChecks: true, hcInterval: 1, hcFall: 2, queueMax: 8
    });
    const range = slide.querySelector('input[type=range]');
    const out = slide.querySelector('.rate-out');
    const srvOut = slide.querySelector('.srv-out');
    const algo = slide.querySelector('select');
    const hc = slide.querySelector('input[name=hc]');
    const heavy = slide.querySelector('input[name=heavy]');

    const syncSrv = () => {
      const n = sim.activeServers();
      srvOut.textContent = `${n} · capacidad ≈ ${Math.round(n * 4 / 0.7)} req/s`;
    };
    range.addEventListener('input', () => { out.textContent = `${range.value} req/s`; sim.setRate(+range.value); });
    algo.addEventListener('change', () => { sim.o.algorithm = algo.value; algo.blur(); });
    hc.addEventListener('change', () => sim.setHealthChecks(hc.checked));
    heavy.addEventListener('change', () => { sim.o.heavyRatio = heavy.checked ? 0.2 : 0; });
    on(slide, '[data-act=add]', () => { sim.addServer(); syncSrv(); });
    on(slide, '[data-act=remove]', () => { sim.removeServer(); syncSrv(); });
    on(slide, '[data-act=reset]', () => {
      range.value = 6; out.textContent = '6 req/s';
      algo.value = 'rr'; hc.checked = true; heavy.checked = false;
      sim.reset(Object.assign({}, sim.o, { rate: 6, algorithm: 'rr', healthChecks: true, heavyRatio: 0, servers: 3 }));
      syncSrv();
    });
    syncSrv();
    return life(sim);
  };

  window.Scenes = S;
})();
