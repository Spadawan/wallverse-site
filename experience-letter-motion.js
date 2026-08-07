(() => {
  const SHOW_TEXT = 4;
  const FILTER_ACCEPT = 1;
  const FILTER_REJECT = 2;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(pointer: coarse)').matches) return;

  const section = document.querySelector('.wallverse-experience');
  if (!section) return;

  const groups = new Map();
  for (const target of section.querySelectorAll('h2, h3, p:not(.eyebrow), li')) {
    const label = target.textContent.trim().replace(/\s+/g, ' ');
    if (!label) continue;
    target.setAttribute('aria-label', label);
    const letters = [];
    const walker = document.createTreeWalker(target, SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.closest('.material-symbols-rounded') ? FILTER_REJECT : FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const fragment = document.createDocumentFragment();
      const run = document.createElement('span');
      run.className = 'experience-text-run';
      for (const token of node.textContent.split(/(\s+)/)) {
        if (!token) continue;
        if (/^\s+$/.test(token)) { run.append(document.createTextNode(token)); continue; }
        const word = document.createElement('span');
        word.className = 'experience-word';
        for (const character of token) {
          const letter = document.createElement('span');
          letter.className = 'experience-letter';
          letter.textContent = character;
          letter.setAttribute('aria-hidden', 'true');
          word.append(letter);
          letters.push(letter);
        }
        run.append(word);
      }
      fragment.append(run);
      node.replaceWith(fragment);
    }
    target.classList.add('is-letter-reactive');
    groups.set(target, letters);
  }

  let frame = 0;
  let point = null;
  let activeTarget = null;
  const reset = (target) => {
    for (const letter of groups.get(target) || []) {
      letter.style.removeProperty('--letter-lift');
      letter.style.removeProperty('--letter-turn');
      letter.style.removeProperty('--letter-scale');
      letter.classList.remove('is-near');
    }
  };
  const animate = () => {
    frame = 0;
    if (!activeTarget || !point) return;
    for (const letter of groups.get(activeTarget) || []) {
      const rect = letter.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const strength = Math.max(0, 1 - Math.hypot(point.x - x, point.y - y) / 68);
      if (!strength) {
        letter.style.removeProperty('--letter-lift');
        letter.style.removeProperty('--letter-turn');
        letter.style.removeProperty('--letter-scale');
        letter.classList.remove('is-near');
        continue;
      }
      letter.style.setProperty('--letter-lift', `${-strength * 3}px`);
      letter.style.setProperty('--letter-turn', `${(point.x - x) * strength * .018}deg`);
      letter.style.setProperty('--letter-scale', String(1 + strength * .035));
      letter.classList.add('is-near');
    }
  };
  section.addEventListener('pointermove', (event) => {
    const target = event.target.closest?.('.is-letter-reactive') || null;
    if (target !== activeTarget) {
      if (activeTarget) reset(activeTarget);
      activeTarget = target;
    }
    point = target ? { x: event.clientX, y: event.clientY } : null;
    if (point && !frame) frame = window.requestAnimationFrame(animate);
  });
  section.addEventListener('pointerleave', () => {
    if (activeTarget) reset(activeTarget);
    activeTarget = null;
    point = null;
  });
  window.WallverseExperienceMotion = true;
})();
