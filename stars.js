// Dandi's Radio starfield: layered twinkling stars, slow drift, faint nebula glow
// and the odd shooting star. Follows the theme picker and the "Pause background" toggle.
(() => {
  const canvas = document.createElement('canvas');
  canvas.id = 'starfield';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const palettes = {
    aurora: { stars: ['#ffffff', '#e9f5df', '#cfe8c0', '#b4c99c', '#d6e4ff'], glow: ['#3c5a3f', '#26402f'], shoot: '#e9f5df' },
    ember: { stars: ['#ffffff', '#ffe9d2', '#ffd2a8', '#f3b58a', '#ffe3e3'], glow: ['#6a3526', '#4a2a22'], shoot: '#ffe0c0' },
    ocean: { stars: ['#ffffff', '#dfeaff', '#b9d2f5', '#a6bfda', '#e6dcff'], glow: ['#27427a', '#2a2452'], shoot: '#dfeaff' }
  };
  const layers = [
    { count: 0.00022, size: [0.35, 0.8], speed: 0.6, alpha: [0.25, 0.6] },
    { count: 0.00009, size: [0.7, 1.3], speed: 1.4, alpha: [0.4, 0.85] },
    { count: 0.00003, size: [1.2, 2.0], speed: 2.6, alpha: [0.6, 1] }
  ];

  let width = 0, height = 0, dpr = 1, stars = [], shooting = [], nextShot = 0, last = 0, frame = 0;
  let palette = palettes.aurora;
  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const isStill = () => document.body.classList.contains('still');

  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const area = width * height;
    stars = [];
    layers.forEach((layer, depth) => {
      const total = Math.round(area * layer.count);
      for (let i = 0; i < total; i++) {
        // Bunch some of the faint stars into a diagonal band, like a thin milky way.
        let x = Math.random() * width, y = Math.random() * height;
        if (depth === 0 && Math.random() < 0.45) {
          const t = Math.random();
          x = t * width;
          y = height * (0.85 - t * 0.7) + rand(-1, 1) * rand(0, height * 0.12);
        }
        stars.push({
          x, y, depth,
          r: rand(...layer.size),
          base: rand(...layer.alpha),
          twinkle: rand(0.4, 1.8),
          phase: Math.random() * Math.PI * 2,
          speed: layer.speed,
          color: Math.random() < 0.82 ? palette.stars[0] : pick(palette.stars.slice(1))
        });
      }
    });
  }

  function recolour() {
    palette = palettes[document.body.dataset.theme] || palettes.aurora;
    stars.forEach(star => { star.color = Math.random() < 0.82 ? palette.stars[0] : pick(palette.stars.slice(1)); });
    if (isStill()) draw(last, 0);
  }

  function nebula() {
    const blobs = [
      [width * 0.82, height * 0.12, Math.max(width, height) * 0.55, palette.glow[0], 0.35],
      [width * 0.12, height * 0.9, Math.max(width, height) * 0.5, palette.glow[1], 0.28]
    ];
    blobs.forEach(([x, y, r, colour, alpha]) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, colour);
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = alpha;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    });
    ctx.globalAlpha = 1;
  }

  function spawnShot(now) {
    const fromLeft = Math.random() < 0.5;
    const angle = rand(0.25, 0.55) * (fromLeft ? 1 : -1);
    shooting.push({
      x: fromLeft ? rand(0, width * 0.6) : rand(width * 0.4, width),
      y: rand(0, height * 0.4),
      vx: Math.cos(angle) * (fromLeft ? 1 : -1) * rand(700, 1000),
      vy: Math.abs(Math.sin(angle)) * rand(350, 550),
      life: 0,
      max: rand(0.7, 1.1)
    });
    nextShot = now + rand(4000, 11000);
  }

  function draw(now, dt) {
    ctx.clearRect(0, 0, width, height);
    nebula();
    const t = now / 1000;
    for (const star of stars) {
      if (dt) {
        star.x -= star.speed * dt;
        if (star.x < -3) { star.x = width + 3; star.y = Math.random() * height; }
      }
      const flicker = 0.5 + 0.5 * Math.sin(t * star.twinkle + star.phase);
      const alpha = star.base * (0.55 + 0.45 * flicker);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = star.color;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
      if (star.depth === 2) {
        // Soft halo and a faint cross glint on the brightest stars.
        ctx.globalAlpha = alpha * 0.18;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha * 0.35 * flicker;
        ctx.fillRect(star.x - star.r * 5, star.y - 0.3, star.r * 10, 0.6);
        ctx.fillRect(star.x - 0.3, star.y - star.r * 5, 0.6, star.r * 10);
      }
    }
    ctx.globalAlpha = 1;

    shooting = shooting.filter(s => s.life < s.max);
    for (const s of shooting) {
      s.life += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const fade = Math.sin(Math.PI * Math.min(s.life / s.max, 1));
      const tail = 0.12;
      const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * tail, s.y - s.vy * tail);
      g.addColorStop(0, palette.shoot);
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = fade * 0.9;
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * tail, s.y - s.vy * tail);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    frame = 0;
    if (isStill() || document.hidden) { draw(now, 0); return; }
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    if (!nextShot) nextShot = now + rand(1500, 4000);
    if (now > nextShot) spawnShot(now);
    draw(now, dt);
    frame = requestAnimationFrame(loop);
  }

  function start() {
    if (frame) cancelAnimationFrame(frame);
    last = 0;
    frame = requestAnimationFrame(loop);
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { build(); start(); }, 150); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
  new MutationObserver(records => {
    if (records.some(r => r.attributeName === 'data-theme')) recolour();
    if (records.some(r => r.attributeName === 'class')) { shooting = []; start(); }
  }).observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'class'] });

  palette = palettes[document.body.dataset.theme] || palettes.aurora;
  build();
  start();
})();
