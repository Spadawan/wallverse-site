(() => {
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!finePointer.matches || reducedMotion.matches) return;

  const cursor = document.createElement('div');
  cursor.className = 'wallverse-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  const image = document.createElement('img');
  image.src = '/Curseur_256.png';
  image.alt = '';
  cursor.append(image);
  document.body.append(cursor);
  document.documentElement.classList.add('has-wallverse-cursor');

  let frame = 0;
  let pointerX = -100;
  let pointerY = -100;
  const interactiveSelector = 'a, button, input, select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])';

  const render = () => {
    frame = 0;
    cursor.style.setProperty('--cursor-x', `${pointerX}px`);
    cursor.style.setProperty('--cursor-y', `${pointerY}px`);
  };
  const scheduleRender = () => {
    if (!frame) frame = window.requestAnimationFrame(render);
  };

  document.addEventListener('pointermove', (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    cursor.classList.add('is-visible');
    cursor.classList.toggle('is-hovering', Boolean(event.target.closest(interactiveSelector)));
    scheduleRender();
  }, { passive: true });
  document.addEventListener('pointerdown', () => cursor.classList.add('is-pressed'), { passive: true });
  document.addEventListener('pointerup', () => cursor.classList.remove('is-pressed'), { passive: true });
  document.addEventListener('pointercancel', () => cursor.classList.remove('is-pressed'), { passive: true });
  document.addEventListener('pointerleave', (event) => {
    if (event.target === document.documentElement) cursor.classList.remove('is-visible');
  });
  window.addEventListener('blur', () => cursor.classList.remove('is-visible'));
})();
