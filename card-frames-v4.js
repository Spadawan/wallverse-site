(() => {
  const base = window.WallverseCardFrames;
  if (!base) return;

  const supported = new Set(['neonrounded', 'neongradient', 'cyberpunk', 'electric']);
  const aliases = new Map([
    ['defaultframe', 'default'], ['frameneonrounded', 'neonrounded'], ['frameneongradient', 'neongradient'],
    ['framecyberpunk', 'cyberpunk'], ['frameelectric', 'electric'],
  ]);

  function valuesFrom(value) {
    if (!value || typeof value !== 'object') return [value];
    const nested = value.frame && typeof value.frame === 'object' ? value.frame : {};
    return [
      value.card_frame_type, value.card_frame_id, value.cardFrameType, value.cardFrameId,
      value.frame_type, value.frame_id, value.frameType, value.frameId,
      nested.type, nested.id, nested.name,
    ];
  }

  function normalize(...values) {
    for (const value of values) {
      for (const raw of valuesFrom(value)) {
        const candidate = String(raw || '').replace(/[^A-Za-z]/g, '').toLowerCase();
        if (supported.has(candidate)) return candidate;
        if (aliases.has(candidate)) return aliases.get(candidate);
        if (candidate.includes('neonrounded')) return 'neonrounded';
        if (candidate.includes('neongradient')) return 'neongradient';
        if (candidate.includes('cyberpunk')) return 'cyberpunk';
        if (candidate.includes('electric')) return 'electric';
      }
    }
    return 'default';
  }

  function apply(card, ...values) { return base.apply(card, normalize(...values)); }
  function applyAvatar(avatar, frameValue, rarity) { return base.applyAvatar(avatar, normalize(frameValue), rarity); }
  function label(value) { return ({ neonrounded: 'Neon Rounded', neongradient: 'Neon Gradient', cyberpunk: 'Cyberpunk', electric: 'Electric' })[normalize(value)] || 'Default'; }

  window.WallverseCardFrames = Object.freeze({ ...base, apply, applyAvatar, label, normalize });
})();
