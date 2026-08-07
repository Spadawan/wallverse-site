(() => {
  const FULL_SELECT = 'id,user_id,actor_id,wallpaper_id,comment_id,card_trade_request_id,reward_id,owned_card_instance_id,action_label,type,title,body,is_read,created_at';
  const LEGACY_SELECT = 'id,user_id,actor_id,wallpaper_id,comment_id,card_trade_request_id,type,title,body,is_read,created_at';
  const list = document.getElementById('notifications-list');
  const status = document.getElementById('notifications-status');
  const signedOut = document.getElementById('notifications-signed-out');
  const readAll = document.getElementById('notifications-read-all');
  if (!list || !status || !signedOut || !readAll) return;

  const client = window.WallverseSupabase;
  let user = null;
  let notifications = [];
  const giftTypes = new Set(['card_received', 'card_reward']);
  const iconFor = (type) => ({ wallpaper_approved: 'check_circle', wallpaper_like: 'favorite', card_like: 'favorite', wallpaper_comment: 'chat_bubble', comment_reply: 'reply', follow: 'person_add', achievement_unlocked: 'emoji_events', polish_recharged: 'auto_awesome', system_announcement: 'campaign', wallpaper_rejected: 'block', moderation: 'shield', moderation_review: 'shield', wallpaper_pending_review: 'shield', card_received: 'redeem', card_reward: 'redeem', card_trade_request: 'swap_horiz', card_trade_accepted: 'check_circle', card_trade_declined: 'cancel' }[type] || 'notifications');
  const isGift = (item) => giftTypes.has(item.type) || Boolean(item.reward_id);
  const relativeTime = (value) => {
    const time = new Date(value).getTime(); const seconds = Math.max(0, Date.now() - time) / 1000;
    if (seconds < 60) return 'now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`; if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
  };
  const setStatus = (text = '') => { status.textContent = text; status.hidden = !text; };
  async function markRead(item) {
    if (item.is_read || !user) return;
    const { error } = await client.from('notifications').update({ is_read: true }).eq('id', item.id).eq('user_id', user.id);
    if (error) throw error;
    item.is_read = true;
    window.dispatchEvent(new Event('wallverse:notifications-updated'));
  }
  async function dismiss(item) {
    if (isGift(item)) return;
    try {
      const { error } = await client.from('notifications').delete().eq('id', item.id).eq('user_id', user.id);
      if (error) throw error;
    } catch (_) {
      await markRead(item);
    }
    notifications = notifications.filter((entry) => entry.id !== item.id);
    render();
    window.dispatchEvent(new Event('wallverse:notifications-updated'));
  }
  async function open(item) {
    if (isGift(item)) return;
    try { await markRead(item); } catch (error) { console.warn('Unable to mark notification as read.', error); }
    render();
    if (item.wallpaper_id) window.location.assign(`/wallpaper/wallpaper-${String(item.wallpaper_id).replace(/-/g, '').slice(0, 8)}`);
  }
  function render() {
    list.replaceChildren();
    readAll.disabled = !notifications.some((item) => !item.is_read);
    if (!notifications.length) { setStatus('No notifications yet.'); return; }
    setStatus();
    for (const item of notifications) {
      const gift = isGift(item);
      const article = document.createElement('article');
      article.className = `notification-item${item.is_read ? '' : ' is-unread'}${gift ? ' notification-item--gift' : ''}`;
      const icon = document.createElement('span'); icon.className = 'notification-item__icon material-symbols-rounded'; icon.textContent = gift ? 'redeem' : iconFor(item.type); icon.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('div'); copy.className = 'notification-item__copy';
      const title = document.createElement('h2'); title.textContent = item.title || 'Wallverse update';
      const body = document.createElement('p'); body.textContent = item.body || '';
      const meta = document.createElement('time'); meta.dateTime = item.created_at; meta.textContent = relativeTime(item.created_at);
      copy.append(title, body, meta);
      article.append(icon, copy);
      if (gift) {
        const action = document.createElement('a'); action.className = 'button button--small notification-item__gift-action'; action.href = 'https://play.google.com/store/apps/details?id=app.wallverse.mobile'; action.target = '_blank'; action.rel = 'noopener'; action.textContent = 'Open in Android';
        action.addEventListener('click', () => { markRead(item).catch(() => {}); });
        article.append(action);
      } else {
        const actions = document.createElement('div'); actions.className = 'notification-item__actions';
        const openButton = document.createElement('button'); openButton.type = 'button'; openButton.className = 'notification-item__open'; openButton.textContent = item.wallpaper_id ? 'View' : 'Mark read'; openButton.addEventListener('click', () => open(item));
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'notification-item__dismiss'; remove.setAttribute('aria-label', 'Dismiss notification'); remove.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">close</span>'; remove.addEventListener('click', () => dismiss(item));
        actions.append(openButton, remove); article.append(actions);
      }
      list.append(article);
    }
  }
  async function load() {
    if (!client) { setStatus('Notifications are unavailable right now.'); return; }
    const { data: sessionData } = await client.auth.getSession(); user = sessionData.session?.user || null;
    signedOut.hidden = Boolean(user); document.querySelector('.notifications-panel').hidden = !user;
    if (!user) return;
    setStatus('Loading notifications…');
    let result = await client.from('notifications').select(FULL_SELECT).eq('user_id', user.id).order('created_at', { ascending: false }).limit(80);
    if (result.error?.code === '42703') result = await client.from('notifications').select(LEGACY_SELECT).eq('user_id', user.id).order('created_at', { ascending: false }).limit(80);
    if (result.error) { setStatus('Notifications are unavailable right now.'); console.warn(result.error); return; }
    notifications = result.data || []; render();
  }
  readAll.addEventListener('click', async () => {
    readAll.disabled = true;
    try {
      const { error } = await client.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
      if (error) throw error;
      notifications.forEach((item) => { item.is_read = true; }); render(); window.dispatchEvent(new Event('wallverse:notifications-updated'));
    } catch (error) { setStatus(error.message || 'Unable to mark notifications as read.'); readAll.disabled = false; }
  });
  if (client) client.auth.onAuthStateChange(() => window.setTimeout(load, 0));
  load().catch((error) => { console.warn(error); setStatus('Notifications are unavailable right now.'); });
})();
