// Public, anonymous reads only. Never forward visitor cookies or auth tokens.
export const ORIGIN = 'https://wallverse.win';
export const CATEGORIES = {
  anime: ['Anime', 'Anime phone wallpapers', 'Find anime characters, expressive portraits and illustrated scenes for your phone lock screen and home screen.'],
  gaming: ['Gaming', 'Gaming phone wallpapers', 'Browse video game characters and worlds in portrait wallpapers made for smartphone screens.'],
  nature: ['Nature', 'Nature phone wallpapers', 'Explore landscapes, forests, flowers and wildlife to bring a little of the outdoors to your phone.'],
  abstract: ['Abstract', 'Abstract phone wallpapers', 'Discover shapes, flowing colors and abstract compositions for a distinctive phone background.'],
  fantasy: ['Fantasy', 'Fantasy phone wallpapers', 'Explore imagined worlds, mythical creatures and magical scenery for your smartphone.'],
  cyberpunk: ['Cyberpunk', 'Cyberpunk phone wallpapers', 'Find neon cityscapes, futuristic characters and atmospheric science-fiction phone backgrounds.'],
  space: ['Space', 'Space phone wallpapers', 'Browse stars, planets, galaxies and cosmic scenes for your smartphone home screen.'],
  minimalist: ['Minimalist', 'Minimalist phone wallpapers', 'Explore simple compositions and uncluttered backgrounds that leave room for your phone icons.'],
  'movies-tv': ['Movies & TV', 'Movie and TV phone wallpapers', 'Browse phone backgrounds inspired by movie and television worlds and characters.'],
  sport: ['Sport', 'Sports phone wallpapers', 'Explore sports-inspired portrait backgrounds for your phone.'],
  miscellaneous: ['Miscellaneous', 'More phone wallpapers', 'Discover phone backgrounds beyond the usual categories, from unusual artwork to unexpected subjects.'],
};
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const jsonLd = value => JSON.stringify(value).replace(/</g, '\\u003c');
export function wallpaperPath(w) {
  const slug = String(w.title || 'wallpaper').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'wallpaper';
  return `/wallpaper/${slug}-${String(w.id).replace(/-/g, '').slice(0, 8)}`;
}
export function thumbnail(w) {
  if (w.storage_provider === 'cloudflare_r2' && w.thumbnail_storage_key) {
    return `https://images.wallverse.win/${String(w.thumbnail_storage_key).replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')}`;
  }
  try { const url = new URL(w.thumbnail_url); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
export async function query(context, filters, count = false) {
  const cacheKey = new Request(`${ORIGIN}/__seo-catalog-cache?${new URLSearchParams({...filters,withCount:String(count)})}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();
  // Reuse the site's existing public configuration without a second API key.
  const configResponse = await context.env.ASSETS.fetch(new URL('/wallverse-data-runtime-0820a.js', context.request.url));
  if (!configResponse.ok) throw new Error('Public configuration unavailable');
  const config = await configResponse.text();
  const base = config.match(/supabaseUrl: '([^']+)'/)?.[1];
  const key = config.match(/supabaseAnonKey: '([^']+)'/)?.[1];
  if (!base || !key) throw new Error('Public configuration missing');
  const response = await fetch(`${base}/rest/v1/wallpapers?${new URLSearchParams({status:'eq.approved', ...filters})}`, {
    headers: { apikey:key, Authorization:`Bearer ${key}`, ...(count ? {Prefer:'count=exact'} : {}) },
    signal: AbortSignal.timeout(8000),
  });
  // PostgREST reports an offset beyond the collection as HTTP 416.
  // Treat it as an empty page, so our route returns a genuine 404.
  if (response.status === 416) return {rows:[],total:0};
  if (!response.ok) throw new Error(`Public catalog returned ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Invalid public catalog');
  const total = Number(response.headers.get('Content-Range')?.split('/')[1]);
  if (count && !Number.isFinite(total)) throw new Error('Catalog count unavailable');
  const result = { rows, total };
  context.waitUntil(cache.put(cacheKey,Response.json(result,{headers:{'Cache-Control':'public, max-age=300'}})));
  return result;
}
export const CARD_SELECT = 'id,title,description,category,width,height,is_suggestive,thumbnail_url,storage_provider,thumbnail_storage_key,created_at';
export function response(body, status = 200, type = 'text/html; charset=utf-8') {
  return new Response(body, {status, headers:{'Content-Type':type,'Cache-Control': status === 200 ? 'public, max-age=0, s-maxage=300' : 'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'strict-origin-when-cross-origin', ...(status >= 400 ? {'X-Robots-Tag':'noindex'} : {})}});
}
export function documentHtml({ title, description, path, body, schema, noindex = false }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${ORIGIN}${escapeHtml(path)}"><meta name="robots" content="${noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large'}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${ORIGIN}${escapeHtml(path)}"><meta property="og:type" content="website"><meta property="og:image" content="${ORIGIN}/assets/app-showcase.webp"><link rel="icon" href="/assets/wallverse-mark.webp"><link rel="stylesheet" href="/seo-pages.css?v=1">${schema ? `<script type="application/ld+json">${jsonLd(schema)}</script>` : ''}</head><body><header><a class="brand" href="/">WALLVERSE</a><nav aria-label="Main navigation"><a href="/wallpapers/">Phone wallpapers</a><a href="/creators/">Creators</a><a href="https://play.google.com/store/apps/details?id=app.wallverse.mobile">Android app</a></nav></header><main>${body}</main><footer><a href="/">Wallverse home</a><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a></footer></body></html>`;
}
export function errorPage(status = 404) {
  const missing = status === 404;
  return response(documentHtml({title: missing ? 'Page not found | Wallverse' : 'Temporarily unavailable | Wallverse', description:'Browse phone wallpapers on Wallverse.', path:'/wallpapers/',noindex:true,body:`<h1>${missing ? 'Page not found' : 'Please try again shortly'}</h1><p>${missing ? 'This page may have moved or is no longer public.' : 'The wallpaper catalog is temporarily unavailable.'}</p><p><a href="/wallpapers/">Browse phone wallpapers</a></p>`}),status);
}
export function categoryLinks() {
  return `<nav class="categories" aria-label="Wallpaper categories"><a href="/wallpapers/">All wallpapers</a>${Object.entries(CATEGORIES).map(([slug,[label]])=>`<a href="/wallpapers/${slug}/">${escapeHtml(label)}</a>`).join('')}</nav>`;
}
export async function catalogPage(context, category = '') {
  try {
    const info = category && Object.hasOwn(CATEGORIES,category) ? CATEGORIES[category] : null;
    if (category && !info) return errorPage();
    const url = new URL(context.request.url);
    const rawPage = url.searchParams.get('page') || '1';
    if (!/^[1-9]\d{0,5}$/.test(rawPage)) return errorPage();
    const page = Number(rawPage);
    const path = `/wallpapers/${category ? `${category}/` : ''}${page > 1 ? `?page=${page}` : ''}`;
    if (url.pathname !== path.split('?')[0] || (url.searchParams.has('page') && page === 1)) return Response.redirect(`${ORIGIN}${path}`,301);
    const {rows,total} = await query(context,{select:CARD_SELECT,is_suggestive:'eq.false',...(info ? {category:`ilike.${info[0]}`} : {}),order:'created_at.desc,id.asc',limit:'24',offset:String((page-1)*24)},true);
    if (!rows.length && page > 1) return errorPage();
    const heading = info?.[1] || 'Phone wallpapers for your smartphone';
    const description = info?.[2] || 'Explore portrait wallpapers for your smartphone. Browse anime, gaming, nature, space and more, then open a wallpaper to see its resolution and download options.';
    const cards = rows.map((w,i)=>`<a class="wallpaper" href="${escapeHtml(wallpaperPath(w))}"><img src="${escapeHtml(thumbnail(w))}" alt="${escapeHtml(w.title)} phone wallpaper" width="360" height="800" loading="${i < 2 ? 'eager' : 'lazy'}" decoding="async"><h2>${escapeHtml(w.title)}</h2><p>${escapeHtml(w.category)}${w.width && w.height ? ` · ${Number(w.width)} × ${Number(w.height)}` : ''}</p></a>`).join('');
    const pageLink = n => `/wallpapers/${category ? `${category}/` : ''}${n > 1 ? `?page=${n}` : ''}`;
    const body = `<p class="eyebrow">WALLVERSE WALLPAPER COLLECTION</p><h1>${escapeHtml(heading)}${page > 1 ? ` — Page ${page}` : ''}</h1><p class="intro">${escapeHtml(description)}</p>${categoryLinks()}<p>${total} wallpapers${rows.length ? ` · Page ${page} of ${Math.ceil(total/24)}` : ''}</p><div class="catalog">${cards || '<p>No wallpapers in this category yet.</p>'}</div><nav class="pagination" aria-label="Pagination">${page > 1 ? `<a rel="prev" href="${pageLink(page-1)}">Previous page</a>` : ''}${page*24 < total ? `<a rel="next" href="${pageLink(page+1)}">Next page</a>` : ''}</nav><section><h2>Choose a background for your phone</h2><p>Open a wallpaper to check its dimensions and download options. Portrait images fit tall smartphone screens; your phone may crop the edges when you apply an image to the home screen or lock screen.</p><p>Use the <a href="/">interactive Wallverse feed</a> for random discoveries and filters, or explore more wallpapers in the <a href="https://play.google.com/store/apps/details?id=app.wallverse.mobile">Wallverse Android app</a>.</p></section>`;
    return response(documentHtml({title:`${info?.[1] || 'Smartphone & Android Wallpapers'}${page>1 ? ` — Page ${page}` : ''} | Wallverse`,description,path,body,noindex:!rows.length,schema:{'@context':'https://schema.org','@type':'CollectionPage',name:heading,url:`${ORIGIN}${path}`,mainEntity:{'@type':'ItemList',itemListElement:rows.map((w,i)=>({'@type':'ListItem',position:(page-1)*24+i+1,url:`${ORIGIN}${wallpaperPath(w)}`,name:w.title}))}}}));
  } catch (error) { console.error('SEO catalog failed',error.message); return errorPage(503); }
}
