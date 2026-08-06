const WALLVERSE_PUBLIC_CONFIG = {
  supabaseUrl: 'https://qhhwtcdnsdugduwybttd.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoaHd0Y2Ruc2R1Z2R1d3lidHRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDY2NjQsImV4cCI6MjA5NjAyMjY2NH0.bb0eMzS4y_yUcklr98oblFLOrBwBaz53a7sW-e8zCzM',
  r2PublicBaseUrl: 'https://images.wallverse.win',
};

const SELECT = 'id,title,thumbnail_url,category,quality,is_weekly,is_featured,storage_provider,thumbnail_storage_key,profiles!wallpapers_user_id_fkey(username,avatar_url),wallpaper_tags(tags(name))';
const SPOTLIGHT_SELECT = 'id,title,image_url,thumbnail_url,category,quality,is_weekly,is_featured,storage_provider,thumbnail_storage_key,hd_storage_key,profiles!wallpapers_user_id_fkey(username,avatar_url),wallpaper_tags(tags(name))';
const FEATURED_SELECT = `${SELECT},user_id,likes_count,downloads_count,views_count`;
const CREATOR_STATS_SELECT = 'id,quality,likes_count,downloads_count,views_count,is_featured,is_weekly';
const PAGE_SIZE = 12;
const SYSTEM_TAGS = new Set(['ai-generated', 'ai', 'suggestive']);
const apiHeaders = {
  apikey: WALLVERSE_PUBLIC_CONFIG.supabaseAnonKey,
  Authorization: `Bearer ${WALLVERSE_PUBLIC_CONFIG.supabaseAnonKey}`,
};

window.WALLVERSE_PUBLIC_CONFIG = WALLVERSE_PUBLIC_CONFIG;

const grid = document.getElementById('wallpaper-grid');
const status = document.getElementById('feed-status');
const loadMore = document.getElementById('load-more');
const spotlightCard = document.getElementById('spotlight-card');
let offset = 0;
let cardIndex = 0;
let idleObserver;

function registerIdleCard(card) {
  if (!('IntersectionObserver' in window)) return;
  if (!idleObserver) {
    idleObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle('is-idle', entry.isIntersecting));
    }, { rootMargin: '80px 0px', threshold: 0.15 });
  }
  idleObserver.observe(card);
}

function r2Url(key) {
  const normalized = String(key || '').replace(/^\/+/, '');
  if (!normalized) return '';
  return `${WALLVERSE_PUBLIC_CONFIG.r2PublicBaseUrl.replace(/\/+$/, '')}/${normalized.split('/').map(encodeURIComponent).join('/')}`;
}

function thumbnailUrl(wallpaper) {
  if (!wallpaper) return '';
  const key = wallpaper.thumbnail_storage_key;
  const legacy = wallpaper.thumbnail_url;
  return wallpaper.storage_provider === 'cloudflare_r2' && key ? r2Url(key) : (legacy || '');
}

function spotlightUrl(wallpaper) {
  if (!wallpaper) return '';
  if (wallpaper.storage_provider === 'cloudflare_r2' && wallpaper.hd_storage_key) return r2Url(wallpaper.hd_storage_key);
  return wallpaper.image_url || thumbnailUrl(wallpaper);
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

function compactNumber(value) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function wallpaperScore(wallpaper) {
  const quality = String(wallpaper?.quality || '').toLowerCase();
  const qualityScore = quality === 'premium' ? 180 : quality === 'high' ? 90 : quality === 'standard' ? 30 : 0;
  return (Number(wallpaper?.likes_count) || 0) * 4
    + (Number(wallpaper?.downloads_count) || 0) * 3
    + (Number(wallpaper?.views_count) || 0)
    + qualityScore
    + (wallpaper?.is_featured ? 220 : 0)
    + (wallpaper?.is_weekly ? 380 : 0);
}

function collectionPower(wallpapers) {
  return wallpapers.reduce((total, wallpaper) => {
    const score = wallpaperScore(wallpaper);
    const tierBonus = score >= 5000 ? 620 : score >= 2600 ? 360 : score >= 1300 ? 190 : score >= 450 ? 90 : score >= 120 ? 55 : 25;
    return total + score + tierBonus;
  }, 0);
}

async function fetchPublic(table, filters) {
  const query = new URLSearchParams(filters);
  const response = await fetch(`${WALLVERSE_PUBLIC_CONFIG.supabaseUrl}/rest/v1/${table}?${query}`, { headers: apiHeaders });
  if (!response.ok) throw new Error(`Public feed request failed (${response.status})`);
  return response.json();
}

function fetchWallpapers(filters) {
  return fetchPublic('wallpapers', { select: SELECT, ...filters });
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
  card.style.setProperty('--idle-delay', `${(cardIndex++ % 9) * -1.1}s`);
  const imageWrap = document.createElement('div');
  imageWrap.className = 'wallpaper-image';
  const src = thumbnailUrl(wallpaper);
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
  registerIdleCard(card);
  return card;
}

function renderSpotlight(wallpaper, weekly) {
  if (!wallpaper) { spotlightCard.hidden = true; return; }
  const image = document.getElementById('spotlight-image');
  const src = weekly ? spotlightUrl(wallpaper) : thumbnailUrl(wallpaper);
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
  const weekly = await fetchWallpapers({ ...base, select: SPOTLIGHT_SELECT, is_weekly: 'eq.true' });
  if (weekly[0]) return renderSpotlight(weekly[0], true);
  const featured = await fetchWallpapers({ ...base, select: SPOTLIGHT_SELECT, is_featured: 'eq.true' });
  renderSpotlight(featured[0], false);
}

function renderFeatured(wallpapers) {
  const cards = [...document.querySelectorAll('.featured-card')];
  cards.forEach((card, index) => {
    const wallpaper = wallpapers[index];
    const image = card.querySelector('img');
    const label = card.querySelector('.highlight-label');
    const title = card.querySelector('h2');
    if (!wallpaper) { card.hidden = true; return; }
    image.src = thumbnailUrl(wallpaper);
    image.alt = wallpaper.title ? `${wallpaper.title} wallpaper` : 'Featured Wallverse wallpaper';
    image.onerror = () => { card.hidden = true; };
    label.textContent = 'Featured wallpaper';
    title.textContent = wallpaper.title || 'Untitled wallpaper';
    card.hidden = false;
  });
  document.getElementById('featured-grid').setAttribute('aria-busy', 'false');
}

async function loadFeatured() {
  const base = { status: 'eq.approved', is_suggestive: 'eq.false', order: 'created_at.desc', limit: '5', select: FEATURED_SELECT };
  const featured = await fetchWallpapers({ ...base, is_featured: 'eq.true' });
  const unique = [...featured];
  if (unique.length < 2) {
    const popular = await fetchWallpapers({ ...base, order: 'downloads_count.desc,likes_count.desc,created_at.desc' });
    for (const wallpaper of popular) {
      if (!unique.some((item) => item.id === wallpaper.id)) unique.push(wallpaper);
    }
  }
  if (!unique.length) { document.getElementById('featured-grid').hidden = true; return; }
  let visibleIndex = 0;
  const display = () => {
    renderFeatured([unique[visibleIndex], unique[(visibleIndex + 1) % unique.length]]);
    visibleIndex = (visibleIndex + 2) % unique.length;
  };
  display();
  if (unique.length > 2) window.setInterval(display, 6500);
}

function renderCreatorStats(wallpapers) {
  const stats = document.getElementById('creator-spotlight-stats');
  const totals = wallpapers.reduce((summary, wallpaper) => ({
    likes: summary.likes + (Number(wallpaper.likes_count) || 0),
    downloads: summary.downloads + (Number(wallpaper.downloads_count) || 0),
    views: summary.views + (Number(wallpaper.views_count) || 0),
  }), { likes: 0, downloads: 0, views: 0 });
  const values = [
    ['Uploads', wallpapers.length],
    ['Likes', totals.likes],
    ['Downloads', totals.downloads],
    ['Views', totals.views],
    ['Collection power', collectionPower(wallpapers)],
  ];
  stats.replaceChildren(...values.map(([label, value]) => {
    const item = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = compactNumber(value);
    item.append(term, description);
    return item;
  }));
}

function renderCreatorSpotlight(profile, bannerUrl, wallpapers) {
  const card = document.getElementById('creator-spotlight');
  if (!profile?.username) { card.hidden = true; return; }
  const banner = card.querySelector('.creator-spotlight__banner');
  if (bannerUrl) {
    banner.src = bannerUrl;
    banner.alt = `${profile.username}'s creator spotlight`;
    banner.onerror = () => { banner.remove(); };
  } else {
    banner.remove();
  }
  const creator = document.getElementById('creator-spotlight-profile');
  const creatorContent = creatorNode(profile);
  creator.replaceChildren(...creatorContent.childNodes);
  renderCreatorStats(wallpapers);
  card.setAttribute('aria-busy', 'false');
}

async function loadCreatorSpotlight() {
  const profiles = await fetchPublic('profiles', {
    select: 'id,username,role,avatar_url',
    is_spotlighted: 'eq.true',
    limit: '1',
  });
  const profile = profiles[0];
  if (!profile) { document.getElementById('creator-spotlight').hidden = true; return; }
  const creatorWallpapers = await fetchPublic('wallpapers', {
    select: CREATOR_STATS_SELECT,
    status: 'eq.approved',
    is_suggestive: 'eq.false',
    user_id: `eq.${profile.id}`,
    order: 'created_at.desc',
    limit: '1000',
  });
  const bannerWallpapers = await fetchWallpapers({ status: 'eq.approved', is_suggestive: 'eq.false', user_id: `eq.${profile.id}`, order: 'created_at.desc', limit: '1' });
  const bannerUrl = thumbnailUrl(bannerWallpapers[0]);
  renderCreatorSpotlight(profile, bannerUrl, creatorWallpapers);
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
    await Promise.all([loadSpotlight(), loadFeatured(), loadCreatorSpotlight(), loadPage()]);
  } catch (error) {
    console.error(error);
    grid.setAttribute('aria-busy', 'false');
    status.textContent = 'Wallpapers are unavailable right now. Please try again shortly.';
    spotlightCard.hidden = true;
  }
}

if (grid && loadMore && spotlightCard) {
  loadMore.addEventListener('click', () => { loadPage().catch((error) => { console.error(error); loadMore.disabled = false; loadMore.textContent = 'Try again'; }); });
  initialize();
}
