const WALLVERSE_PUBLIC_CONFIG = {
  supabaseUrl: 'https://qhhwtcdnsdugduwybttd.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoaHd0Y2Ruc2R1Z2R1d3lidHRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDY2NjQsImV4cCI6MjA5NjAyMjY2NH0.bb0eMzS4y_yUcklr98oblFLOrBwBaz53a7sW-e8zCzM',
  r2PublicBaseUrl: 'https://images.wallverse.win',
};

const CARD_RELATION = 'user_cards(id,owner_id,card_frame_id,card_frame_type,archived,acquired_at)';
const SELECT = `id,user_id,title,description,image_url,thumbnail_url,category,quality,width,height,file_size,likes_count,downloads_count,views_count,is_ai,is_suggestive,is_weekly,is_featured,polished_until,created_at,storage_provider,thumbnail_storage_key,hd_storage_key,profiles!wallpapers_user_id_fkey(username,avatar_url,avatar_frame_type),wallpaper_tags(tags(name)),${CARD_RELATION}`;
const SPOTLIGHT_SELECT = `id,title,image_url,thumbnail_url,category,quality,is_weekly,is_featured,storage_provider,thumbnail_storage_key,hd_storage_key,profiles!wallpapers_user_id_fkey(username,avatar_url,avatar_frame_type),wallpaper_tags(tags(name)),${CARD_RELATION}`;
const FEATURED_SELECT = SELECT;
const CREATOR_STATS_SELECT = 'id,quality,likes_count,downloads_count,views_count,is_featured,is_weekly';
const PAGE_SIZE = 12;
const FEED_CATALOG_PAGE_SIZE = 1000;
const AD_CARD_INTERVAL = 12;
const ADSENSE_CLIENT = 'ca-pub-6482601365294880';
const ADSENSE_SLOT = '5502068644';
const PUBLIC_CATALOG_CACHE_TTL = 10 * 60 * 1000;
const PUBLIC_CATALOG_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const PUBLIC_CATALOG_CACHE_KEY = 'wallverse:public-catalog:v2:safe';
const SYSTEM_TAGS = new Set(['ai-generated', 'ai', 'suggestive']);
const apiHeaders = {
  apikey: WALLVERSE_PUBLIC_CONFIG.supabaseAnonKey,
  Authorization: `Bearer ${WALLVERSE_PUBLIC_CONFIG.supabaseAnonKey}`,
};

window.WALLVERSE_PUBLIC_CONFIG = WALLVERSE_PUBLIC_CONFIG;
if (!window.WallverseSupabase && window.supabase?.createClient) {
  window.WallverseSupabase = window.supabase.createClient(WALLVERSE_PUBLIC_CONFIG.supabaseUrl, WALLVERSE_PUBLIC_CONFIG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
}

const grid = document.getElementById('wallpaper-grid');
const status = document.getElementById('feed-status');
const loadMore = document.getElementById('load-more');
const spotlightCard = document.getElementById('spotlight-card');
let cardIndex = 0;
let idleObserver;
let loadedWallpapers = [];
let feedSort = 'popular';
let visibleFeedCount = PAGE_SIZE;
let feedRequestRevision = 0;
let feedShowSuggestive = false;
let feedUser = null;
let feedClient = null;
let feedAccessToken = null;
let feedReady = false;
let creatorSpotlightProfile = null;
let feedAlgorithmProfile = null;
let feedAlgorithmLoading = null;
const publicRequests = new Map();

function registerIdleCard(card) {
  if (!('IntersectionObserver' in window)) return;
  if (!idleObserver) {
    idleObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { entry.target.classList.toggle('is-idle', entry.isIntersecting); entry.target.classList.toggle('is-visible', entry.isIntersecting); });
    }, { rootMargin: '80px 0px', threshold: 0.15 });
  }
  idleObserver.observe(card);
}

function enablePublicCardMotion(card) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(pointer: coarse)').matches) return;
  card.addEventListener('pointermove', (event) => {
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    card.style.setProperty('--card-rx', `${(0.5 - y) * 8}deg`);
    card.style.setProperty('--card-ry', `${(x - 0.5) * 10}deg`);
    card.style.setProperty('--light-x', `${x * 100}%`);
    card.style.setProperty('--light-y', `${y * 100}%`);
  });
  card.addEventListener('pointerleave', () => {
    card.style.setProperty('--card-rx', '0deg'); card.style.setProperty('--card-ry', '0deg');
    card.style.setProperty('--light-x', '28%'); card.style.setProperty('--light-y', '18%');
  });
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

function downloadUrl(wallpaper) {
  if (!wallpaper) return '';
  if (wallpaper.storage_provider === 'cloudflare_r2' && wallpaper.hd_storage_key) return r2Url(wallpaper.hd_storage_key);
  return wallpaper.image_url || '';
}

function wallpaperSlug(title) {
  return String(title || 'wallpaper').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'wallpaper';
}
function wallpaperPath(wallpaper) {
  const shortId = String(wallpaper?.id || '').replace(/-/g, '').slice(0, 8);
  return shortId ? `/wallpaper/${wallpaperSlug(wallpaper.title)}-${shortId}` : '/';
}

function tagsFor(wallpaper) {
  return (wallpaper.wallpaper_tags || [])
    .map((entry) => entry?.tags?.name)
    .filter((tag) => tag && !SYSTEM_TAGS.has(tag.toLowerCase()));
}

function qualityLabel(quality) {
  const value = String(quality || '').toLowerCase();
  if (value === 'premium' || value === 'high' || value === 'hd' || value === '4k') return 'HD';
  if (value === 'standard' || value === 'sd') return 'SD';
  return '';
}

function compactNumber(value) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function publicCardScore(wallpaper) {
  const quality = String(wallpaper.quality || '').toLowerCase();
  const qualityScore = quality === 'premium' ? 180 : quality === 'high' ? 90 : quality === 'standard' ? 30 : 0;
  return (Number(wallpaper.likes_count) || 0) * 4 + (Number(wallpaper.downloads_count) || 0) * 3 + (Number(wallpaper.views_count) || 0) + qualityScore + (wallpaper.is_featured ? 220 : 0) + (wallpaper.is_weekly ? 380 : 0);
}

function publicCardTier(wallpaper) {
  const score = publicCardScore(wallpaper);
  if (score >= 5000) return 'mythic';
  if (score >= 2600) return 'legendary';
  if (score >= 1300) return 'epic';
  if (score >= 450) return 'rare';
  if (score >= 120) return 'uncommon';
  return 'common';
}

async function fetchPublic(table, filters) {
  const query = new URLSearchParams(filters);
  const url = `${WALLVERSE_PUBLIC_CONFIG.supabaseUrl}/rest/v1/${table}?${query}`;
  if (publicRequests.has(url)) return publicRequests.get(url);
  const headers = feedAccessToken ? { ...apiHeaders, Authorization: `Bearer ${feedAccessToken}` } : apiHeaders;
  const request = fetch(url, { headers })
    .then((response) => {
      if (!response.ok) throw new Error(`Public feed request failed (${response.status})`);
      return response.json();
    })
    .finally(() => publicRequests.delete(url));
  publicRequests.set(url, request);
  return request;
}

function fetchWallpapers(filters) {
  return fetchPublic('wallpapers', { select: SELECT, ...filters });
}

function creatorNode(profile, rarity = 'common', { framed = false } = {}) {
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
    image.onload = () => { avatar.replaceChildren(image); if (framed) window.WallverseCardFrames?.applyAvatar?.(avatar, profile.avatar_frame_type, rarity); };
  }
  if (framed) window.WallverseCardFrames?.applyAvatar?.(avatar, profile.avatar_frame_type, rarity);
  const name = document.createElement('strong');
  name.textContent = `@${username}`;
  creator.append(avatar, name);
  return creator;
}

function cardRecordFor(wallpaper) {
  const records = Array.isArray(wallpaper?.user_cards) ? wallpaper.user_cards : (wallpaper?.user_cards ? [wallpaper.user_cards] : []);
  const active = records.filter((record) => !record?.archived);
  return active.find((record) => feedUser && record?.owner_id === feedUser.id) || active[0] || null;
}

function cardFrameFor(wallpaper) {
  const record = cardRecordFor(wallpaper);
  return window.WallverseCardFrames?.normalize(record, wallpaper?.web_card_frame_type, wallpaper?.card_frame_type, wallpaper?.card_frame_id) || 'default';
}

function decorateCardFrame(wallpaper) {
  if (wallpaper) wallpaper.web_card_frame_type = cardFrameFor(wallpaper);
  return wallpaper;
}

function renderCard(wallpaper) {
  const card = document.createElement('a');
  const tier = publicCardTier(wallpaper);
  const polished = wallpaper.polished_until && new Date(wallpaper.polished_until) > new Date();
  card.className = `collectible-card collectible-card--public tier--${tier}${polished ? ' is-polished' : ''}`;
  card.href = wallpaperPath(wallpaper);
  card.setAttribute('aria-label', `Open ${wallpaper.title || 'Untitled card'}, ${tier} rarity${polished ? ', polished' : ''}`);
  card.style.setProperty('--idle-delay', `${(cardIndex++ % 9) * -1.1}s`);
  const imageWrap = document.createElement('div');
  imageWrap.className = 'collectible-card__media';
  const src = thumbnailUrl(wallpaper);
  if (src) {
    const image = new Image();
    image.className = 'collectible-card__image';
    image.src = src;
    image.alt = wallpaper.title ? `${wallpaper.title} wallpaper` : 'Wallverse wallpaper';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.draggable = false;
    image.onerror = () => { imageWrap.classList.add('collectible-card__media--unavailable'); image.remove(); };
    imageWrap.append(image);
  } else {
    imageWrap.classList.add('collectible-card__media--unavailable');
  }
  const surface = document.createElement('div');
  surface.className = 'collectible-card__surface';
  const shine = document.createElement('div');
  shine.className = 'collectible-card__shine';
  shine.setAttribute('aria-hidden', 'true');
  const badges = document.createElement('div');
  badges.className = 'collectible-card__badges';
  const quality = qualityLabel(wallpaper.quality);
  if (quality) { const badge = document.createElement('span'); badge.className = 'pill'; badge.textContent = quality; badges.append(badge); }
  const info = document.createElement('div');
  info.className = 'collectible-card__info';
  const title = document.createElement('h3'); title.textContent = wallpaper.title || 'Untitled'; info.append(title);
  const creator = creatorNode(wallpaper.profiles);
  if (creator) { creator.classList.add('collectible-card__creator'); info.append(creator); }
  const stats = document.createElement('div');
  stats.className = 'collectible-card__stats';
  for (const [icon, label, value] of [['\u2665', 'Likes', wallpaper.likes_count], ['\u21a7', 'Downloads', wallpaper.downloads_count], ['visibility', 'Views', wallpaper.views_count]]) {
    const stat = document.createElement('span'); stat.className = `collectible-card__stat collectible-card__stat--${label.toLowerCase()}`;
    stat.setAttribute('aria-label', `${label}: ${Number(value) || 0}`);
    const symbol = document.createElement('span'); symbol.className = `collectible-card__stat-icon${label === 'Views' ? ' material-symbols-rounded' : ''}`; symbol.setAttribute('aria-hidden', 'true'); symbol.textContent = icon;
    const amount = document.createElement('span'); amount.textContent = compactNumber(value);
    stat.append(symbol, amount); stats.append(stat);
  }
  info.append(stats);
  imageWrap.append(surface, shine, badges, info);
  card.append(imageWrap);
  window.WallverseCardFrames?.apply(card, wallpaper.web_card_frame_type || cardFrameFor(wallpaper));
  const inspect = () => window.dispatchEvent(new CustomEvent('wallverse:inspect', { detail: { wallpaper } }));
  card.addEventListener('click', (event) => { event.preventDefault(); inspect(); });
  registerIdleCard(card);
  enablePublicCardMotion(card);
  return card;
}

function collapseAdCard(card) {
  if (!card || card.dataset.collapsed === 'true') return;
  card.dataset.collapsed = 'true';
  card.remove();
}

function initializeAdCard(card, slot) {
  const hideIfUnfilled = () => {
    if (slot.dataset.adStatus === 'unfilled') {
      observer.disconnect();
      collapseAdCard(card);
    }
  };
  const observer = new MutationObserver(hideIfUnfilled);
  observer.observe(slot, { attributes: true, attributeFilter: ['data-ad-status'] });
  hideIfUnfilled();

  requestAnimationFrame(() => {
    if (!card.isConnected || card.dataset.collapsed === 'true') return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // A failed third-party ad request must never leave an empty wallpaper slot.
      collapseAdCard(card);
    }
  });
}

function renderAdCard(variant = 'grid') {
  const card = document.createElement('aside');
  card.className = `ad-card${variant === 'wide' ? ' ad-card--wide' : ''}`;
  card.setAttribute('aria-label', 'Sponsored advertisement');

  const label = document.createElement('span');
  label.className = 'ad-card__label';
  label.textContent = 'Sponsored';

  const slot = document.createElement('ins');
  slot.className = 'adsbygoogle';
  slot.setAttribute('style', 'display:block');
  slot.dataset.adClient = ADSENSE_CLIENT;
  slot.dataset.adSlot = ADSENSE_SLOT;
  slot.dataset.adFormat = 'auto';
  slot.dataset.fullWidthResponsive = 'true';

  card.append(label, slot);
  initializeAdCard(card, slot);
  return card;
}

const feedTierRank = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
function updateFeedSortControls() {
  const popular = document.getElementById('feed-sort-popular'); const recent = document.getElementById('feed-sort-recent'); const algorithm = document.getElementById('feed-sort-algorithm');
  popular.classList.toggle('is-active', feedSort === 'popular'); popular.setAttribute('aria-pressed', String(feedSort === 'popular'));
  recent.classList.toggle('is-active', feedSort === 'recent'); recent.setAttribute('aria-pressed', String(feedSort === 'recent'));
  if (algorithm) {
    algorithm.hidden = !feedUser;
    algorithm.classList.toggle('is-active', feedSort === 'algorithm');
    algorithm.setAttribute('aria-pressed', String(feedSort === 'algorithm'));
    algorithm.title = feedAlgorithmProfile?.signalCount >= 2 ? 'Ranked from your Wallverse activity' : 'Like, save or download wallpapers to personalize this feed.';
  }
}

async function fetchFeedSignalIds(table, userId, { timestampColumn = 'created_at', limit = 60, direction } = {}) {
  try {
    let request = feedClient.from(table).select('wallpaper_id').eq('user_id', userId).order(timestampColumn, { ascending: false }).limit(limit);
    if (direction) request = request.eq('direction', direction);
    const { data, error } = await request;
    if (error) throw error;
    return new Set((data || []).map((row) => String(row.wallpaper_id || '')).filter(Boolean));
  } catch (error) {
    console.warn(`For you signal unavailable: ${table}.`, error);
    return new Set();
  }
}

async function fetchFollowedCreatorIds(userId) {
  try {
    const { data, error } = await feedClient.from('follows').select('followed_id').eq('follower_id', userId).order('created_at', { ascending: false }).limit(80);
    if (error) throw error;
    return new Set((data || []).map((row) => String(row.followed_id || '')).filter(Boolean));
  } catch (error) {
    console.warn('For you follows unavailable.', error);
    return new Set();
  }
}

async function loadFeedAlgorithmProfile() {
  if (!feedUser || !feedClient) { feedAlgorithmProfile = null; updateFeedSortControls(); return null; }
  const userId = feedUser.id;
  const [likedIds, favoriteIds, downloadedIds, viewedIds, passedIds, followedCreatorIds] = await Promise.all([
    fetchFeedSignalIds('likes', userId),
    fetchFeedSignalIds('favorites', userId),
    fetchFeedSignalIds('downloads', userId),
    fetchFeedSignalIds('wallpaper_views', userId, { timestampColumn: 'viewed_at', limit: 80 }),
    fetchFeedSignalIds('user_discovery_swipes', userId, { timestampColumn: 'updated_at', limit: 120, direction: 'pass' }),
    fetchFollowedCreatorIds(userId),
  ]);
  if (feedUser?.id !== userId) return null;
  const tagWeights = new Map(); const categoryWeights = new Map();
  const byId = new Map(loadedWallpapers.map((wallpaper) => [wallpaper.id, wallpaper]));
  const addAffinity = (wallpaperId, tagWeight, categoryWeight) => {
    const wallpaper = byId.get(wallpaperId); if (!wallpaper) return;
    const category = String(wallpaper.category || '');
    if (category) categoryWeights.set(category, (categoryWeights.get(category) || 0) + categoryWeight);
    tagsFor(wallpaper).forEach((tag) => tagWeights.set(tag, (tagWeights.get(tag) || 0) + tagWeight));
  };
  favoriteIds.forEach((id) => addAffinity(id, 10, 7));
  likedIds.forEach((id) => addAffinity(id, 8, 5));
  downloadedIds.forEach((id) => addAffinity(id, 7, 5));
  viewedIds.forEach((id) => addAffinity(id, 1, 0.6));
  passedIds.forEach((id) => addAffinity(id, -1.5, -1));
  const interactedWallpaperIds = new Set([...likedIds, ...favoriteIds, ...downloadedIds, ...viewedIds, ...passedIds]);
  feedAlgorithmProfile = {
    tagWeights, categoryWeights, followedCreatorIds, interactedWallpaperIds,
    signalCount: likedIds.size + favoriteIds.size + downloadedIds.size + viewedIds.size + passedIds.size + followedCreatorIds.size,
  };
  updateFeedSortControls();
  return feedAlgorithmProfile;
}

function feedFreshnessScore(createdAt) {
  const ageDays = Math.floor((Date.now() - new Date(createdAt || 0).getTime()) / 86400000);
  if (!Number.isFinite(ageDays)) return 0;
  return ageDays <= 0 ? 8 : Math.max(0, 8 - ageDays * 0.25);
}

function feedAlgorithmScore(wallpaper, profile) {
  let score = 0;
  tagsFor(wallpaper).forEach((tag) => { score += profile.tagWeights.get(tag) || 0; });
  score += profile.categoryWeights.get(String(wallpaper.category || '')) || 0;
  if (profile.followedCreatorIds.has(wallpaper.user_id)) score += 12;
  if (wallpaper.is_featured) score += 7;
  if (wallpaper.polished_until && new Date(wallpaper.polished_until) > new Date()) score += 3.5;
  score += Math.log((Number(wallpaper.likes_count) || 0) + 1) * 2.8;
  score += Math.log((Number(wallpaper.downloads_count) || 0) + 1) * 2.4;
  score += Math.log((Number(wallpaper.views_count) || 0) + 1) * 0.45;
  score += feedFreshnessScore(wallpaper.created_at);
  if (profile.interactedWallpaperIds.has(wallpaper.id)) score -= 18;
  return score;
}

function algorithmSortedFeed(wallpapers) {
  const profile = feedAlgorithmProfile;
  if (!profile || profile.signalCount < 2) return [...wallpapers].sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
  const candidates = [...wallpapers].sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0)).slice(0, 240);
  const scored = candidates.map((wallpaper) => ({ wallpaper, score: feedAlgorithmScore(wallpaper, profile) })).sort((left, right) => right.score - left.score);
  const unseen = scored.filter(({ wallpaper }) => !profile.interactedWallpaperIds.has(wallpaper.id));
  const seen = scored.filter(({ wallpaper }) => profile.interactedWallpaperIds.has(wallpaper.id));
  return [...unseen, ...seen].map(({ wallpaper }) => wallpaper);
}
function renderFeed() {
  const query = document.getElementById('feed-search')?.value.trim().toLocaleLowerCase() || '';
  const rarity = document.getElementById('feed-rarity')?.value || 'all';
  const category = document.getElementById('feed-category')?.value || 'all';
  const quality = document.getElementById('feed-quality')?.value || 'all';
  const filtered = loadedWallpapers.filter((wallpaper) => {
    const searchable = [wallpaper.title, wallpaper.category, wallpaper.profiles?.username, ...tagsFor(wallpaper)].filter(Boolean).join(' ').toLocaleLowerCase();
    return (!query || searchable.includes(query)) && (rarity === 'all' || publicCardTier(wallpaper) === rarity) && (category === 'all' || String(wallpaper.category || '').toLocaleLowerCase() === category) && (quality === 'all' || String(wallpaper.quality || '').toLocaleLowerCase() === quality);
  });
  if (feedSort === 'algorithm') filtered.splice(0, filtered.length, ...algorithmSortedFeed(filtered));
  else filtered.sort((left, right) => {
    if (feedSort === 'recent') return new Date(right.created_at || 0) - new Date(left.created_at || 0);
    return feedTierRank[publicCardTier(right)] - feedTierRank[publicCardTier(left)] || publicCardScore(right) - publicCardScore(left) || new Date(right.created_at || 0) - new Date(left.created_at || 0);
  });
  const visible = filtered.slice(0, visibleFeedCount);
  idleObserver?.disconnect();
  const feedItems = [];
  visible.forEach((wallpaper, index) => {
    feedItems.push(renderCard(wallpaper));
    if ((index + 1) % AD_CARD_INTERVAL === 0) feedItems.push(renderAdCard());
  });
  grid.replaceChildren(...feedItems);
  const algorithmNote = feedSort === 'algorithm' && feedAlgorithmProfile?.signalCount < 2 ? ' Save, like or download wallpapers to personalize this feed.' : '';
  status.textContent = filtered.length ? `Showing ${visible.length} of ${filtered.length} public wallpapers.${algorithmNote}` : 'No public wallpapers match these filters.';
  status.hidden = false;
  loadMore.hidden = visible.length >= filtered.length;
}

function feedSuggestiveKey(userId) { return `wallverse-show-suggestive:${userId}`; }
function savedFeedSuggestive(userId) {
  try { return window.localStorage.getItem(feedSuggestiveKey(userId)) === 'true'; } catch { return false; }
}
function saveFeedSuggestive(userId, value) {
  try { window.localStorage.setItem(feedSuggestiveKey(userId), String(value)); } catch { /* Storage can be unavailable in private contexts. */ }
}
function readPublicCatalogCache() {
  try {
    const cached = JSON.parse(window.localStorage.getItem(PUBLIC_CATALOG_CACHE_KEY) || 'null');
    if (!cached || !Array.isArray(cached.wallpapers) || !Number.isFinite(cached.savedAt)) return null;
    const age = Date.now() - cached.savedAt;
    if (age < 0 || age > PUBLIC_CATALOG_CACHE_MAX_AGE) { window.localStorage.removeItem(PUBLIC_CATALOG_CACHE_KEY); return null; }
    return { wallpapers: cached.wallpapers, fresh: age < PUBLIC_CATALOG_CACHE_TTL };
  } catch { return null; }
}
function savePublicCatalogCache(wallpapers) {
  try { window.localStorage.setItem(PUBLIC_CATALOG_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), wallpapers })); } catch { /* Storage can be unavailable or full. */ }
}
function applyCatalog(wallpapers) {
  loadedWallpapers = [...new Map(wallpapers.map((wallpaper) => [wallpaper.id, decorateCardFrame(wallpaper)])).values()];
  window.WallversePublicCatalog = loadedWallpapers;
  visibleFeedCount = PAGE_SIZE;
  renderFeed();
  grid.setAttribute('aria-busy', 'false');
  loadMore.disabled = false;
  loadMore.textContent = 'Load more';
  window.dispatchEvent(new Event('wallverse:catalog-ready'));
}
function renderFeedSuggestiveControl() {
  const control = document.getElementById('feed-suggestive'); if (!control) return;
  control.disabled = !feedUser; control.checked = Boolean(feedUser && feedShowSuggestive);
  const label = control.closest('label');
  label.title = feedUser ? 'Include suggestive wallpapers' : 'Sign in to control suggestive content';
  if (feedUser) label.removeAttribute('data-tooltip');
  else label.dataset.tooltip = 'Sign in to show suggestive content.';
}
async function reloadFeed() {
  loadedWallpapers = []; visibleFeedCount = PAGE_SIZE; grid.replaceChildren(); grid.setAttribute('aria-busy', 'true');
  status.textContent = 'Loading wallpapers…'; status.hidden = false; await loadPage();
}
async function initializeFeedAuth() {
  const supabaseApi = window.supabase;
  if (!supabaseApi?.createClient) { renderFeedSuggestiveControl(); return; }
  const authClient = window.WallverseSupabase || supabaseApi.createClient(WALLVERSE_PUBLIC_CONFIG.supabaseUrl, WALLVERSE_PUBLIC_CONFIG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  window.WallverseSupabase = authClient;
  feedClient = authClient;
  try {
    const [{ data: userData }, { data: sessionData }] = await Promise.all([authClient.auth.getUser(), authClient.auth.getSession()]);
    feedUser = userData.user || null;
    feedAccessToken = sessionData.session?.access_token || null;
  } catch { feedUser = null; feedAccessToken = null; }
  feedShowSuggestive = feedUser ? savedFeedSuggestive(feedUser.id) : false; renderFeedSuggestiveControl(); updateFeedSortControls();
  if (feedUser) { feedAlgorithmLoading = loadFeedAlgorithmProfile().catch((error) => { console.warn('For you ranking unavailable.', error); return null; }); }
  authClient.auth.onAuthStateChange((_event, session) => {
    const nextUser = session?.user || null; const nextSuggestive = nextUser ? savedFeedSuggestive(nextUser.id) : false;
    const changed = nextUser?.id !== feedUser?.id || nextSuggestive !== feedShowSuggestive;
    feedUser = nextUser; feedAccessToken = session?.access_token || null; feedShowSuggestive = nextSuggestive; feedAlgorithmProfile = null; renderFeedSuggestiveControl(); updateFeedSortControls();
    feedAlgorithmLoading = nextUser ? loadFeedAlgorithmProfile().then(() => { if (feedSort === 'algorithm') renderFeed(); }).catch((error) => console.warn('For you ranking unavailable.', error)) : null;
    if (feedReady && changed) reloadFeed().catch((error) => console.error(error));
  });
}

function renderSpotlight(wallpaper, weekly) {
  if (!wallpaper) { spotlightCard.hidden = true; return; }
  decorateCardFrame(wallpaper);
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
  spotlightCard.href = wallpaperPath(wallpaper);
  spotlightCard.setAttribute('aria-label', `Open ${wallpaper.title || 'this wallpaper'} details`);
  const inspect = (event) => {
    if (event?.target?.closest('button')) return;
    window.dispatchEvent(new CustomEvent('wallverse:inspect', { detail: { wallpaper } }));
  };
  spotlightCard.onclick = (event) => { event.preventDefault(); inspect(event); };
  spotlightCard.setAttribute('aria-busy', 'false');
}

async function loadSpotlight() {
  const base = { status: 'eq.approved', is_suggestive: 'eq.false', order: 'created_at.desc', limit: '1' };
  const weekly = await fetchWallpapers({ ...base, select: SPOTLIGHT_SELECT, is_weekly: 'eq.true' });
  if (weekly[0]) return renderSpotlight(weekly[0], true);
  const featured = await fetchWallpapers({ ...base, select: SELECT, is_featured: 'eq.true' });
  renderSpotlight(featured[0], false);
}

function preloadFeaturedImage(wallpaper) {
  return new Promise((resolve) => {
    if (!wallpaper) return resolve();
    const preloaded = new Image();
    preloaded.onload = resolve;
    preloaded.onerror = resolve;
    preloaded.src = thumbnailUrl(wallpaper);
  });
}
function applyFeaturedCard(card, wallpaper) {
  const image = card.querySelector('img');
  const title = card.querySelector('h2');
  if (!wallpaper) { card.hidden = true; return; }
  decorateCardFrame(wallpaper);
  image.src = thumbnailUrl(wallpaper);
  image.alt = wallpaper.title ? `${wallpaper.title} wallpaper` : 'Featured Wallverse wallpaper';
  image.onerror = () => { card.hidden = true; };
  title.textContent = wallpaper.title || 'Untitled wallpaper';
  card.href = wallpaperPath(wallpaper);
  card.setAttribute('aria-label', `Open ${wallpaper.title || 'this featured wallpaper'} details`);
  const inspect = () => window.dispatchEvent(new CustomEvent('wallverse:inspect', { detail: { wallpaper } }));
  card.onclick = (event) => { event.preventDefault(); inspect(); };
  card.hidden = false;
}
async function renderFeaturedCard(card, wallpaper, { animate = false } = {}) {
  await preloadFeaturedImage(wallpaper);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate || reduceMotion) { applyFeaturedCard(card, wallpaper); return; }
  card.classList.add('is-flipping');
  await new Promise((resolve) => window.setTimeout(resolve, 380));
  applyFeaturedCard(card, wallpaper);
  await new Promise((resolve) => window.setTimeout(resolve, 380));
  card.classList.remove('is-flipping');
}
function renderFeatured(wallpapers, options) {
  const cards = [...document.querySelectorAll('.featured-card')];
  return Promise.all(cards.map((card, index) => renderFeaturedCard(card, wallpapers[index], options))).then(() => {
    document.getElementById('featured-grid').setAttribute('aria-busy', 'false');
  });
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
  const indices = [0, unique.length > 1 ? 1 : -1];
  const featuredCards = [...document.querySelectorAll('.featured-card')];
  const switching = [false, false];
  await renderFeatured([unique[indices[0]], indices[1] >= 0 ? unique[indices[1]] : null]);
  if (unique.length <= 2) return;
  const rotateCard = async (cardIndex) => {
    if (switching[cardIndex]) return;
    switching[cardIndex] = true;
    const otherIndex = indices[cardIndex === 0 ? 1 : 0];
    let nextIndex = indices[cardIndex];
    for (let step = 0; step < unique.length; step += 1) {
      nextIndex = (nextIndex + 1) % unique.length;
      if (nextIndex !== otherIndex) break;
    }
    indices[cardIndex] = nextIndex;
    await renderFeaturedCard(featuredCards[cardIndex], unique[indices[cardIndex]], { animate: true });
    switching[cardIndex] = false;
  };
  window.setInterval(() => rotateCard(0), 6200);
  window.setTimeout(() => {
    rotateCard(1);
    window.setInterval(() => rotateCard(1), 6200);
  }, 3100);
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
  const totals = wallpapers.reduce((summary, wallpaper) => ({
    uploads: summary.uploads + 1,
    likes: summary.likes + (Number(wallpaper.likes_count) || 0),
    downloads: summary.downloads + (Number(wallpaper.downloads_count) || 0),
    featured: summary.featured + (wallpaper.is_featured ? 1 : 0),
  }), { uploads: 0, likes: 0, downloads: 0, featured: 0 });
  const creatorContent = creatorNode(profile, window.WallverseCardFrames?.creatorRarity(profile, totals) || 'common', { framed: true });
  creator.replaceChildren(...creatorContent.childNodes);
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Open ${profile.username}'s creator profile`);
  const inspectCreator = (event) => {
    if (event?.target?.closest('#creator-follow')) return;
    if (typeof window.WallverseOpenCreator === 'function') window.WallverseOpenCreator(profile);
    else window.dispatchEvent(new CustomEvent('wallverse:creator-inspect', { detail: { profile } }));
  };
  card.onclick = inspectCreator;
  card.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspectCreator(event); } };
  renderCreatorStats(wallpapers);
  creatorSpotlightProfile = profile;
  refreshCreatorFollow().catch((error) => console.warn('Creator follow status unavailable.', error));
  card.setAttribute('aria-busy', 'false');
}

async function refreshCreatorFollow() {
  const button = document.getElementById('creator-follow');
  const client = window.WallverseSupabase;
  if (!button || !creatorSpotlightProfile || !client) return;
  const { data } = await client.auth.getUser();
  const user = data.user || null;
  button.hidden = Boolean(user && user.id === creatorSpotlightProfile.id);
  button.disabled = false;
  if (!user || user.id === creatorSpotlightProfile.id) {
    button.classList.remove('is-following');
    button.setAttribute('aria-pressed', 'false');
    button.textContent = 'Follow';
    return;
  }
  const { data: follow } = await client.from('follows').select('followed_id').eq('follower_id', user.id).eq('followed_id', creatorSpotlightProfile.id).maybeSingle();
  const following = Boolean(follow);
  button.classList.toggle('is-following', following);
  button.setAttribute('aria-pressed', String(following));
  button.textContent = following ? 'Following' : 'Follow';
}

async function toggleCreatorFollow() {
  const button = document.getElementById('creator-follow');
  const client = window.WallverseSupabase;
  if (!button || !creatorSpotlightProfile || !client || button.disabled) return;
  const { data } = await client.auth.getUser();
  const user = data.user || null;
  if (!user) { document.getElementById('auth-trigger')?.click(); return; }
  if (user.id === creatorSpotlightProfile.id) return;
  const shouldFollow = button.getAttribute('aria-pressed') !== 'true';
  button.disabled = true;
  try {
    const { error } = await client.rpc('toggle_creator_follow', { creator_id_input: creatorSpotlightProfile.id, should_follow: shouldFollow });
    if (error) throw error;
    button.classList.toggle('is-following', shouldFollow);
    button.setAttribute('aria-pressed', String(shouldFollow));
    button.textContent = shouldFollow ? 'Following' : 'Follow';
  } catch (error) {
    console.warn('Unable to update creator follow.', error);
  } finally { button.disabled = false; }
}

async function loadCreatorSpotlight() {
  const profiles = await fetchPublic('profiles', {
    select: 'id,username,role,avatar_url,avatar_frame_type,followers_count',
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

async function loadPage({ background = false } = {}) {
  const requestRevision = ++feedRequestRevision;
  if (!background) {
    loadMore.disabled = true;
    loadMore.textContent = 'Loading catalog…';
    status.textContent = 'Loading the public wallpaper catalog…'; status.hidden = false;
  }
  const allWallpapers = [];
  let catalogOffset = 0;
  while (true) {
    const filters = { status: 'eq.approved', order: 'created_at.desc', limit: String(FEED_CATALOG_PAGE_SIZE), offset: String(catalogOffset) };
    if (!feedShowSuggestive) filters.is_suggestive = 'eq.false';
    const rows = await fetchWallpapers(filters);
    if (requestRevision !== feedRequestRevision) return;
    allWallpapers.push(...rows);
    if (rows.length < FEED_CATALOG_PAGE_SIZE) break;
    catalogOffset += rows.length;
  }
  if (requestRevision !== feedRequestRevision) return;
  applyCatalog(allWallpapers);
  // A public cache deliberately contains no user_cards due to RLS. Reusing it
  // for a signed-in session would discard the viewer's card frame selection.
  if (!feedUser && !feedShowSuggestive) savePublicCatalogCache(allWallpapers);
}

async function initialize() {
  try {
    await initializeFeedAuth();
    // Render the safe public cache immediately whenever it is available. A
    // signed-in refresh still follows in the background to hydrate the
    // viewer's own user_cards and their selected custom frames.
    const cachedCatalog = feedShowSuggestive ? null : readPublicCatalogCache();
    if (cachedCatalog) applyCatalog(cachedCatalog.wallpapers);
    const catalogWork = feedUser || !cachedCatalog || !cachedCatalog.fresh
      ? loadPage({ background: Boolean(cachedCatalog) }).catch((error) => {
        if (!cachedCatalog) throw error;
        console.warn('Background catalog refresh unavailable.', error);
      })
      : Promise.resolve();
    await Promise.all([loadSpotlight(), loadFeatured(), loadCreatorSpotlight(), catalogWork]);
    feedReady = true;
  } catch (error) {
    console.error(error);
    grid.setAttribute('aria-busy', 'false');
    status.textContent = 'Wallpapers are unavailable right now. Please try again shortly.';
    spotlightCard.hidden = true;
  }
}

if (grid && loadMore && spotlightCard) {
  loadMore.addEventListener('click', () => { visibleFeedCount += PAGE_SIZE; renderFeed(); });
  document.getElementById('feed-search').addEventListener('input', renderFeed);
  document.getElementById('feed-rarity').addEventListener('change', renderFeed);
  document.getElementById('feed-category').addEventListener('change', renderFeed);
  document.getElementById('feed-quality').addEventListener('change', renderFeed);
  document.getElementById('feed-sort-popular').addEventListener('click', () => { feedSort = 'popular'; updateFeedSortControls(); renderFeed(); });
  document.getElementById('feed-sort-recent').addEventListener('click', () => { feedSort = 'recent'; updateFeedSortControls(); renderFeed(); });
  document.getElementById('feed-sort-algorithm')?.addEventListener('click', async () => {
    if (!feedUser) return;
    feedSort = 'algorithm'; updateFeedSortControls();
    if (!feedAlgorithmProfile && feedAlgorithmLoading) { status.textContent = 'Personalizing your For you feed…'; status.hidden = false; await feedAlgorithmLoading; }
    renderFeed();
  });
  document.getElementById('feed-suggestive').addEventListener('change', (event) => {
    if (!feedUser) { event.target.checked = false; return; }
    feedShowSuggestive = event.target.checked; saveFeedSuggestive(feedUser.id, feedShowSuggestive); renderFeedSuggestiveControl();
    reloadFeed().catch((error) => { console.error(error); status.textContent = 'Unable to refresh wallpapers right now.'; });
  });
  window.addEventListener('wallverse:wallpaper-updated', (event) => {
    const updated = event.detail?.wallpaper; const existing = loadedWallpapers.find((wallpaper) => wallpaper.id === updated?.id);
    if (existing) { Object.assign(existing, updated); if (!feedUser && !feedShowSuggestive) savePublicCatalogCache(loadedWallpapers); renderFeed(); }
  });
  window.addEventListener('wallverse:feed-search', (event) => {
    const search = document.getElementById('feed-search'); if (!search) return;
    search.value = event.detail?.query || '';
    renderFeed();
    document.getElementById('for-you')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => search.focus({ preventScroll: true }), 380);
  });
  document.getElementById('header-search')?.addEventListener('click', () => {
    document.getElementById('for-you')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => document.getElementById('feed-search')?.focus({ preventScroll: true }), 380);
  });
  document.getElementById('creator-follow')?.addEventListener('click', toggleCreatorFollow);
  window.WallverseSupabase?.auth.onAuthStateChange(() => refreshCreatorFollow().catch((error) => console.warn('Creator follow status unavailable.', error)));
  initialize();
}

window.WallverseCards = { thumbnailUrl, downloadUrl, wallpaperPath, tagsFor, qualityLabel, compactNumber, publicCardScore, publicCardTier, enablePublicCardMotion, createAdCard: renderAdCard, adCardInterval: AD_CARD_INTERVAL };
window.dispatchEvent(new Event('wallverse:data-ready'));
