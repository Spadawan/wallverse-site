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
  const commentForm = document.getElementById('inspection-comment-form');
  const signInButton = document.getElementById('inspection-sign-in');
  const message = document.getElementById('inspection-message');
  let currentWallpaper = null;
  let currentUser = null;
  let liked = false;
  let favorited = false;
  let socialBusy = false;

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
    const symbol = document.createElement('span'); symbol.className = 'collectible-card__stat-icon'; symbol.setAttribute('aria-hidden', 'true'); symbol.textContent = icon;
    const number = document.createElement('span'); number.textContent = helpers.compactNumber(value);
    item.append(symbol, number); return item;
  }
  function avatar(profile) {
    const node = document.createElement('span'); node.className = 'avatar avatar--violet'; node.textContent = (profile?.username || 'W').charAt(0).toUpperCase();
    if (profile?.avatar_url) {
      const avatarImage = new Image(); avatarImage.className = 'avatar__image'; avatarImage.alt = ''; avatarImage.src = profile.avatar_url;
      avatarImage.onload = () => node.replaceChildren(avatarImage);
    }
    return node;
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
      particle.textContent = index % 3 ? '♥' : '✦'; likeButton.append(particle);
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
    const { error } = await client.rpc('record_wallpaper_view', {
      wallpaper_id_input: wallpaperId,
      session_id_input: currentUser ? null : anonymousViewSession(),
    });
    if (error) console.warn('View could not be recorded.', error.message);
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
  function renderWallpaper(wallpaper) {
    const tier = helpers.publicCardTier(wallpaper);
    const polished = wallpaper.polished_until && new Date(wallpaper.polished_until) > new Date();
    dialog.className = `inspection-dialog tier--${tier}`;
    card.className = `collectible-card inspection-card tier--${tier} is-visible${polished ? ' is-polished' : ''}`;
    image.src = helpers.thumbnailUrl(wallpaper); image.alt = wallpaper.title ? `${wallpaper.title} wallpaper card` : 'Wallverse wallpaper card'; image.draggable = false;
    document.getElementById('inspection-title').textContent = wallpaper.title || 'Untitled';
    document.getElementById('inspection-rarity').textContent = `${tier}${polished ? ' · Polished' : ''}`;
    document.getElementById('inspection-card-stats').replaceChildren(stat('♥', 'Likes', wallpaper.likes_count), stat('⇩', 'Downloads', wallpaper.downloads_count), stat('◉', 'Views', wallpaper.views_count));
    document.getElementById('inspection-like-count').textContent = helpers.compactNumber(wallpaper.likes_count);
    const profile = profileFor(wallpaper.profiles); const owner = document.getElementById('inspection-owner');
    owner.replaceChildren(avatar(profile));
    const ownerCopy = document.createElement('div'); const eyebrow = document.createElement('span'); eyebrow.textContent = 'Creator / owner';
    const ownerName = document.createElement('strong'); ownerName.textContent = profile?.username ? `@${profile.username}` : 'Unknown creator'; ownerCopy.append(eyebrow, ownerName); owner.append(ownerCopy);
    const description = document.getElementById('inspection-description'); description.textContent = wallpaper.description || ''; description.hidden = !wallpaper.description;
    const tags = helpers.tagsFor(wallpaper); const tagsNode = document.getElementById('inspection-tags');
    tagsNode.replaceChildren(...tags.map((tag) => { const node = document.createElement('span'); node.textContent = tag; return node; }));
    const facts = [
      ['Rarity', tier], ['Quality', helpers.qualityLabel(wallpaper.quality) || wallpaper.quality || '—'],
      ['Dimensions', wallpaper.width && wallpaper.height ? `${wallpaper.width} × ${wallpaper.height}` : '—'],
      ['File size', formatBytes(wallpaper.file_size) || '—'], ['Published', formatDate(wallpaper.created_at) || '—'],
    ];
    document.getElementById('inspection-facts').replaceChildren(...facts.map(([label, value]) => { const group = document.createElement('div'); const term = document.createElement('dt'); const detail = document.createElement('dd'); term.textContent = label; detail.textContent = value; group.append(term, detail); return group; }));
    liked = false; favorited = false; renderAuthState(); setMessage();
  }
  async function loadComments(wallpaperId) {
    const list = document.getElementById('inspection-comment-list'); list.replaceChildren();
    const loading = document.createElement('p'); loading.textContent = 'Loading comments…'; list.append(loading);
    const { data, error } = await client.from('comments')
      .select('id,user_id,parent_id,body,is_deleted,likes_count,created_at,profiles!comments_user_id_fkey(username,avatar_url,role)')
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
    await Promise.allSettled([recordView(wallpaper.id), loadSocialState(), loadComments(wallpaper.id)]);
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
      document.getElementById('inspection-card-stats').replaceChildren(stat('♥', 'Likes', currentWallpaper.likes_count), stat('⇩', 'Downloads', currentWallpaper.downloads_count), stat('◉', 'Views', currentWallpaper.views_count));
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
  window.addEventListener('wallverse:inspect', (event) => { if (event.detail?.wallpaper) openInspection(event.detail.wallpaper); });
  likeButton.addEventListener('click', toggleLike); favoriteButton.addEventListener('click', toggleFavorite); commentForm.addEventListener('submit', postComment);
  signInButton.addEventListener('click', () => { dialog.close(); document.getElementById('auth-trigger')?.click(); });
  document.querySelector('[data-close-inspection]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  client.auth.onAuthStateChange((_event, session) => { currentUser = session?.user || null; renderAuthState(); if (dialog.open) loadSocialState(); });
})();
