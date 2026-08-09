(() => {
  const config = window.WALLVERSE_PUBLIC_CONFIG;
  const helpers = window.WallverseCards;
  const supabaseApi = window.supabase;
  const dialog = document.getElementById('inspection-dialog');
  if (!config || !helpers || !supabaseApi?.createClient || !dialog) return;

  const client = window.WallverseSupabase || supabaseApi.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const card = document.getElementById('inspection-card');
  const image = document.getElementById('inspection-image');
  const likeButton = document.getElementById('inspection-like');
  const favoriteButton = document.getElementById('inspection-favorite');
  const downloadButton = document.getElementById('inspection-download');
  const commentForm = document.getElementById('inspection-comment-form');
  const signInButton = document.getElementById('inspection-sign-in');
  const message = document.getElementById('inspection-message');
  let currentWallpaper = null;
  let currentUser = null;
  let liked = false;
  let favorited = false;
  let socialBusy = false;
  let downloadTimer = null;
  let downloadAdInitialized = false;
  let inspectionImageSource = '';
  const LIKE_ICON = '\u2665';
  const DOWNLOAD_ICON = '\u21E9';
  const SPARKLE_ICON = '\u2726';

  const downloadDialog = document.createElement('dialog');
  downloadDialog.className = 'download-ad-dialog';
  downloadDialog.setAttribute('aria-labelledby', 'download-ad-title');
  downloadDialog.innerHTML = `<button class="dialog-close download-ad-dialog__close" type="button" data-close-download-ad aria-label="Cancel download">\u00d7</button><div class="download-ad-dialog__body"><p class="highlight-label">SPONSORED DOWNLOAD</p><h2 id="download-ad-title">Unlock HD Download</h2><p>This short sponsored message helps keep Wallverse free.</p><div class="download-ad-dialog__ad"><span>Advertisement</span><ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-6482601365294880" data-ad-slot="9142050893" data-ad-format="auto" data-full-width-responsive="true"></ins></div><p class="download-ad-dialog__status" id="download-ad-status" role="status" aria-live="polite">Download available in 6\u2026</p><div class="download-ad-dialog__actions"><button class="text-button" type="button" data-close-download-ad>Cancel</button><button class="button" id="download-ad-confirm" type="button" disabled>Download HD</button></div></div>`;
  document.body.append(downloadDialog);
  const downloadStatus = downloadDialog.querySelector('#download-ad-status');
  const downloadConfirm = downloadDialog.querySelector('#download-ad-confirm');

  const authReady = client.auth.getUser().then(({ data }) => {
    currentUser = data.user || null;
    renderAuthState();
  }).catch(() => { currentUser = null; renderAuthState(); });

  function profileFor(value) { return Array.isArray(value) ? value[0] : value; }
  function setMessage(text = '') { message.textContent = text; message.hidden = !text; }
  function formatDate(value) {
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
  }
  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB']; let index = 0; let amount = bytes;
    while (amount >= 1024 && index < units.length - 1) { amount /= 1024; index += 1; }
    return `${amount.toFixed(index ? 1 : 0)} ${units[index]}`;
  }
  function stat(icon, label, value) {
    const item = document.createElement('span'); item.className = `collectible-card__stat collectible-card__stat--${label.toLowerCase()}`;
    item.setAttribute('aria-label', `${label}: ${Number(value) || 0}`);
    const symbol = document.createElement('span'); symbol.className = `collectible-card__stat-icon${label === 'Views' ? ' material-symbols-rounded' : ''}`; symbol.setAttribute('aria-hidden', 'true'); symbol.textContent = icon;
    const number = document.createElement('span'); number.textContent = helpers.compactNumber(value);
    item.append(symbol, number); return item;
  }
  function avatar(profile, { framed = false } = {}) {
    const node = document.createElement('span'); node.className = 'avatar avatar--violet'; node.textContent = (profile?.username || 'W').charAt(0).toUpperCase(); window.WallverseAvatarCrop?.apply(node, profile);
    if (profile?.avatar_url) {
      const avatarImage = new Image(); avatarImage.className = 'avatar__image'; avatarImage.alt = ''; avatarImage.src = profile.avatar_url;
      avatarImage.onload = () => { node.replaceChildren(avatarImage); if (framed) window.WallverseCardFrames?.applyAvatar?.(node, profile?.avatar_frame_type, 'common'); };
    }
    if (framed) window.WallverseCardFrames?.applyAvatar?.(node, profile?.avatar_frame_type, 'common');
    return node;
  }
  function cardRecordFor(wallpaper) {
    const records = Array.isArray(wallpaper?.user_cards) ? wallpaper.user_cards : (wallpaper?.user_cards ? [wallpaper.user_cards] : []);
    const active = records.filter((record) => !record?.archived);
    return active.find((record) => record?.owner_id === currentUser?.id) || active[0] || null;
  }
  function cardFrameFor(wallpaper) {
    if (typeof helpers.frameForCardRecord === 'function') return helpers.frameForCardRecord(cardRecordFor(wallpaper), wallpaper);
    const record = cardRecordFor(wallpaper);
    return window.WallverseCardFrames?.normalize(record, wallpaper?.web_card_frame_type, wallpaper?.card_frame_type, wallpaper?.card_frame_id) || 'default';
  }
  function renderAuthState() {
    favoriteButton.hidden = !currentUser;
    commentForm.hidden = !currentUser;
    signInButton.hidden = Boolean(currentUser);
    if (!currentUser) { liked = false; favorited = false; }
    renderSocialState();
  }
  function renderSocialState() {
    likeButton.classList.toggle('is-active', liked); likeButton.setAttribute('aria-pressed', String(liked));
    favoriteButton.classList.toggle('is-active', favorited); favoriteButton.setAttribute('aria-pressed', String(favorited));
    favoriteButton.querySelector('small').textContent = favorited ? 'Saved' : 'Save';
  }
  function celebrateLike() {
    likeButton.classList.remove('is-celebrating'); void likeButton.offsetWidth; likeButton.classList.add('is-celebrating');
    for (let index = 0; index < 12; index += 1) {
      const particle = document.createElement('i'); particle.className = 'like-particle'; particle.setAttribute('aria-hidden', 'true');
      const angle = (Math.PI * 2 * index) / 12; const distance = 38 + (index % 3) * 9;
      particle.style.setProperty('--particle-x', `${Math.cos(angle) * distance}px`); particle.style.setProperty('--particle-y', `${Math.sin(angle) * distance}px`);
      particle.textContent = index % 3 ? LIKE_ICON : SPARKLE_ICON; likeButton.append(particle);
      window.setTimeout(() => particle.remove(), 900);
    }
    window.setTimeout(() => likeButton.classList.remove('is-celebrating'), 900);
  }
  function anonymousViewSession() {
    const key = 'wallverse_anonymous_view_session_id';
    try {
      const existing = window.localStorage.getItem(key); if (existing) return existing;
      const values = new Uint32Array(4); window.crypto.getRandomValues(values);
      const created = [...values].map((value) => value.toString(16).padStart(8, '0')).join('');
      window.localStorage.setItem(key, created); return created;
    } catch { return `web-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`; }
  }
  async function recordView(wallpaperId) {
    await authReady;
    const { data, error } = await client.rpc('record_wallpaper_view', {
      wallpaper_id_input: wallpaperId,
      session_id_input: currentUser ? null : anonymousViewSession(),
    });
    if (error) { console.warn('View could not be recorded.', error.message); return false; }
    return data === true || String(data || '').toLowerCase() === 'counted';
  }
  function refreshInspectionStats() {
    document.getElementById('inspection-card-stats').replaceChildren(
      stat(LIKE_ICON, 'Likes', currentWallpaper.likes_count),
      stat(DOWNLOAD_ICON, 'Downloads', currentWallpaper.downloads_count),
      stat('visibility', 'Views', currentWallpaper.views_count),
    );
  }
  async function loadSocialState() {
    await authReady;
    if (!currentUser || !currentWallpaper) { renderAuthState(); return; }
    const wallpaperId = currentWallpaper.id;
    const [likeResult, favoriteResult] = await Promise.all([
      client.from('likes').select('wallpaper_id').eq('user_id', currentUser.id).eq('wallpaper_id', wallpaperId).maybeSingle(),
      client.from('favorites').select('wallpaper_id').eq('user_id', currentUser.id).eq('wallpaper_id', wallpaperId).maybeSingle(),
    ]);
    if (currentWallpaper?.id !== wallpaperId) return;
    liked = Boolean(likeResult.data); favorited = Boolean(favoriteResult.data); renderSocialState();
  }
  function renderInspectionFrame(wallpaper) {
    const tier = helpers.publicCardTier(wallpaper);
    const frame = cardFrameFor(wallpaper);
    const polished = wallpaper.polished_until && new Date(wallpaper.polished_until) > new Date();
    dialog.className = `inspection-dialog tier--${tier}`;
    card.className = `collectible-card inspection-card tier--${tier} is-visible${polished ? ' is-polished' : ''}`;
    window.WallverseCardFrames?.apply(card, frame);
    const frameLabel = frame === 'default' ? '' : ` \u00b7 ${window.WallverseCardFrames.label(frame)}`;
    document.getElementById('inspection-rarity').textContent = `${tier}${frameLabel}${polished ? ' \u00b7 Polished' : ''}`;
  }
  function setInspectionImage(wallpaper) {
    const source = helpers.thumbnailUrl(wallpaper) || '';
    // Safari/WebKit may temporarily blank a decoded <img> when its identical
    // source is assigned again. Frame hydration runs asynchronously, so keep
    // the already-decoded bitmap mounted unless the wallpaper actually changed.
    if (source && source !== inspectionImageSource) {
      inspectionImageSource = source;
      image.src = source;
    } else if (!source && inspectionImageSource) {
      inspectionImageSource = '';
      image.removeAttribute('src');
    }
    image.alt = wallpaper.title ? `${wallpaper.title} wallpaper card` : 'Wallverse wallpaper card';
    image.draggable = false;
  }
  function renderWallpaper(wallpaper) {
    const tier = helpers.publicCardTier(wallpaper);
    renderInspectionFrame(wallpaper);
    setInspectionImage(wallpaper);
    document.getElementById('inspection-title').textContent = wallpaper.title || 'Untitled';
    document.getElementById('inspection-card-stats').replaceChildren(stat(LIKE_ICON, 'Likes', wallpaper.likes_count), stat(DOWNLOAD_ICON, 'Downloads', wallpaper.downloads_count), stat('visibility', 'Views', wallpaper.views_count));
    document.getElementById('inspection-like-count').textContent = helpers.compactNumber(wallpaper.likes_count);
    const creatorProfile = profileFor(wallpaper.profiles);
    const profile = wallpaper.web_card_owner_profile || creatorProfile;
    const owner = document.getElementById('inspection-owner');
    owner.replaceChildren(avatar(profile, { framed: true }));
    const ownerCopy = document.createElement('div'); const eyebrow = document.createElement('span'); eyebrow.textContent = 'Current owner';
    const ownerName = document.createElement('strong'); ownerName.textContent = profile?.username ? `@${profile.username}` : 'Unknown creator'; ownerCopy.append(eyebrow, ownerName); owner.append(ownerCopy);
    const description = document.getElementById('inspection-description'); description.textContent = wallpaper.description || ''; description.hidden = !wallpaper.description;
    const tags = helpers.tagsFor(wallpaper); const tagsNode = document.getElementById('inspection-tags');
    tagsNode.replaceChildren(...tags.map((tag) => { const node = document.createElement('button'); node.type = 'button'; node.className = 'inspection-tag'; node.textContent = tag; node.setAttribute('aria-label', `Search wallpapers tagged ${tag}`); node.addEventListener('click', () => { dialog.close(); window.dispatchEvent(new CustomEvent('wallverse:feed-search', { detail: { query: tag } })); }); return node; }));
    const facts = [
      ['Rarity', tier], ['Quality', helpers.qualityLabel(wallpaper.quality) || wallpaper.quality || '\u2014'],
      ['Dimensions', wallpaper.width && wallpaper.height ? `${wallpaper.width} \u00d7 ${wallpaper.height}` : '\u2014'],
      ['File size', formatBytes(wallpaper.file_size) || '\u2014'], ['Published', formatDate(wallpaper.created_at) || '\u2014'],
    ];
    facts.push(['Creator', creatorProfile?.username ? `@${creatorProfile.username}` : '-']);
    document.getElementById('inspection-facts').replaceChildren(...facts.map(([label, value]) => { const group = document.createElement('div'); const term = document.createElement('dt'); const detail = document.createElement('dd'); term.textContent = label; detail.textContent = value; group.append(term, detail); return group; }));
    liked = false; favorited = false; renderAuthState(); setMessage();
    downloadButton.disabled = false;
    downloadButton.removeAttribute('aria-disabled');
    downloadButton.title = 'Unlock an HD download';
    downloadButton.querySelector('strong').textContent = 'Download';
    downloadButton.querySelector('small').textContent = 'HD';
  }

  function clearDownloadCountdown() {
    if (downloadTimer) window.clearInterval(downloadTimer);
    downloadTimer = null;
  }
  function initializeDownloadAd() {
    if (downloadAdInitialized) return;
    downloadAdInitialized = true;
    requestAnimationFrame(() => {
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
      catch (error) { console.warn('Download ad could not be initialized.', error); }
    });
  }
  function startDownloadCountdown() {
    clearDownloadCountdown();
    let remaining = 6;
    downloadConfirm.disabled = true;
    downloadStatus.textContent = `Download available in ${remaining}\u2026`;
    downloadTimer = window.setInterval(() => {
      remaining -= 1;
      if (remaining > 0) { downloadStatus.textContent = `Download available in ${remaining}\u2026`; return; }
      clearDownloadCountdown();
      downloadStatus.textContent = 'Ready to download';
      downloadConfirm.disabled = false;
    }, 1000);
  }
  function openDownloadGate() {
    if (!currentWallpaper) return;
    if (!downloadDialog.open) downloadDialog.showModal();
    initializeDownloadAd();
    startDownloadCountdown();
  }
  function downloadFileName(wallpaper, url) {
    const rawTitle = String(wallpaper?.title || '').trim();
    const safeTitle = rawTitle
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96);
    const extension = (new URL(url, window.location.href).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1] || 'webp').toLowerCase();
    return safeTitle ? `${safeTitle}.${extension}` : 'wallverse-wallpaper.webp';
  }
  async function triggerDirectDownload(url, filename) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = blobUrl; link.download = filename;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      return;
    } catch (error) {
      console.warn('Direct HD download is unavailable; opening the image instead.', error);
    }
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.target = '_blank'; link.rel = 'noopener';
    document.body.append(link); link.click(); link.remove();
  }
  async function confirmDownload() {
    if (!currentWallpaper) return;
    const url = helpers.downloadUrl(currentWallpaper);
    if (!url) { downloadStatus.textContent = 'HD download is unavailable for this wallpaper.'; return; }
    downloadConfirm.disabled = true;
    await triggerDirectDownload(url, downloadFileName(currentWallpaper, url));
    try {
      const { data, error } = await client.rpc('record_wallpaper_download', { wallpaper_id_input: currentWallpaper.id, quality_input: 'hd' });
      if (error) throw error;
      if (String(data || '').toLowerCase() === 'counted') {
        currentWallpaper.downloads_count = (Number(currentWallpaper.downloads_count) || 0) + 1;
        refreshInspectionStats();
        window.dispatchEvent(new CustomEvent('wallverse:wallpaper-updated', { detail: { wallpaper: currentWallpaper } }));
      }
    } catch (error) { console.warn('Download could not be recorded.', error); }
    downloadStatus.textContent = 'Thanks for supporting Wallverse \u2764\ufe0f';
  }
  async function loadComments(wallpaperId) {
    const list = document.getElementById('inspection-comment-list'); list.replaceChildren();
    const loading = document.createElement('p'); loading.textContent = 'Loading comments\u2026'; list.append(loading);
    const { data, error } = await client.from('comments')
      .select('id,user_id,parent_id,body,is_deleted,likes_count,created_at,profiles!comments_user_id_fkey(username,avatar_url,avatar_crop_x,avatar_crop_y,avatar_crop_scale,avatar_crop_rotation,role)')
      .eq('wallpaper_id', wallpaperId).order('created_at', { ascending: true }).limit(100);
    if (currentWallpaper?.id !== wallpaperId) return;
    if (error) { loading.textContent = 'Comments are unavailable right now.'; return; }
    const comments = data || []; document.getElementById('inspection-comment-count').textContent = String(comments.length);
    if (!comments.length) { loading.textContent = 'No comments yet. Start the conversation.'; return; }
    list.replaceChildren(...comments.map((comment) => {
      const article = document.createElement('article'); article.className = 'inspection-comment';
      const profile = profileFor(comment.profiles); article.append(avatar(profile));
      const content = document.createElement('div'); const head = document.createElement('p'); const name = document.createElement('strong'); const time = document.createElement('time');
      name.textContent = profile?.username ? `@${profile.username}` : '@unknown'; time.dateTime = comment.created_at || ''; time.textContent = formatDate(comment.created_at); head.append(name, time);
      const body = document.createElement('p'); body.textContent = comment.is_deleted ? 'Comment deleted' : comment.body;
      const likes = document.createElement('small'); likes.textContent = `${Number(comment.likes_count) || 0} likes`; content.append(head, body, likes); article.append(content); return article;
    }));
  }
  async function openInspection(wallpaper) {
    currentWallpaper = wallpaper; renderWallpaper(wallpaper);
    if (!dialog.open) dialog.showModal();
    await authReady;
    renderAuthState();
    const [viewResult] = await Promise.allSettled([recordView(wallpaper.id), loadSocialState(), loadComments(wallpaper.id)]);
    if (currentWallpaper?.id === wallpaper.id && viewResult.status === 'fulfilled' && viewResult.value) {
      currentWallpaper.views_count = (Number(currentWallpaper.views_count) || 0) + 1;
      refreshInspectionStats();
      window.dispatchEvent(new CustomEvent('wallverse:wallpaper-updated', { detail: { wallpaper: currentWallpaper } }));
    }
  }
  async function toggleLike() {
    if (!currentUser) { dialog.close(); document.getElementById('auth-trigger')?.click(); return; }
    if (socialBusy || !currentWallpaper) return;
    socialBusy = true; likeButton.disabled = true; const previous = liked; liked = !liked; renderSocialState();
    if (liked) celebrateLike();
    try {
      const { error } = await client.rpc('toggle_wallpaper_like', { wallpaper_id_input: currentWallpaper.id, should_like: liked });
      if (error) throw error;
      currentWallpaper.likes_count = Math.max(0, (Number(currentWallpaper.likes_count) || 0) + (liked ? 1 : -1));
      document.getElementById('inspection-like-count').textContent = helpers.compactNumber(currentWallpaper.likes_count);
      document.getElementById('inspection-card-stats').replaceChildren(stat(LIKE_ICON, 'Likes', currentWallpaper.likes_count), stat(DOWNLOAD_ICON, 'Downloads', currentWallpaper.downloads_count), stat('visibility', 'Views', currentWallpaper.views_count));
      window.dispatchEvent(new CustomEvent('wallverse:wallpaper-updated', { detail: { wallpaper: currentWallpaper } }));
    } catch (error) { liked = previous; renderSocialState(); setMessage(error.message || 'Unable to update this like.'); }
    finally { socialBusy = false; likeButton.disabled = false; }
  }
  async function toggleFavorite() {
    if (!currentUser || socialBusy || !currentWallpaper) return;
    socialBusy = true; favoriteButton.disabled = true; const previous = favorited; favorited = !favorited; renderSocialState();
    try {
      const request = favorited
        ? client.from('favorites').upsert({ user_id: currentUser.id, wallpaper_id: currentWallpaper.id })
        : client.from('favorites').delete().eq('user_id', currentUser.id).eq('wallpaper_id', currentWallpaper.id);
      const { error } = await request; if (error) throw error;
      setMessage(favorited ? 'Saved to Favorites.' : 'Removed from Favorites.');
      window.dispatchEvent(new CustomEvent('wallverse:favorite-updated', { detail: { wallpaperId: currentWallpaper.id, favorited } }));
    } catch (error) { favorited = previous; renderSocialState(); setMessage(error.message || 'Unable to update Favorites.'); }
    finally { socialBusy = false; favoriteButton.disabled = false; }
  }
  async function postComment(event) {
    event.preventDefault(); if (!currentUser || !currentWallpaper) return;
    const bodyField = document.getElementById('inspection-comment-body'); const body = bodyField.value.trim(); if (!body) return;
    const submit = commentForm.querySelector('button'); submit.disabled = true; setMessage();
    try {
      const { error } = await client.from('comments').insert({ wallpaper_id: currentWallpaper.id, user_id: currentUser.id, body });
      if (error) throw error; bodyField.value = ''; await loadComments(currentWallpaper.id); setMessage('Comment posted.');
    } catch (error) { setMessage(error.message || 'Unable to post this comment.'); }
    finally { submit.disabled = false; }
  }

  helpers.enablePublicCardMotion(card);
  window.WallverseInspection = { open: openInspection, close: () => dialog.close(), isOpen: () => dialog.open };
  window.dispatchEvent(new Event('wallverse:inspection-ready'));
  window.addEventListener('wallverse:inspect', (event) => {
    if (!event.detail?.wallpaper) return;
    if (window.WallverseWallpaperRouter?.navigate) window.WallverseWallpaperRouter.navigate(event.detail.wallpaper);
    else openInspection(event.detail.wallpaper);
  });
  window.addEventListener('wallverse:frames-ready', () => {
    // Frames can finish hydrating more than once. Refresh only the border;
    // rebuilding the media here causes a visible mobile image flash.
    if (currentWallpaper && dialog.open) renderInspectionFrame(currentWallpaper);
  });
  likeButton.addEventListener('click', toggleLike); favoriteButton.addEventListener('click', toggleFavorite); commentForm.addEventListener('submit', postComment);
  downloadButton.addEventListener('click', openDownloadGate);
  downloadConfirm.addEventListener('click', confirmDownload);
  downloadDialog.querySelectorAll('[data-close-download-ad]').forEach((button) => button.addEventListener('click', () => downloadDialog.close()));
  downloadDialog.addEventListener('close', clearDownloadCountdown);
  downloadDialog.addEventListener('click', (event) => { if (event.target === downloadDialog) downloadDialog.close(); });
  signInButton.addEventListener('click', () => { dialog.close(); document.getElementById('auth-trigger')?.click(); });
  document.querySelector('[data-close-inspection]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { if (downloadDialog.open) downloadDialog.close(); window.WallverseWallpaperRouter?.onInspectionClosed?.(); });
  client.auth.onAuthStateChange((_event, session) => { currentUser = session?.user || null; renderAuthState(); if (dialog.open) loadSocialState(); });
})();
