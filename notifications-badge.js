(() => {
  const client = window.WallverseSupabase;
  const badges = [...document.querySelectorAll('[data-notifications-badge]')];
  if (!client || !badges.length) return;
  const paint = (count) => badges.forEach((badge) => { badge.hidden = !count; badge.textContent = count > 99 ? '99+' : String(count); });
  async function refresh() {
    const { data: sessionData } = await client.auth.getSession(); const user = sessionData.session?.user;
    if (!user) return paint(0);
    const { count, error } = await client.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false);
    paint(error ? 0 : (count || 0));
  }
  window.addEventListener('wallverse:notifications-updated', refresh);
  client.auth.onAuthStateChange(() => window.setTimeout(refresh, 0));
  refresh();
})();
