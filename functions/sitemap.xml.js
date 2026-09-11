import { ORIGIN, CATEGORIES, query, wallpaperPath, thumbnail, escapeHtml as esc, response, errorPage } from '../lib/seo.js';

export async function onRequestGet(context) {
  try {
    const pageValue = new URL(context.request.url).searchParams.get('page');
    const page = pageValue === null ? 0 : Number(pageValue);
    if (pageValue !== null && (!/^[1-9]\d{0,5}$/.test(pageValue))) return errorPage();
    if (!page) {
      const {total} = await query(context,{select:'id',is_suggestive:'eq.false',limit:'1'},true);
      const pages = Math.max(1,Math.ceil(total/1000));
      return response(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Array.from({length:pages},(_,i)=>`<sitemap><loc>${ORIGIN}/sitemap.xml?page=${i+1}</loc></sitemap>`).join('')}</sitemapindex>`,200,'application/xml; charset=utf-8');
    }
    const {rows} = await query(context,{select:'id,title,thumbnail_url,storage_provider,thumbnail_storage_key',is_suggestive:'eq.false',order:'id.asc',limit:'1000',offset:String((page-1)*1000)});
    if (!rows.length && page > 1) return errorPage();
    const staticPaths = page === 1 ? ['/', '/wallpapers/', '/creators/', ...Object.keys(CATEGORIES).map(c=>`/wallpapers/${c}/`)] : [];
    const entries = staticPaths.map(path=>`<url><loc>${ORIGIN}${path}</loc></url>`).concat(rows.map(w=>`<url><loc>${ORIGIN}${esc(wallpaperPath(w))}</loc>${thumbnail(w) ? `<image:image><image:loc>${esc(thumbnail(w))}</image:loc></image:image>` : ''}</url>`));
    return response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${entries.join('')}</urlset>`,200,'application/xml; charset=utf-8');
  } catch(error) { console.error('Sitemap failed',error.message); return errorPage(503); }
}
export async function onRequestHead(context) { const r = await onRequestGet(context); return new Response(null,r); }
