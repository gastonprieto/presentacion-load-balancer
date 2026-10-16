/* Inicializa reveal.js y prende/apaga la simulación de cada slide al entrar/salir. */
(function () {
  'use strict';

  const instances = new Map();

  function activate(slide) {
    const name = slide && slide.dataset.scene;
    if (!name || !window.Scenes[name]) return;
    let inst = instances.get(slide);
    if (!inst) {
      inst = window.Scenes[name](slide);
      instances.set(slide, inst);
    }
    inst.start();
  }

  function deactivate(slide) {
    const inst = slide && instances.get(slide);
    if (inst) inst.stop();
  }

  Reveal.initialize({
    hash: true,
    width: 1280,
    height: 720,
    margin: 0.03,
    center: false,
    controls: true,
    progress: true,
    slideNumber: 'c/t',
    transition: 'slide',
    backgroundTransition: 'fade',
    plugins: [RevealNotes]
  }).then(() => activate(Reveal.getCurrentSlide()));

  Reveal.on('slidechanged', e => {
    deactivate(e.previousSlide);
    activate(e.currentSlide);
  });

  // Control de velocidad de las simulaciones: botones abajo a la izquierda o teclas - / +
  const STEPS = [0.25, 0.4, 0.6, 0.8, 1, 1.5];
  const Speed = window.NetKit.Speed;
  try {
    const saved = parseFloat(localStorage.getItem('sim-speed'));
    if (STEPS.includes(saved)) Speed.value = saved;
  } catch (e) { /* sin storage */ }

  const ui = document.createElement('div');
  ui.className = 'speed-ctl';
  ui.innerHTML = '<button data-d="-1" title="Más lento (-)">🐢</button><span></span><button data-d="1" title="Más rápido (+)">🐇</button>';
  document.body.appendChild(ui);
  const label = ui.querySelector('span');

  function setSpeed(v) {
    Speed.value = v;
    label.textContent = `${String(v).replace('.', ',')}×`;
    try { localStorage.setItem('sim-speed', v); } catch (e) { /* sin storage */ }
  }
  function step(d) {
    const i = STEPS.indexOf(Speed.value);
    setSpeed(STEPS[Math.max(0, Math.min(STEPS.length - 1, (i < 0 ? 2 : i) + d))]);
  }
  ui.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { step(+b.dataset.d); b.blur(); }));
  Reveal.addKeyBinding({ keyCode: 189, key: '-', description: 'Simulación más lenta' }, () => step(-1));
  Reveal.addKeyBinding({ keyCode: 187, key: '+', description: 'Simulación más rápida' }, () => step(1));
  setSpeed(Speed.value);

  // Si la pestaña queda oculta, pausar para no acumular tiempo
  document.addEventListener('visibilitychange', () => {
    const s = Reveal.getCurrentSlide();
    if (document.hidden) deactivate(s); else activate(s);
  });
})();
