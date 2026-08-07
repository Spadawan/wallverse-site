(() => {
  // Numeric constants keep this working in browsers/environments that do not
  // expose NodeFilter as a global, while retaining the native TreeWalker API.
  const SHOW_TEXT = 4;
  const FILTER_ACCEPT = 1;
  const FILTER_REJECT = 2;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(pointer: coarse)').matches) return;

  const section = document.querySelector('.wallverse-experience');
  if (!section) return;
  const targets = section.querySelectorAll('h2, h3, p:not(.eyebrow), li');
  const letters = [];

  for (const target of targets) {
    const label = target.textContent.trim().replace(/\s+/g, ' ');
    if (!label) continue;
    target.setAttribute('aria-label', label);
    const walker = document.createTreeWalker(target, SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.closest('.material-symbols-rounded') ? FILTER_REJECT : FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const fragment = document.createDocumentFragment();
      for (const character of node.textContent) {
        if (/\s/.test(character)) { fragment.append(document.createTextNode(character)); continue; }
        const letter = document.createElement('span');
        letter.className = 'experience-letter';
        letter.textContent = character;
        letter.setAttribute('aria-hidden', 'true');
        fragment.append(letter);
        letters.push(letter);
      }
      node.replaceWith(fragment);
    }
    target.classList.add('is-letter-reactive');
  }

  let frame = 0;
  let point = null;
  const reset = () => {
    for (const letter of letters) {
      letter.style.removeProperty('--letter-lift');
      letter.style.removeProperty('--letter-turn');
      letter.style.removeProperty('--letter-scale');
      letter.classList.remove('is-near');
    }
  };
  const animate = () => {
    frame = 0;
    if (!point) return reset();
    for (const letter of letters) {
      const rect = letter.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const distance = Math.hypot(point.x - x, point.y - y);
      const strength = Math.max(0, 1 - distance / 104);
      if (!strength) {
        letter.style.removeProperty('--letter-lift');
        letter.style.removeProperty('--letter-turn');
        letter.style.removeProperty('--letter-scale');
        letter.classList.remove('is-near');
        continue;
      }
      letter.style.setProperty('--letter-lift', `${-strength * 8}px`);
      letter.style.setProperty('--letter-turn', `${(point.x - x) * strength * .055}deg`);
      letter.style.setProperty('--letter-scale', String(1 + strength * .16));
      letter.classList.add('is-near');
    }
  };
  section.addEventListener('pointermove', (event) => {
    point = { x: event.clientX, y: event.clientY };
    if (!frame) frame = window.requestAnimationFrame(animate);
  });
  section.addEventListener('pointerleave', () => { point = null; if (!frame) frame = window.requestAnimationFrame(animate); });
  window.WallverseExperienceMotion = true;
})();
