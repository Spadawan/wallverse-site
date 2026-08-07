(() => {
  const config = window.WALLVERSE_PUBLIC_CONFIG;
  if (!config || !window.supabase?.createClient) return;
  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const userPattern = /^[A-Za-z0-9_]{3,20}$/;
  const hero = document.getElementById('profile-hero');
  const wallpapersSection = document.getElementById('profile-wallpapers');
  const signedOut = document.getElementById('profile-signed-out');
  let profile = null;
  let user = null;
  let collectionCards = [];
  let collectionSort = 'popular';
  let showSuggestive = false;

  function setupHero() {
    const identity = hero.querySelector('.profile-hero__identity');
    const power = hero.querySelector('.profile-hero__power');
    const stats = document.getElementById('profile-stats');
    if (!identity || !power || !stats) return;
    const visual = document.createElement('div');
    visual.className = 'profile-hero__visual';
    const banner = document.createElement('img');
    banner.id = 'profile-banner'; banner.alt = ''; banner.hidden = true;
    const shade = document.createElement('div');
    shade.className = 'profile-hero__visual-shade';
    const metrics = document.createElement('aside');
    metrics.className = 'profile-hero__metrics'; metrics.setAttribute('aria-label', 'Profile statistics');
    visual.append(banner, shade, identity);
    metrics.append(power, stats);
    hero.replaceChildren(visual, metrics);
    document.getElementById('profile-overview')?.remove();
  }
  setupHero();

  const compact = (value) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
  const r2Url = (key) => `${config.r2PublicBaseUrl.replace(/\/+$/, '')}/${String(key || '').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')}`;
  const thumbnail = (wallpaper) => wallpaper.storage_provider === 'cloudflare_r2' && wallpaper.thumbnail_storage_key ? r2Url(wallpaper.thumbnail_storage_key) : (wallpaper.thumbnail_url || '');
  function cardScore(wallpaper) {
    const quality = String(wallpaper.quality || '').toLowerCase();
    const qualityScore = quality === 'premium' ? 180 : quality === 'high' ? 90 : quality === 'standard' ? 30 : 0;
    return (wallpaper.likes_count || 0) * 4 + (wallpaper.downloads_count || 0) * 3 + (wallpaper.views_count || 0) + qualityScore + (wallpaper.is_featured ? 220 : 0) + (wallpaper.is_weekly ? 380 : 0);
  }
  function cardTier(wallpaper) {
    const score = cardScore(wallpaper);
    if (score >= 5000) return 'mythic';
    if (score >= 2600) return 'legendary';
    if (score >= 1300) return 'epic';
    if (score >= 450) return 'rare';
    if (score >= 120) return 'uncommon';
    return 'common';
  }
  function collectionPower(cards) {
    return cards.reduce((total, wallpaper) => { const value = cardScore(wallpaper); return total + value + (value >= 5000 ? 620 : value >= 2600 ? 360 : value >= 1300 ? 190 : value >= 450 ? 90 : value >= 120 ? 55 : 25); }, 0);
  }
  async function fetchCollectionPower(ownerId) {
    let rewardRows = [];
    try {
      const { data, error } = await client.from('card_rewards').select('owned_card_instance_id').eq('user_id', ownerId).in('status', ['unrevealed', 'opening']);
      if (error) throw error;
      rewardRows = data || [];
    } catch (error) {
      // Rewards are only used to exclude cards that the app has not revealed yet.
      console.warn('Unable to exclude unrevealed rewards from Collection Power.', error);
    }
    const hidden = new Set(rewardRows.map((row) => row.owned_card_instance_id));
    const cards = [];
    let offset = 0;
    while (true) {
      const { data, error } = await client.from('user_cards').select('id,archived,wallpapers!inner(id,status,quality,likes_count,downloads_count,views_count,is_featured,is_weekly)').eq('owner_id', ownerId).order('acquired_at', { ascending: false }).range(offset, offset + 999);
      if (error) throw error;
      const page = data || [];
      page.forEach((card) => {
        const wallpaper = Array.isArray(card.wallpapers) ? card.wallpapers[0] : card.wallpapers;
        if (wallpaper && (wallpaper.status === 'approved' || card.archived === true) && !hidden.has(card.id)) cards.push(wallpaper);
      });
      if (page.length < 1000) break;
      offset += 1000;
    }
    return collectionPower(cards);
  }
  async function fetchVisibleCollection(ownerId, includeSuggestive = false) {
    const { data: rewards, error: rewardsError } = await client.from('card_rewards').select('owned_card_instance_id').eq('user_id', ownerId).in('status', ['unrevealed', 'opening']);
    if (rewardsError) throw rewardsError;
    const hidden = new Set((rewards || []).map((row) => row.owned_card_instance_id));
    const cards = [];
    let offset = 0;
    while (true) {
      let request = client.from('user_cards')
        .select('id,acquired_at,card_frame_id,card_frame_type,archived,wallpapers!inner(id,user_id,title,description,image_url,thumbnail_url,category,quality,width,height,file_size,likes_count,downloads_count,views_count,is_featured,is_weekly,polished_until,status,is_suggestive,storage_provider,thumbnail_storage_key,hd_storage_key,profiles!wallpapers_user_id_fkey(username,avatar_url),wallpaper_tags(tags(name)))')
        .eq('owner_id', ownerId)
        .eq('wallpapers.status', 'approved')
        .order('acquired_at', { ascending: false })
        .range(offset, offset + 999);
      if (!includeSuggestive) request = request.eq('wallpapers.is_suggestive', false);
      const { data, error } = await request;
      if (error) throw error;
      const page = data || [];
      cards.push(...page);
      if (page.length < 1000) break;
      offset += 1000;
    }
    return cards.filter((card) => {
      const wallpaper = Array.isArray(card.wallpapers) ? card.wallpapers[0] : card.wallpapers;
      return !hidden.has(card.id) && Boolean(wallpaper);
    });
  }
  function setAvatar(node) {
    const username = profile?.username || 'W'; node.textContent = username.charAt(0).toUpperCase();
    if (!profile?.avatar_url) return;
    const image = new Image(); image.className = 'avatar__image'; image.alt = ''; image.src = profile.avatar_url; image.onload = () => node.replaceChildren(image);
  }
  async function ensureProfile(sessionUser) {
    const { data, error } = await client.from('profiles').select('id,username,role,avatar_url,banner_url,followers_count').eq('id', sessionUser.id).maybeSingle();
    if (error) throw error;
    if (data) return data;
    const source = String(sessionUser.user_metadata?.username || sessionUser.email?.split('@')[0] || 'user').replace(/[^A-Za-z0-9_]/g, '').slice(0, 14);
    const username = userPattern.test(source) ? source : `user_${sessionUser.id.slice(0, 6)}`;
    const { error: insertError } = await client.from('profiles').insert({ id: sessionUser.id, username });
    if (insertError) throw insertError;
    const { data: created, error: createdError } = await client.from('profiles').select('id,username,role,avatar_url,banner_url,followers_count').eq('id', sessionUser.id).single();
    if (createdError) throw createdError;
    return created;
  }
  async function fetchGlobalStats(ownerId) {
    const all = [];
    let offset = 0;
    while (true) {
      const { data, error } = await client.from('wallpapers').select('id,status,likes_count,downloads_count,views_count').eq('user_id', ownerId).order('created_at', { ascending: false }).range(offset, offset + 999);
      if (error) throw error;
      const page = data || [];
      all.push(...page);
      if (page.length < 1000) break;
      offset += 1000;
    }
    const approved = all.filter((wallpaper) => wallpaper.status === 'approved');
    return approved.reduce((summary, wallpaper) => ({
      uploads: summary.uploads + 1,
      likes: summary.likes + (Number(wallpaper.likes_count) || 0),
      downloads: summary.downloads + (Number(wallpaper.downloads_count) || 0),
      views: summary.views + (Number(wallpaper.views_count) || 0),
    }), { uploads: 0, likes: 0, downloads: 0, views: 0 });
  }
  function renderStats(totals) {
    const values = [['Uploads', totals.uploads], ['Likes', totals.likes], ['Downloads', totals.downloads], ['Views', totals.views]];
    document.getElementById('profile-stats').replaceChildren(...values.map(([label, value]) => { const card = document.createElement('article'); const labelNode = document.createElement('span'); const valueNode = document.createElement('strong'); labelNode.textContent = label; valueNode.textContent = compact(value); card.append(labelNode, valueNode); return card; }));
  }
  let collectionObserver;
  function observeCollectionCard(card) {
    if (!('IntersectionObserver' in window)) { card.classList.add('is-visible'); return; }
    collectionObserver ||= new IntersectionObserver((entries) => entries.forEach((entry) => entry.target.classList.toggle('is-visible', entry.isIntersecting)), { rootMargin: '100px 0px', threshold: 0.12 });
    collectionObserver.observe(card);
  }
  function enableCardMotion(card) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(pointer: coarse)').matches) return;
    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      card.style.setProperty('--card-rx', `${(0.5 - y) * 3.5}deg`);
      card.style.setProperty('--card-ry', `${(x - 0.5) * 4.5}deg`);
      card.style.setProperty('--light-x', `${x * 100}%`);
      card.style.setProperty('--light-y', `${y * 100}%`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--card-rx', '0deg');
      card.style.setProperty('--card-ry', '0deg');
      card.style.setProperty('--light-x', '28%');
      card.style.setProperty('--light-y', '18%');
    });
  }
  function cardStat(icon, label, value) {
    const item = document.createElement('span'); item.className = `collectible-card__stat collectible-card__stat--${label.toLowerCase()}`;
    const symbol = document.createElement('span'); symbol.className = `collectible-card__stat-icon${label === 'Views' ? ' material-symbols-rounded' : ''}`; symbol.setAttribute('aria-hidden', 'true'); symbol.textContent = icon;
    const number = document.createElement('span'); number.textContent = compact(value);
    item.append(symbol, number); item.setAttribute('aria-label', `${label}: ${Number(value) || 0}`); return item;
  }
  const tierRank = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
  function wallpaperFor(card) { return Array.isArray(card.wallpapers) ? card.wallpapers[0] : card.wallpapers; }
  function updateCollectionControls() {
    document.getElementById('collection-sort-popular').classList.toggle('is-active', collectionSort === 'popular');
    document.getElementById('collection-sort-popular').setAttribute('aria-pressed', String(collectionSort === 'popular'));
    document.getElementById('collection-sort-recent').classList.toggle('is-active', collectionSort === 'recent');
    document.getElementById('collection-sort-recent').setAttribute('aria-pressed', String(collectionSort === 'recent'));
    document.getElementById('collection-suggestive').checked = Boolean(user && showSuggestive);
  }
  function suggestiveStorageKey(ownerId) { return `wallverse-show-suggestive:${ownerId}`; }
  function savedSuggestivePreference(ownerId) {
    try { return window.localStorage.getItem(suggestiveStorageKey(ownerId)) === 'true'; } catch { return false; }
  }
  function saveSuggestivePreference(ownerId, value) {
    try { window.localStorage.setItem(suggestiveStorageKey(ownerId), String(value)); } catch { /* A private browser may block storage. */ }
  }
  function renderWallpapers(cards, matchingCount = cards.length) {
    const grid = document.getElementById('profile-wallpaper-grid');
    const status = document.getElementById('profile-wallpapers-status');
    collectionObserver?.disconnect();
    grid.replaceChildren(...cards.map((ownedCard) => {
      const wallpaper = wallpaperFor(ownedCard);
      const tier = cardTier(wallpaper);
      const frame = String(ownedCard.card_frame_type || ownedCard.card_frame_id || 'default').replace(/[^A-Za-z]/g, '').toLowerCase() || 'default';
      const polished = wallpaper.polished_until && new Date(wallpaper.polished_until) > new Date();
      const card = document.createElement('article'); card.className = `collectible-card tier--${tier} frame--${frame}${polished ? ' is-polished' : ''}`;
      card.setAttribute('role', 'button'); card.tabIndex = 0;
      card.setAttribute('aria-label', `Open ${wallpaper.title || 'Untitled card'}, ${tier} rarity, ${Number(wallpaper.likes_count) || 0} likes, ${Number(wallpaper.downloads_count) || 0} downloads, ${Number(wallpaper.views_count) || 0} views`);
      const imageBox = document.createElement('div'); imageBox.className = 'collectible-card__media';
      const source = thumbnail(wallpaper);
      if (source) { const image = new Image(); image.className = 'collectible-card__image'; image.src = source; image.loading = 'lazy'; image.decoding = 'async'; image.draggable = false; image.alt = wallpaper.title ? `${wallpaper.title} wallpaper card` : 'Wallverse collectible card'; image.onerror = () => imageBox.classList.add('collectible-card__media--unavailable'); imageBox.append(image); } else imageBox.classList.add('collectible-card__media--unavailable');
      const surface = document.createElement('div'); surface.className = 'collectible-card__surface';
      const shine = document.createElement('div'); shine.className = 'collectible-card__shine'; shine.setAttribute('aria-hidden', 'true');
      const info = document.createElement('div'); info.className = 'collectible-card__info';
      const title = document.createElement('h3'); title.textContent = wallpaper.title || 'Untitled';
      const stats = document.createElement('div'); stats.className = 'collectible-card__stats';
      stats.append(cardStat('♥', 'Likes', wallpaper.likes_count), cardStat('↧', 'Downloads', wallpaper.downloads_count), cardStat('visibility', 'Views', wallpaper.views_count));
      info.append(title, stats); imageBox.append(surface, shine, info); card.append(imageBox);
      const inspect = () => window.dispatchEvent(new CustomEvent('wallverse:inspect', { detail: { wallpaper } }));
      card.addEventListener('click', inspect);
      card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspect(); } });
      observeCollectionCard(card); enableCardMotion(card); return card;
    }));
    status.textContent = matchingCount ? `Showing ${cards.length} of ${matchingCount} cards` : 'No cards match these filters.';
    status.hidden = false;
  }
  function applyCollectionView() {
    const query = document.getElementById('collection-search').value.trim().toLocaleLowerCase();
    const rarity = document.getElementById('collection-rarity').value;
    const quality = document.getElementById('collection-quality').value;
    const filtered = collectionCards.filter((card) => {
      const wallpaper = wallpaperFor(card);
      if (!wallpaper) return false;
      const title = String(wallpaper.title || '').toLocaleLowerCase();
      return (!query || title.includes(query)) && (rarity === 'all' || cardTier(wallpaper) === rarity) && (quality === 'all' || String(wallpaper.quality || '').toLocaleLowerCase() === quality);
    });
    filtered.sort((left, right) => {
      if (collectionSort === 'recent') return new Date(right.acquired_at || 0) - new Date(left.acquired_at || 0);
      const leftWallpaper = wallpaperFor(left); const rightWallpaper = wallpaperFor(right);
      const rarityDelta = tierRank[cardTier(rightWallpaper)] - tierRank[cardTier(leftWallpaper)];
      return rarityDelta || cardScore(rightWallpaper) - cardScore(leftWallpaper) || new Date(right.acquired_at || 0) - new Date(left.acquired_at || 0);
    });
    renderWallpapers(filtered.slice(0, 60), filtered.length);
  }
  async function load(sessionUser) {
    user = sessionUser || null;
    document.documentElement.dataset.authenticated = user ? 'true' : 'false';
    document.getElementById('profile-sign-in').hidden = Boolean(user);
    document.getElementById('profile-sign-out').hidden = !user;
    document.getElementById('profile-upload').hidden = !user;
    wallpapersSection.hidden = !user; signedOut.hidden = Boolean(user);
    if (!user) { showSuggestive = false; updateCollectionControls(); hero.hidden = true; return; }
    hero.hidden = false; hero.setAttribute('aria-busy', 'true');
    try {
      profile = await ensureProfile(user);
      document.getElementById('profile-name').textContent = `@${profile.username}`;
      document.getElementById('profile-role').textContent = profile.role || 'Member';
      setAvatar(document.getElementById('profile-avatar'));
      const banner = document.getElementById('profile-banner');
      if (profile.banner_url) { banner.src = profile.banner_url; banner.alt = ''; banner.hidden = false; banner.onerror = () => { banner.hidden = true; }; }
      showSuggestive = savedSuggestivePreference(user.id);
      updateCollectionControls();
      collectionCards = await fetchVisibleCollection(user.id, showSuggestive);
      applyCollectionView();
      try { renderStats(await fetchGlobalStats(user.id)); } catch (error) { console.warn('Profile statistics unavailable.', error); renderStats({ uploads: 0, likes: 0, downloads: 0, views: 0 }); }
      try {
        document.getElementById('profile-power').textContent = `${compact(await fetchCollectionPower(user.id))} pts`;
      } catch (error) {
        console.warn('Collection Power unavailable.', error);
        document.getElementById('profile-power').textContent = '—';
      }
    } catch (error) { document.getElementById('profile-role').textContent = error.message || 'Profile unavailable.'; }
    finally { hero.setAttribute('aria-busy', 'false'); }
  }
  document.getElementById('collection-search').addEventListener('input', applyCollectionView);
  document.getElementById('collection-rarity').addEventListener('change', applyCollectionView);
  document.getElementById('collection-quality').addEventListener('change', applyCollectionView);
  document.getElementById('collection-sort-popular').addEventListener('click', () => { collectionSort = 'popular'; updateCollectionControls(); applyCollectionView(); });
  document.getElementById('collection-sort-recent').addEventListener('click', () => { collectionSort = 'recent'; updateCollectionControls(); applyCollectionView(); });
  document.getElementById('collection-suggestive').addEventListener('change', async (event) => {
    if (!user) { event.target.checked = false; return; }
    const requested = event.target.checked;
    const status = document.getElementById('profile-wallpapers-status');
    const previousCards = collectionCards;
    showSuggestive = requested;
    if (!requested) { collectionCards = collectionCards.filter((card) => !wallpaperFor(card)?.is_suggestive); applyCollectionView(); }
    updateCollectionControls();
    status.textContent = 'Refreshing collection…'; status.hidden = false;
    event.target.disabled = true;
    try {
      collectionCards = await fetchVisibleCollection(user.id, requested);
      saveSuggestivePreference(user.id, requested);
      applyCollectionView();
    } catch (error) {
      showSuggestive = !requested;
      collectionCards = previousCards;
      updateCollectionControls();
      applyCollectionView();
      status.textContent = 'Unable to update this setting. Please try again.';
    } finally { event.target.disabled = false; }
  });
  document.getElementById('profile-sign-out').addEventListener('click', () => client.auth.signOut());
  client.auth.onAuthStateChange((_event, session) => window.setTimeout(() => load(session?.user), 0));
  client.auth.getSession().then(({ data }) => load(data.session?.user)).catch(() => load(null));
})();
