(() => {
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const lowPerformance = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) || (navigator.deviceMemory && navigator.deviceMemory <= 2);
  if (!finePointer.matches || reducedMotion.matches || lowPerformance) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'wallverse-cursor-trail';
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return;

  const cursor = document.createElement('div');
  cursor.className = 'wallverse-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  const image = document.createElement('img');
  image.src = '/Curseur_256.png';
  image.alt = '';
  cursor.append(image);
  document.body.append(canvas, cursor);
  document.documentElement.classList.add('has-wallverse-cursor');

  const maxRipples = 14;
  const ripples = Array.from({ length: maxRipples }, () => ({ active: false, x: 0, y: 0, age: 0, life: 0, radius: 0, spread: 0, strength: 0, hue: 0 }));
  const palette = [316, 276, 222, 184];
  const interactiveSelector = 'a, button, input, select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])';
  let rippleIndex = 0;
  let animationFrame = 0;
  let lastFrame = 0;
  let pointerX = -100;
  let pointerY = -100;
  let previousX = -100;
  let previousY = -100;
  let lastRippleAt = 0;
  let cursorDirty = false;
  let cursorVisible = false;
  let viewportWidth = 0;
  let viewportHeight = 0;
  let pixelRatio = 1;

  const resizeCanvas = () => {
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    canvas.width = Math.round(viewportWidth * pixelRatio);
    canvas.height = Math.round(viewportHeight * pixelRatio);
    canvas.style.width = `${viewportWidth}px`;
    canvas.style.height = `${viewportHeight}px`;
  };
  const hasActiveRipples = () => ripples.some((ripple) => ripple.active);
  const schedule = () => {
    if (!animationFrame && !document.hidden) animationFrame = window.requestAnimationFrame(tick);
  };
  const emitRipple = (x, y, speed = 0, click = false) => {
    const ripple = ripples[rippleIndex];
    rippleIndex = (rippleIndex + 1) % maxRipples;
    ripple.active = true;
    ripple.x = x;
    ripple.y = y;
    ripple.age = 0;
    ripple.life = click ? 820 : 480 + Math.min(speed * 3, 180);
    ripple.radius = click ? 8 : 3 + Math.min(speed * 0.05, 5);
    ripple.spread = click ? 0.15 : 0.12 + Math.min(speed * 0.00035, 0.05);
    ripple.strength = click ? 0.38 : 0.12 + Math.min(speed * 0.0012, 0.14);
    ripple.hue = palette[rippleIndex % palette.length];
    schedule();
  };
  const drawRipples = (delta) => {
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, viewportWidth, viewportHeight);
    context.save();
    context.globalCompositeOperation = 'lighter';
    ripples.forEach((ripple) => {
      if (!ripple.active) return;
      ripple.age += delta;
      const progress = ripple.age / ripple.life;
      if (progress >= 1) { ripple.active = false; return; }
      const fade = (1 - progress) ** 2;
      const radius = ripple.radius + ripple.age * ripple.spread;
      const alpha = ripple.strength * fade;
      const gradient = context.createRadialGradient(ripple.x, ripple.y, Math.max(1, radius * 0.42), ripple.x, ripple.y, radius * 1.35);
      gradient.addColorStop(0, `hsla(${ripple.hue}, 100%, 72%, 0)`);
      gradient.addColorStop(0.58, `hsla(${ripple.hue}, 100%, 70%, ${alpha * 0.22})`);
      gradient.addColorStop(1, `hsla(${(ripple.hue + 38) % 360}, 100%, 70%, 0)`);
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(ripple.x, ripple.y, radius * 1.35, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = `hsla(${ripple.hue}, 100%, 74%, ${alpha})`;
      context.lineWidth = 0.8 + (1 - progress) * 0.65;
      context.beginPath();
      context.ellipse(ripple.x, ripple.y, radius, radius * (0.78 + progress * 0.12), Math.sin(ripple.age * 0.009) * 0.18, 0, Math.PI * 2);
      context.stroke();
    });
    context.restore();
  };
  const tick = (time) => {
    animationFrame = 0;
    const delta = Math.min(32, time - (lastFrame || time));
    lastFrame = time;
    if (cursorDirty) {
      cursor.style.setProperty('--cursor-x', `${pointerX}px`);
      cursor.style.setProperty('--cursor-y', `${pointerY}px`);
      cursorDirty = false;
    }
    drawRipples(delta);
    if (cursorDirty || hasActiveRipples()) schedule();
  };

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas, { passive: true });
  document.addEventListener('pointermove', (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    const distance = Math.hypot(pointerX - previousX, pointerY - previousY);
    const now = performance.now();
    if (distance > 8 && now - lastRippleAt > 22) {
      emitRipple(pointerX, pointerY, distance);
      lastRippleAt = now;
      previousX = pointerX;
      previousY = pointerY;
    }
    cursorDirty = true;
    cursorVisible = true;
    cursor.classList.add('is-visible');
    cursor.classList.toggle('is-hovering', Boolean(event.target.closest(interactiveSelector)));
    schedule();
  }, { passive: true });
  document.addEventListener('pointerdown', (event) => {
    cursor.classList.add('is-pressed');
    emitRipple(event.clientX, event.clientY, 80, true);
  }, { passive: true });
  document.addEventListener('pointerup', () => cursor.classList.remove('is-pressed'), { passive: true });
  document.addEventListener('pointercancel', () => cursor.classList.remove('is-pressed'), { passive: true });
  window.addEventListener('blur', () => { cursorVisible = false; cursor.classList.remove('is-visible'); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      context.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    lastFrame = 0;
    if (cursorVisible || hasActiveRipples()) schedule();
  });
})();
