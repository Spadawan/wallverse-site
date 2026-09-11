import { ORIGIN, CARD_SELECT, CATEGORIES, query, wallpaperPath, thumbnail, escapeHtml as esc, jsonLd, response, errorPage } from '../../lib/seo.js';

export async function onRequestGet(context) {
  const slug = String(context.params.slug || '');
  const shortId = slug.match(/-([a-f0-9]{8})$/i)?.[1].toLowerCase();
  if (!shortId) return errorPage();
  try {
    const {rows} = await query(context,{select:CARD_SELECT,and:`(id.gte.${shortId}-0000-0000-0000-000000000000,id.lte.${shortId}-ffff-ffff-ffff-ffffffffffff)`,limit:'2'});
    if (rows.length !== 1) return errorPage();
    const w = rows[0];
    const path = wallpaperPath(w);
    if (new URL(context.request.url).pathname !== path) return Response.redirect(`${ORIGIN}${path}`,301);
    const title = `${w.title} — Phone Wallpaper | Wallverse`;
    const description = w.is_suggestive ? `${w.title} on Wallverse. Sign up or sign in to view this suggestive wallpaper.` : `${w.title}: ${w.width && w.height ? `${w.width} × ${w.height} ` : ''}${w.category || ''} phone wallpaper. ${w.description || 'View the artwork and download options on Wallverse.'}`.slice(0,300);
    const imageUrl = w.is_suggestive ? `${ORIGIN}/assets/app-showcase.webp` : thumbnail(w);
    const category = Object.entries(CATEGORIES).find(([,v])=>v[0].toLowerCase()===String(w.category).toLowerCase());
    const categoryLink = category ? `<a href="/wallpapers/${category[0]}/">${esc(category[1][1])}</a>` : '<a href="/wallpapers/">Phone wallpapers</a>';
    const content = `<article id="wallpaper-seo-content" class="section-shell wallpaper-seo-content"><nav aria-label="Breadcrumb"><a href="/">Home</a> / ${categoryLink}</nav><h1>${esc(w.title)} phone wallpaper</h1>${w.is_suggestive ? '<div class="wallpaper-seo-gate"><h2>Suggestive content</h2><p>Sign up or sign in to view this image.</p><button class="button" type="button" data-open-auth>Sign up or sign in</button><noscript><p>Enable JavaScript to sign in and view this image.</p></noscript></div>' : `<img src="${esc(imageUrl)}" alt="${esc(w.title)} phone wallpaper" width="${Number(w.width)||900}" height="${Number(w.height)||2000}" fetchpriority="high"><p>${esc(w.description || `Explore ${w.title}, a ${String(w.category || '').toLowerCase()} wallpaper for your smartphone home screen or lock screen.`)}</p>`}<p>${w.width && w.height ? `Image dimensions: ${Number(w.width)} × ${Number(w.height)} pixels.` : ''}</p><p>Open the interactive card to see download options, likes and comments. The card opens automatically when JavaScript is available.</p><p>Discover more ${categoryLink} or use the <a href="https://play.google.com/store/apps/details?id=app.wallverse.mobile">Wallverse Android app</a>.</p></article>`;
    const schema = {'@context':'https://schema.org','@type':'WebPage',name:title,description,url:`${ORIGIN}${path}`,...(!w.is_suggestive && imageUrl ? {primaryImageOfPage:{'@type':'ImageObject',contentUrl:imageUrl,name:w.title,...(w.width && w.height ? {width:Number(w.width),height:Number(w.height)} : {})}} : {})};
    const asset = await context.env.ASSETS.fetch(new URL('/',context.request.url));
    if (!asset.ok) throw new Error('Homepage template unavailable');
    const rewritten = new HTMLRewriter()
      .on('title',{element(e){e.setInnerContent(title);}})
      .on('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]',{element(e){e.setAttribute('content',description);}})
      .on('meta[property="og:title"],meta[name="twitter:title"]',{element(e){e.setAttribute('content',title);}})
      .on('meta[property="og:image"],meta[name="twitter:image"]',{element(e){e.setAttribute('content',imageUrl);}})
      .on('meta[property="og:url"]',{element(e){e.setAttribute('content',`${ORIGIN}${path}`);}})
      .on('link[rel="canonical"]',{element(e){e.setAttribute('href',`${ORIGIN}${path}`);}})
      .on('meta[name="robots"]',{element(e){e.setAttribute('content',w.is_suggestive ? 'noindex,follow' : 'index,follow,max-image-preview:large');}})
      .on('#site-schema',{element(e){e.remove();}})
      .on('head',{element(e){e.append(`<script type="application/ld+json" id="wallpaper-schema">${jsonLd(schema)}</script>`,{html:true});}})
      .on('#main-content',{element(e){e.setAttribute('hidden','');e.setAttribute('data-seo-home','');e.before(content,{html:true});}})
      .transform(asset);
    const result = response(rewritten.body);
    if (w.is_suggestive) result.headers.set('X-Robots-Tag','noindex, follow');
    return result;
  } catch (error) { console.error('SEO wallpaper failed',error.message); return errorPage(503); }
}
export async function onRequestHead(context) { const r = await onRequestGet(context); return new Response(null,r); }
