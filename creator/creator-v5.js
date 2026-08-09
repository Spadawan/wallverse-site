(() => {
  const start = () => {
    const config = window.WALLVERSE_PUBLIC_CONFIG;
    const helpers = window.WallverseCards;
    if (!config || !helpers || !window.supabase?.createClient) return false;

    const client = window.WallverseSupabase || window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const uploadTrigger = document.getElementById('creator-upload');
    const renderUploadTrigger = (user) => { if (uploadTrigger) uploadTrigger.hidden = !user; };
    client.auth.getUser().then(({ data }) => renderUploadTrigger(data.user)).catch(() => renderUploadTrigger(null));
    client.auth.onAuthStateChange((_event, session) => renderUploadTrigger(session?.user));
    const creatorId = new URLSearchParams(window.location.search).get('id');
    const fields = 'id,user_id,title,description,image_url,thumbnail_url,category,quality,width,height,file_size,likes_count,downloads_count,views_count,is_suggestive,is_weekly,is_featured,polished_until,created_at,storage_provider,thumbnail_storage_key,hd_storage_key,profiles!wallpapers_user_id_fkey(username,avatar_url,avatar_crop_x,avatar_crop_y,avatar_crop_scale,avatar_crop_rotation),wallpaper_tags(tags(name))';
    const tierRank = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
    const grid = document.getElementById('creator-grid');
    const status = document.getElementById('creator-status');
    let cards = [];
    let sort = 'rare';
    let observer;

    const compact = helpers.compactNumber;
    const createAdCard = helpers.createAdCard;
    const adCardInterval = helpers.adCardInterval || 12;
    const wallpaperFor = (card) => Array.isArray(card?.wallpapers) ? card.wallpapers[0] : (card?.wallpapers || card);
    const cardScore = helpers.publicCardScore;
    const tier = helpers.publicCardTier;
    const wallpaperPath = (wallpaper) => helpers.wallpaperPath?.(wallpaper)
      || window.WallverseWallpaperRouter?.wallpaperPath?.(wallpaper)
      || `/wallpaper/${String(wallpaper?.title || 'wallpaper').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'wallpaper'}-${String(wallpaper?.id || '').replace(/-/g, '').slice(0, 8)}`;
    const allPages = async (factory) => {
      const result = []; let offset = 0;
      while (true) {
        const { data, error } = await factory(offset);
        if (error) throw error;
        const page = data || []; result.push(...page);
        if (page.length < 1000) return result;
        offset += 1000;
      }
    };
    const addAvatar = (target, profile, rarity = 'common') => {
      target.textContent = (profile?.username || 'W').charAt(0).toUpperCase(); window.WallverseAvatarCrop?.apply(target, profile);
      window.WallverseCardFrames?.applyAvatar?.(target, profile?.avatar_frame_type, rarity);
      if (!profile?.avatar_url) return;
      const image = new Image(); image.className = 'avatar__image'; image.alt = ''; image.src = profile.avatar_url;
      image.onload = () => { target.replaceChildren(image); window.WallverseCardFrames?.applyAvatar?.(target, profile?.avatar_frame_type, rarity); };
    };
    const cardStat = (icon, label, value) => {
      const node = document.createElement('span'); node.className = `collectible-card__stat collectible-card__stat--${label.toLowerCase()}`;
      node.setAttribute('aria-label', `${label}: ${Number(value) || 0}`);
      const glyph = document.createElement('span'); glyph.className = `collectible-card__stat-icon${label === 'Views' ? ' material-symbols-rounded' : ''}`; glyph.setAttribute('aria-hidden', 'true'); glyph.textContent = icon;
      const amount = document.createElement('span'); amount.textContent = compact(value); node.append(glyph, amount); return node;
    };
    const observe = (card) => {
      if (!('IntersectionObserver' in window)) { card.classList.add('is-visible'); return; }
      observer ||= new IntersectionObserver((entries) => entries.forEach((entry) => entry.target.classList.toggle('is-visible', entry.isIntersecting)), { rootMargin: '100px 0px', threshold: .12 });
      observer.observe(card);
    };
    const renderCard = (record) => {
      const wallpaper = wallpaperFor(record); const rarity = tier(wallpaper);
      const frame = helpers.frameForCardRecord?.(record, wallpaper)
        || window.WallverseCardFrames?.normalize(record, record?.card_frame_type, record?.card_frame_id)
        || 'default';
      const polished = wallpaper.polished_until && new Date(wallpaper.polished_until) > new Date();
      const card = document.createElement('a'); card.className = `collectible-card tier--${rarity}${polished ? ' is-polished' : ''}`;
      card.href = wallpaperPath(wallpaper);
      card.setAttribute('aria-label', `Open ${wallpaper.title || 'Untitled card'}, ${rarity} rarity`);
      const media = document.createElement('div'); media.className = 'collectible-card__media';
      const source = helpers.thumbnailUrl(wallpaper);
      if (source) {
        const image = new Image(); image.className = 'collectible-card__image'; image.src = source; image.loading = 'lazy'; image.decoding = 'async'; image.draggable = false;
        image.alt = wallpaper.title ? `${wallpaper.title} wallpaper card` : 'Wallverse collectible card'; image.onerror = () => media.classList.add('collectible-card__media--unavailable'); media.append(image);
      } else media.classList.add('collectible-card__media--unavailable');
      const surface = document.createElement('div'); surface.className = 'collectible-card__surface';
      const shine = document.createElement('div'); shine.className = 'collectible-card__shine'; shine.setAttribute('aria-hidden', 'true');
      const info = document.createElement('div'); info.className = 'collectible-card__info';
      const title = document.createElement('h3'); title.textContent = wallpaper.title || 'Untitled';
      const stats = document.createElement('div'); stats.className = 'collectible-card__stats';
      stats.append(cardStat('\u2665', 'Likes', wallpaper.likes_count), cardStat('\u21E9', 'Downloads', wallpaper.downloads_count), cardStat('visibility', 'Views', wallpaper.views_count));
      info.append(title, stats); media.append(surface, shine, info); card.append(media);
      window.WallverseCardFrames?.apply(card, frame);
      const inspect = () => window.dispatchEvent(new CustomEvent('wallverse:inspect', { detail: { wallpaper: { ...wallpaper, web_card_frame_type: frame } } }));
      card.addEventListener('click', (event) => { event.preventDefault(); inspect(); });
      helpers.enablePublicCardMotion(card); observe(card); return card;
    };
    const setSortControls = () => document.querySelectorAll('[data-creator-sort]').forEach((button) => {
      const active = button.dataset.creatorSort === sort; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active));
    });
    const render = () => {
      const query = document.getElementById('creator-search').value.trim().toLocaleLowerCase();
      const rarity = document.getElementById('creator-rarity').value;
      const category = document.getElementById('creator-category').value;
      const filtered = cards.filter((record) => {
        const wallpaper = wallpaperFor(record); const text = [wallpaper.title, wallpaper.category, ...helpers.tagsFor(wallpaper)].filter(Boolean).join(' ').toLocaleLowerCase();
        return (!query || text.includes(query)) && (rarity === 'all' || tier(wallpaper) === rarity) && (category === 'all' || String(wallpaper.category || '').toLocaleLowerCase() === category);
      });
      filtered.sort((left, right) => {
        const a = wallpaperFor(left); const b = wallpaperFor(right);
        if (sort === 'recent') return new Date(b.created_at || b.acquired_at || 0) - new Date(a.created_at || a.acquired_at || 0);
        if (sort === 'downloads') return (Number(b.downloads_count) || 0) - (Number(a.downloads_count) || 0);
        return tierRank[tier(b)] - tierRank[tier(a)] || cardScore(b) - cardScore(a) || new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
      const cardsToShow = filtered.slice(0, 60);
      const gridItems = [];
      cardsToShow.forEach((record, index) => {
        gridItems.push(renderCard(record));
        if ((index + 1) % adCardInterval === 0 && createAdCard) gridItems.push(createAdCard());
      });
      observer?.disconnect(); grid.replaceChildren(...gridItems);
      status.textContent = filtered.length ? `Showing ${Math.min(filtered.length, 60)} of ${filtered.length} public cards` : 'No public cards match these filters.';
      setSortControls();
    };
    const renderStats = (wallpapers, ownedCount) => {
      const totals = wallpapers.reduce((sum, wallpaper) => ({ likes: sum.likes + (Number(wallpaper.likes_count) || 0), downloads: sum.downloads + (Number(wallpaper.downloads_count) || 0), views: sum.views + (Number(wallpaper.views_count) || 0), featured: sum.featured + (wallpaper.is_featured ? 1 : 0) }), { likes: 0, downloads: 0, views: 0, featured: 0 });
      const values = [['Uploads', wallpapers.length], ['Likes', totals.likes], ['Downloads', totals.downloads], ['Views', totals.views]];
      document.getElementById('creator-stats').replaceChildren(...values.map(([label, value]) => { const item = document.createElement('article'); item.innerHTML = `<span>${label}</span><strong>${compact(value)}</strong>`; return item; }));
      const powerSource = ownedCount ? cards.map(wallpaperFor) : wallpapers;
      const power = powerSource.reduce((sum, wallpaper) => sum + cardScore(wallpaper), 0);
      document.getElementById('creator-power').textContent = `${compact(power)} pts`;
      return { ...totals, uploads: wallpapers.length };
    };
    const fail = (message) => { document.getElementById('creator-role').textContent = message; document.getElementById('creator-hero').setAttribute('aria-busy', 'false'); status.textContent = message; };
    const load = async () => {
      if (!creatorId) { fail('This creator profile is unavailable.'); return; }
      try {
        const [{ data: profile, error: profileError }, uploaded, visibleUploaded, owned] = await Promise.all([
          client.from('profiles').select('id,username,role,avatar_url,avatar_crop_x,avatar_crop_y,avatar_crop_scale,avatar_crop_rotation,banner_url,followers_count,avatar_frame_type').eq('id', creatorId).maybeSingle(),
          allPages((offset) => client.from('wallpapers').select(fields).eq('user_id', creatorId).eq('status', 'approved').order('created_at', { ascending: false }).range(offset, offset + 999)),
          allPages((offset) => client.from('wallpapers').select(fields).eq('user_id', creatorId).eq('status', 'approved').eq('is_suggestive', false).order('created_at', { ascending: false }).range(offset, offset + 999)),
          allPages((offset) => client.from('user_cards').select(`id,acquired_at,card_frame_id,card_frame_type,wallpapers!inner(${fields})`).eq('owner_id', creatorId).eq('wallpapers.status', 'approved').eq('wallpapers.is_suggestive', false).order('acquired_at', { ascending: false }).range(offset, offset + 999)).catch(() => []),
        ]);
        if (profileError) throw profileError;
        if (!profile) { fail('This creator profile was not found.'); return; }
        document.title = `@${profile.username || 'Creator'} Â· Wallverse`;
        document.getElementById('creator-name').textContent = `@${profile.username || 'creator'}`;
        document.getElementById('creator-role').textContent = profile.role || 'Wallverse creator';
        const banner = document.getElementById('creator-banner');
        if (profile.banner_url) {
          banner.src = profile.banner_url; banner.hidden = false;
          banner.onerror = () => { banner.hidden = true; };
        }
        // The statistics represent every approved upload. The visible grid
        // still follows the public safe-content rule until suggestive content
        // is explicitly enabled on a future creator page control.
        cards = owned.length ? owned : visibleUploaded;
        const creatorTotals = renderStats(uploaded, owned.length);
        addAvatar(document.getElementById('creator-avatar'), profile, window.WallverseCardFrames?.creatorRarity(profile, creatorTotals) || 'common');
        render();
      } catch (error) { console.warn('Creator profile unavailable.', error); fail('Creator details are unavailable right now.'); }
      finally { document.getElementById('creator-hero').setAttribute('aria-busy', 'false'); }
    };
    document.getElementById('creator-search').addEventListener('input', render);
    document.getElementById('creator-rarity').addEventListener('change', render);
    document.getElementById('creator-category').addEventListener('change', render);
    document.querySelectorAll('[data-creator-sort]').forEach((button) => button.addEventListener('click', () => { sort = button.dataset.creatorSort; render(); }));
    window.addEventListener('wallverse:frames-ready', () => { if (cards.length) render(); });
    load(); return true;
  };
  if (!start()) window.addEventListener('wallverse:data-ready', start, { once: true });
})();
