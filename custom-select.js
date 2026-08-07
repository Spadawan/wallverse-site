(() => {
  document.querySelectorAll('.collection-filter select').forEach((select, index) => {
    const label = select.closest('.collection-filter');
    if (!label || label.querySelector('.custom-select')) return;
    const menuId = `wallverse-select-${select.id || index}`;
    const wrapper = document.createElement('span'); wrapper.className = 'custom-select';
    const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'custom-select__trigger'; trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', menuId);
    const menu = document.createElement('span'); menu.className = 'custom-select__menu'; menu.id = menuId; menu.setAttribute('role', 'listbox'); menu.hidden = true;
    const update = () => { const option = select.options[select.selectedIndex]; trigger.textContent = option?.textContent || ''; menu.querySelectorAll('button').forEach((button) => { const selected = button.dataset.value === select.value; button.classList.toggle('is-selected', selected); button.setAttribute('aria-selected', String(selected)); }); };
    const close = () => { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
    const open = () => { menu.hidden = false; trigger.setAttribute('aria-expanded', 'true'); };
    [...select.options].forEach((option) => { const item = document.createElement('button'); item.type = 'button'; item.textContent = option.textContent; item.dataset.value = option.value; item.setAttribute('role', 'option'); item.addEventListener('click', () => { select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); update(); close(); trigger.focus(); }); menu.append(item); });
    trigger.addEventListener('click', () => menu.hidden ? open() : close());
    trigger.addEventListener('keydown', (event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(); const active = menu.querySelector('.is-selected') || menu.querySelector('button'); active?.focus(); } if (event.key === 'Escape') close(); });
    menu.addEventListener('keydown', (event) => { if (event.key === 'Escape') { close(); trigger.focus(); } });
    document.addEventListener('click', (event) => { if (!wrapper.contains(event.target)) close(); });
    select.classList.add('native-select--hidden'); select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
    wrapper.append(trigger, menu); label.append(wrapper); update();
  });
})();
