(() => {
  const start = () => {
  const config = window.WALLVERSE_PUBLIC_CONFIG;
  const helpers = window.WallverseCards;
  if (!config || !helpers || !window.supabase?.createClient) return false;
  const client = window.WallverseSupabase || window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  let currentProfile = null;
  let cards = [];
  let sort = 'rare';

  const dialog = document.createElement('dialog');
  dialog.className = 'creator-dialog';
  dialog.innerHTML = `<button class="dialog-close" type="button" aria-label="Close creator">×</button><section class="creator-dialog__head"><span class="avatar avatar--violet" id="creator-dialog-avatar">W</span><div><p class="highlight-label">WALLVERSE CREATOR</p><h2 id="creator-dialog-name">Creator</h2><p id="creator-dialog-role">Loading profile…</p></div></section><dl class="creator-dialog__stats" id="creator-dialog-stats"></dl><div class="creator-dialog__toolbar" role="group" aria-label="Sort creator cards"><button class="is-active" type="button" data-creator-sort="rare">Rare</button><button type="button" data-creator-sort="recent">Recent</button><button type="button" data-creator-sort="downloads">Downloads</button><button type="button" data-creator-sort="views">Views</button></div><p class="creator-dialog__status" id="creator-dialog-status" role="status">Loading creator cards…</p><div class="creator-dialog__cards" id="creator-dialog-cards"></div>`;
  document.body.append(dialog);

  const allPages = async (factory) => {
    const rows = []; let offset = 0;
    while (true) {
      const { data, error } = await factory(offset);
      if (error) throw error;
      const page = data || []; rows.push(...page);
      if (page.length < 1000) return rows;
      offset += 1000;
    }
  };
  const profileFor = (value) => Array.isArray(value) ? value[0] : value;
  const wallpaperFor = (value) => value?.wallpapers ? profileFor(value.wallpapers) : value;
  const compact = (value) => helpers.compactNumber(value);
  const setAvatar = (profile) => {
    const target = document.getElementById('creator-dialog-avatar');
    target.textContent = (profile.username || 'W').charAt(0).toUpperCase();
    if (!profile.avatar_url) return;
    const image = new Image(); image.className = 'avatar__image'; image.alt = ''; image.src = profile.avatar_url;
    image.onload = () => target.replaceChildren(image);
  };
  const cardNode = (wallpaper) => {
    const article = document.createElement('article'); article.className = `creator-dialog-card tier--${helpers.publicCardTier(wallpaper)}`;
    const image = new Image(); image.src = helpers.thumbnailUrl(wallpaper); image.alt = wallpaper.title ? `${wallpaper.title} wallpaper` : 'Wallverse wallpaper'; image.loading = 'lazy'; image.decoding = 'async'; image.draggable = false;
    image.onerror = () => article.classList.add('is-unavailable');
    const title = document.createElement('strong'); title.textContent = wallpaper.title || 'Untitled';
    const stats = document.createElement('span'); stats.textContent = `♥ ${compact(wallpaper.likes_count)}  ·  ⇩ ${compact(wallpaper.downloads_count)}  ·  ◉ ${compact(wallpaper.views_count)}`;
    article.append(image, title, stats); return article;
  };
  const renderCards = () => {
    const target = document.getElementById('creator-dialog-cards');
    const sorted = [...cards].sort((left, right) => {
      if (sort === 'recent') return new Date(right.created_at || 0) - new Date(left.created_at || 0);
      if (sort === 'downloads') return (Number(right.downloads_count) || 0) - (Number(left.downloads_count) || 0);
      if (sort === 'views') return (Number(right.views_count) || 0) - (Number(left.views_count) || 0);
      return helpers.publicCardScore(right) - helpers.publicCardScore(left);
    }).slice(0, 20);
    target.replaceChildren(...sorted.map(cardNode));
    document.querySelectorAll('[data-creator-sort]').forEach((button) => { const active = button.dataset.creatorSort === sort; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
    document.getElementById('creator-dialog-status').textContent = sorted.length ? `Showing ${sorted.length} public cards` : 'No public cards available for this creator.';
  };
  const open = async (profile) => {
    if (!profile?.id) return;
    currentProfile = profile; cards = [];
    document.getElementById('creator-dialog-name').textContent = `@${profile.username || 'creator'}`;
    document.getElementById('creator-dialog-role').textContent = profile.role || 'Wallverse creator';
    document.getElementById('creator-dialog-status').textContent = 'Loading creator cards…';
    document.getElementById('creator-dialog-cards').replaceChildren();
    setAvatar(profile);
    if (!dialog.open) dialog.showModal();
    try {
      const [uploaded, owned] = await Promise.all([
        allPages((offset) => client.from('wallpapers').select('id,user_id,title,thumbnail_url,category,quality,width,height,file_size,likes_count,downloads_count,views_count,is_featured,is_weekly,polished_until,created_at,storage_provider,thumbnail_storage_key,status,is_suggestive').eq('user_id', profile.id).eq('status', 'approved').eq('is_suggestive', false).range(offset, offset + 999)),
        allPages((offset) => client.from('user_cards').select('wallpapers!inner(id,user_id,title,thumbnail_url,category,quality,width,height,file_size,likes_count,downloads_count,views_count,is_featured,is_weekly,polished_until,created_at,storage_provider,thumbnail_storage_key,status,is_suggestive)').eq('owner_id', profile.id).eq('wallpapers.status', 'approved').eq('wallpapers.is_suggestive', false).range(offset, offset + 999)).catch(() => []),
      ]);
      const uploadedCards = uploaded || [];
      const ownedCards = (owned || []).map(wallpaperFor).filter(Boolean);
      cards = ownedCards.length ? ownedCards : uploadedCards;
      const totals = uploadedCards.reduce((sum, wallpaper) => ({ likes: sum.likes + (Number(wallpaper.likes_count) || 0), downloads: sum.downloads + (Number(wallpaper.downloads_count) || 0), views: sum.views + (Number(wallpaper.views_count) || 0) }), { likes: 0, downloads: 0, views: 0 });
      const values = [['Uploads', uploadedCards.length], ['Cards', ownedCards.length], ['Likes', totals.likes], ['Downloads', totals.downloads], ['Views', totals.views], ['Followers', profile.followers_count || 0]];
      document.getElementById('creator-dialog-stats').replaceChildren(...values.map(([label, value]) => { const item = document.createElement('div'); item.innerHTML = `<dt>${label}</dt><dd>${compact(value)}</dd>`; return item; }));
      renderCards();
    } catch (error) {
      console.warn('Creator details unavailable.', error);
      document.getElementById('creator-dialog-status').textContent = 'Creator details are unavailable right now.';
    }
  };
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.querySelectorAll('[data-creator-sort]').forEach((button) => button.addEventListener('click', () => { sort = button.dataset.creatorSort; renderCards(); }));
  window.WallverseOpenCreator = open;
  window.addEventListener('wallverse:creator-inspect', (event) => open(event.detail?.profile));
  return true;
  };
  if (!start()) window.addEventListener('wallverse:data-ready', start, { once: true });
})();
