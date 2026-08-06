(() => {
  const config = window.WALLVERSE_PUBLIC_CONFIG;
  if (!config || !window.supabase?.createClient) return;
  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const userPattern = /^[A-Za-z0-9_]{3,20}$/;
  const hero = document.getElementById('profile-hero');
  const overview = document.getElementById('profile-overview');
  const wallpapersSection = document.getElementById('profile-wallpapers');
  const signedOut = document.getElementById('profile-signed-out');
  const message = document.getElementById('profile-message');
  let profile = null;
  let user = null;

  const compact = (value) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
  const setMessage = (text = '') => { message.textContent = text; message.hidden = !text; };
  const r2Url = (key) => `${config.r2PublicBaseUrl.replace(/\/+$/, '')}/${String(key || '').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')}`;
  const thumbnail = (wallpaper) => wallpaper.storage_provider === 'cloudflare_r2' && wallpaper.thumbnail_storage_key ? r2Url(wallpaper.thumbnail_storage_key) : (wallpaper.thumbnail_url || '');
  function score(wallpaper) {
    const quality = String(wallpaper.quality || '').toLowerCase();
    const qualityScore = quality === 'premium' ? 180 : quality === 'high' ? 90 : quality === 'standard' ? 30 : 0;
    return (wallpaper.likes_count || 0) * 4 + (wallpaper.downloads_count || 0) * 3 + (wallpaper.views_count || 0) + qualityScore + (wallpaper.is_featured ? 220 : 0) + (wallpaper.is_weekly ? 380 : 0);
  }
  function power(wallpapers) {
    return wallpapers.reduce((total, wallpaper) => { const value = score(wallpaper); return total + value + (value >= 5000 ? 620 : value >= 2600 ? 360 : value >= 1300 ? 190 : value >= 450 ? 90 : value >= 120 ? 55 : 25); }, 0);
  }
  function setAvatar(node) {
    const username = profile?.username || 'W'; node.textContent = username.charAt(0).toUpperCase();
    if (!profile?.avatar_url) return;
    const image = new Image(); image.className = 'avatar__image'; image.alt = ''; image.src = profile.avatar_url; image.onload = () => node.replaceChildren(image);
  }
  async function ensureProfile(sessionUser) {
    const { data, error } = await client.from('profiles').select('id,username,role,avatar_url,followers_count').eq('id', sessionUser.id).maybeSingle();
    if (error) throw error;
    if (data) return data;
    const source = String(sessionUser.user_metadata?.username || sessionUser.email?.split('@')[0] || 'user').replace(/[^A-Za-z0-9_]/g, '').slice(0, 14);
    const username = userPattern.test(source) ? source : `user_${sessionUser.id.slice(0, 6)}`;
    const { error: insertError } = await client.from('profiles').insert({ id: sessionUser.id, username });
    if (insertError) throw insertError;
    const { data: created, error: createdError } = await client.from('profiles').select('id,username,role,avatar_url,followers_count').eq('id', sessionUser.id).single();
    if (createdError) throw createdError;
    return created;
  }
  function renderStats(wallpapers) {
    const totals = wallpapers.reduce((result, wallpaper) => ({ likes: result.likes + (wallpaper.likes_count || 0), downloads: result.downloads + (wallpaper.downloads_count || 0), views: result.views + (wallpaper.views_count || 0) }), { likes: 0, downloads: 0, views: 0 });
    const values = [['Uploads', wallpapers.length], ['Likes', totals.likes], ['Downloads', totals.downloads], ['Views', totals.views]];
    document.getElementById('profile-stats').replaceChildren(...values.map(([label, value]) => { const card = document.createElement('article'); const labelNode = document.createElement('span'); const valueNode = document.createElement('strong'); labelNode.textContent = label; valueNode.textContent = compact(value); card.append(labelNode, valueNode); return card; }));
    document.getElementById('profile-power').textContent = `${compact(power(wallpapers))} pts`;
  }
  function renderWallpapers(wallpapers) {
    const grid = document.getElementById('profile-wallpaper-grid');
    const status = document.getElementById('profile-wallpapers-status');
    grid.replaceChildren(...wallpapers.map((wallpaper) => {
      const card = document.createElement('article'); card.className = 'wallpaper-card';
      const imageBox = document.createElement('div'); imageBox.className = 'wallpaper-image';
      const source = thumbnail(wallpaper);
      if (source) { const image = new Image(); image.src = source; image.loading = 'lazy'; image.decoding = 'async'; image.alt = wallpaper.title ? `${wallpaper.title} wallpaper` : 'Wallverse wallpaper'; image.onerror = () => imageBox.classList.add('wallpaper-image--unavailable'); imageBox.append(image); } else imageBox.classList.add('wallpaper-image--unavailable');
      const info = document.createElement('div'); info.className = 'wallpaper-info';
      if (wallpaper.title) { const title = document.createElement('h3'); title.textContent = wallpaper.title; info.append(title); }
      const quality = String(wallpaper.quality || '').toLowerCase(); if (['premium', 'high', 'hd', '4k'].includes(quality)) { const badge = document.createElement('span'); badge.className = 'tag'; badge.textContent = 'HD'; info.append(badge); }
      card.append(imageBox, info); return card;
    }));
    status.textContent = wallpapers.length ? '' : 'No approved public wallpapers yet.'; status.hidden = Boolean(wallpapers.length);
  }
  async function load(sessionUser) {
    user = sessionUser || null;
    document.documentElement.dataset.authenticated = user ? 'true' : 'false';
    document.getElementById('profile-sign-in').hidden = Boolean(user);
    document.getElementById('profile-sign-out').hidden = !user;
    overview.hidden = !user; wallpapersSection.hidden = !user; signedOut.hidden = Boolean(user);
    if (!user) { hero.hidden = true; return; }
    hero.hidden = false; hero.setAttribute('aria-busy', 'true');
    try {
      profile = await ensureProfile(user);
      document.getElementById('profile-name').textContent = `@${profile.username}`;
      document.getElementById('profile-role').textContent = profile.role || 'Member';
      document.getElementById('profile-username').value = profile.username || '';
      setAvatar(document.getElementById('profile-avatar'));
      const { data: wallpapers, error } = await client.from('wallpapers').select('id,title,thumbnail_url,quality,likes_count,downloads_count,views_count,is_featured,is_weekly,storage_provider,thumbnail_storage_key').eq('user_id', user.id).eq('status', 'approved').eq('is_suggestive', false).order('created_at', { ascending: false }).limit(40);
      if (error) throw error;
      renderStats(wallpapers || []); renderWallpapers(wallpapers || []);
    } catch (error) { document.getElementById('profile-role').textContent = error.message || 'Profile unavailable.'; }
    finally { hero.setAttribute('aria-busy', 'false'); }
  }
  document.getElementById('profile-sign-out').addEventListener('click', () => client.auth.signOut());
  document.getElementById('profile-settings').addEventListener('submit', async (event) => {
    event.preventDefault(); const username = document.getElementById('profile-username').value.trim();
    if (!userPattern.test(username)) { setMessage('Username must be 3–20 characters: letters, numbers, and underscores only.'); return; }
    const { data: taken, error: lookupError } = await client.from('profiles').select('id').ilike('username', username).maybeSingle();
    if (lookupError) { setMessage(lookupError.message); return; }
    if (taken && taken.id !== user.id) { setMessage('That username is already taken.'); return; }
    const { data, error } = await client.from('profiles').update({ username }).eq('id', user.id).select('id,username,role,avatar_url,followers_count').single();
    if (error) { setMessage(error.message); return; }
    profile = data; document.getElementById('profile-name').textContent = `@${profile.username}`; setAvatar(document.getElementById('profile-avatar')); setMessage('Username saved.');
  });
  client.auth.onAuthStateChange((_event, session) => window.setTimeout(() => load(session?.user), 0));
  client.auth.getSession().then(({ data }) => load(data.session?.user)).catch(() => load(null));
})();
