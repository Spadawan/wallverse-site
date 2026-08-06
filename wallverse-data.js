const WALLVERSE_PUBLIC_CONFIG = {
  supabaseUrl: 'https://qhhwtcdnsdugduwybttd.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoaHd0Y2Ruc2R1Z2R1d3lidHRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDY2NjQsImV4cCI6MjA5NjAyMjY2NH0.bb0eMzS4y_yUcklr98oblFLOrBwBaz53a7sW-e8zCzM',
  r2PublicBaseUrl: 'https://images.wallverse.win',
};

const SELECT = 'id,title,image_url,thumbnail_url,category,quality,is_weekly,is_featured,storage_provider,thumbnail_storage_key,hd_storage_key,profiles!wallpapers_user_id_fkey(username,avatar_url),wallpaper_tags(tags(name))';
const PAGE_SIZE = 12;
const SYSTEM_TAGS = new Set(['ai-generated', 'ai', 'suggestive']);
const apiHeaders = {
  apikey: WALLVERSE_PUBLIC_CONFIG.supabaseAnonKey,
  Authorization: `Bearer ${WALLVERSE_PUBLIC_CONFIG.supabaseAnonKey}`,
};

const grid = document.getElementById('wallpaper-grid');
const status = document.getElementById('feed-status');
const loadMore = document.getElementById('load-more');
const spotlightCard = document.getElementById('spotlight-card');
let offset = 0;

function r2Url(key) {
  const normalized = String(key || '').replace(/^\/+/, '');
  if (!normalized) return '';
  return `${WALLVERSE_PUBLIC_CONFIG.r2PublicBaseUrl.replace(/\/+$/, '')}/${normalized.split('/').map(encodeURIComponent).join('/')}`;
}

function imageUrl(wallpaper, thumbnail = true) {
  const key = thumbnail ? wallpaper.thumbnail_storage_key : wallpaper.hd_storage_key;
  const legacy = thumbnail ? wallpaper.thumbnail_url : wallpaper.image_url;
  return wallpaper.storage_provider === 'cloudflare_r2' && key ? r2Url(key) : (legacy || '');
}

function tagsFor(wallpaper) {
  return (wallpaper.wallpaper_tags || [])
    .map((entry) => entry?.tags?.name)
    .filter((tag) => tag && !SYSTEM_TAGS.has(tag.toLowerCase()));
}

function qualityLabel(quality) {
  const value = String(quality || '').toLowerCase();
  if (value === 'premium' || value === 'hd' || value === '4k') return 'HD';
  if (value === 'standard' || value === 'sd') return 'SD';
  return '';
}

async function fetchWallpapers(filters) {
  const query = new URLSearchParams({ select: SELECT, ...filters });
  const response = await fetch(`${WALLVERSE_PUBLIC_CONFIG.supabaseUrl}/rest/v1/wallpapers?${query}`, { headers: apiHeaders });
  if (!response.ok) throw new Error(`Public feed request failed (${response.status})`);
  return response.json();
}

function creatorNode(profile) {
  const username = profile?.username;
  if (!username) return null;
  const creator = document.createElement('div');
  creator.className = 'creator';
  const avatar = document.createElement('span');
  avatar.className = 'avatar avatar--violet';
  avatar.textContent = username.charAt(0).toUpperCase();
  if (profile.avatar_url) {
    const image = new Image();
    image.className = 'avatar__image';
    image.src = profile.avatar_url;
    image.alt = '';
    image.onload = () => { avatar.textContent = ''; avatar.append(image); };
  }
  const name = document.createElement('strong');
  name.textContent = `@${username}`;
  creator.append(avatar, name);
  return creator;
}

function renderCard(wallpaper) {
  const card = document.createElement('article');
  card.className = 'wallpaper-card';
  const imageWrap = document.createElement('div');
  imageWrap.className = 'wallpaper-image';
  const src = imageUrl(wallpaper, true);
  if (src) {
    const image = new Image();
    image.src = src;
    image.alt = wallpaper.title ? `${wallpaper.title} wallpaper` : 'Wallverse wallpaper';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.onerror = () => { imageWrap.classList.add('wallpaper-image--unavailable'); image.remove(); };
    imageWrap.append(image);
  } else {
    imageWrap.classList.add('wallpaper-image--unavailable');
  }
  const quality = qualityLabel(wallpaper.quality);
  if (quality) { const badge = document.createElement('span'); badge.className = 'pill'; badge.textContent = quality; imageWrap.append(badge); }
  const actions = document.createElement('div');
  actions.className = 'card-actions';
  for (const label of ['Favorite icon (not interactive)', 'More options (not interactive)']) {
    const button = document.createElement('button');
    button.className = 'icon-button'; button.type = 'button'; button.setAttribute('aria-label', label); button.textContent = label.startsWith('Favorite') ? '♡' : '•••'; actions.append(button);
  }
  imageWrap.append(actions);
  const info = document.createElement('div');
  info.className = 'wallpaper-info';
  if (wallpaper.title) { const title = document.createElement('h3'); title.textContent = wallpaper.title; info.append(title); }
  const creator = creatorNode(wallpaper.profiles);
  if (creator) info.append(creator);
  const tag = tagsFor(wallpaper)[0] || wallpaper.category;
  if (tag) { const badge = document.createElement('span'); badge.className = 'tag'; badge.textContent = tag; info.append(badge); }
  card.append(imageWrap, info);
  return card;
}

function renderSpotlight(wallpaper, weekly) {
  if (!wallpaper) { spotlightCard.hidden = true; return; }
  const image = document.getElementById('spotlight-image');
  const src = imageUrl(wallpaper, false) || imageUrl(wallpaper, true);
  image.src = src; image.alt = wallpaper.title ? `${wallpaper.title} wallpaper` : 'Wallverse wallpaper';
  image.onerror = () => { spotlightCard.hidden = true; };
  document.getElementById('spotlight-badge').textContent = weekly ? 'Weekly' : 'Featured';
  document.getElementById('spotlight-label').textContent = weekly ? 'Wallpaper of the week' : 'Featured wallpaper';
  document.getElementById('spotlight-name').textContent = wallpaper.title || '';
  const creator = document.getElementById('spotlight-creator');
  const creatorContent = creatorNode(wallpaper.profiles);
  creator.replaceChildren();
  if (creatorContent) { creator.append(...creatorContent.childNodes); creator.hidden = false; }
  spotlightCard.setAttribute('aria-busy', 'false');
}

async function loadSpotlight() {
  const base = { status: 'eq.approved', is_suggestive: 'eq.false', order: 'created_at.desc', limit: '1' };
  const weekly = await fetchWallpapers({ ...base, is_weekly: 'eq.true' });
  if (weekly[0]) return renderSpotlight(weekly[0], true);
  const featured = await fetchWallpapers({ ...base, is_featured: 'eq.true' });
  renderSpotlight(featured[0], false);
}

async function loadPage() {
  loadMore.disabled = true;
  loadMore.textContent = 'Loading…';
  const rows = await fetchWallpapers({ status: 'eq.approved', is_suggestive: 'eq.false', order: 'created_at.desc', limit: String(PAGE_SIZE), offset: String(offset) });
  rows.forEach((wallpaper) => grid.append(renderCard(wallpaper)));
  offset += rows.length;
  grid.setAttribute('aria-busy', 'false');
  status.hidden = rows.length > 0;
  loadMore.hidden = rows.length < PAGE_SIZE;
  loadMore.disabled = false;
  loadMore.textContent = 'Load more';
}

async function initialize() {
  try {
    await Promise.all([loadSpotlight(), loadPage()]);
  } catch (error) {
    console.error(error);
    grid.setAttribute('aria-busy', 'false');
    status.textContent = 'Wallpapers are unavailable right now. Please try again shortly.';
    spotlightCard.hidden = true;
  }
}

loadMore.addEventListener('click', () => { loadPage().catch((error) => { console.error(error); loadMore.disabled = false; loadMore.textContent = 'Try again'; }); });
initialize();
