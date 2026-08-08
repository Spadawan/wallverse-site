(() => {
  const supported = new Set(['neonrounded', 'neongradient', 'cyberpunk', 'electric']);
  const aliases = new Map([
    ['frameneonrounded', 'neonrounded'],
    ['frameneongradient', 'neongradient'],
    ['framecyberpunk', 'cyberpunk'],
    ['frameelectric', 'electric'],
  ]);

  function normalize(...values) {
    for (const value of values) {
      const candidate = String(value || '').replace(/[^A-Za-z]/g, '').toLowerCase();
      if (supported.has(candidate)) return candidate;
      if (aliases.has(candidate)) return aliases.get(candidate);
    }
    return 'default';
  }

  function label(value) {
    return ({ neonrounded: 'Neon Rounded', neongradient: 'Neon Gradient', cyberpunk: 'Cyberpunk', electric: 'Electric' })[normalize(value)] || 'Default';
  }

  function makeSkin(frame) {
    const skin = document.createElement('span');
    skin.className = 'card-frame-skin';
    skin.setAttribute('aria-hidden', 'true');
    skin.dataset.frame = frame;
    for (const position of ['top', 'right', 'bottom', 'left']) {
      const rail = document.createElement('i');
      rail.className = `card-frame-skin__rail card-frame-skin__rail--${position}`;
      skin.append(rail);
    }
    for (let index = 1; index <= 4; index += 1) {
      const spark = document.createElement('i');
      spark.className = `card-frame-skin__spark card-frame-skin__spark--${index}`;
      skin.append(spark);
    }
    return skin;
  }

  function apply(card, ...values) {
    if (!card) return 'default';
    const frame = normalize(...values);
    [...card.classList].filter((name) => name.startsWith('frame--')).forEach((name) => card.classList.remove(name));
    card.querySelector(':scope > .card-frame-skin')?.remove();
    card.dataset.cardFrame = frame;
    if (frame !== 'default') {
      card.classList.add(`frame--${frame}`);
      card.append(makeSkin(frame));
    }
    return frame;
  }

  window.WallverseCardFrames = Object.freeze({ apply, label, normalize, supported: [...supported] });
})();
