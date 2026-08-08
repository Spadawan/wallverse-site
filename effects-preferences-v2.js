(() => {
  const STORAGE_KEY = 'wallverse:effects-level';
  const LEVELS = ['full', 'medium', 'low'];
  const desktop = window.matchMedia('(hover: hover) and (pointer: fine)');

  const savedLevel = () => {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      return LEVELS.includes(value) ? value : 'full';
    } catch { return 'full'; }
  };

  const apply = (level, persist = false) => {
    const next = LEVELS.includes(level) ? level : 'full';
    document.documentElement.dataset.effects = next;
    if (persist) {
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Storage may be unavailable. */ }
    }
    window.dispatchEvent(new CustomEvent('wallverse:effects-change', { detail: { level: next } }));
    document.querySelectorAll('[data-effects-level]').forEach((button) => {
      const active = button.dataset.effectsLevel === next;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };

  apply(savedLevel());
  if (!desktop.matches) return;

  const control = document.createElement('div');
  control.className = 'effects-control';
  control.setAttribute('aria-label', 'Visual effects intensity');
  control.innerHTML = '<span class="effects-control__label">FX</span><div class="effects-control__options" role="group" aria-label="Visual effects"><button type="button" data-effects-level="full">Full</button><button type="button" data-effects-level="medium">Medium</button><button type="button" data-effects-level="low">Low</button></div>';
  control.addEventListener('click', (event) => {
    const button = event.target.closest('[data-effects-level]');
    if (button) apply(button.dataset.effectsLevel, true);
  });
  document.body.append(control);
  apply(document.documentElement.dataset.effects);
})();
