import assert from 'node:assert/strict';
import { escapeHtml, jsonLd, wallpaperPath } from '../lib/seo.js';

// Run against `npm run dev`, or pass the deployed origin explicitly.
const origin = process.argv[2] || 'http://127.0.0.1:8788';
async function get(path, status = 200) {
  const r = await fetch(`${origin}${path}`,{redirect:'manual'});
  assert.equal(r.status,status,`${path}: HTTP status`);
  return {r,html:await r.text()};
}
assert.equal(escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;');
assert.ok(!jsonLd({name:'</script><script>alert(1)</script>'}).includes('<'));
assert.equal(JSON.parse(jsonLd({name:'<test>'})).name,'<test>');
assert.equal(wallpaperPath({id:'abcdef12-0000-0000-0000-000000000000',title:'Étoile & Moon'}),'/wallpaper/etoile-moon-abcdef12');
const home = await get('/');
assert.match(home.html,/<link rel="canonical" href="https:\/\/wallverse.win\/">/);
assert.match(home.html,/href="\/wallpapers\/anime\/"/);
const robots = await get('/robots.txt');
assert.match(robots.r.headers.get('content-type'),/text\/plain/);
assert.match(robots.html,/Sitemap: https:\/\/wallverse.win\/sitemap.xml/);
const sitemap = await get('/sitemap.xml');
assert.match(sitemap.r.headers.get('content-type'),/application\/xml/);
assert.match(sitemap.html,/<sitemapindex/);
let imageCount = 0;
const sitemapLocations = [...sitemap.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>new URL(m[1]));
for (const url of sitemapLocations) {
  const child = await get(url.pathname+url.search);
  assert.match(child.html,/<urlset/);
  imageCount += [...child.html.matchAll(/<image:image>/g)].length;
  assert.ok(!child.html.includes('c533602a'),'Suggestive image excluded from sitemap');
}
assert.ok(imageCount>0,'Sitemap contains images');
const catalog = await get('/wallpapers/');
assert.equal([...catalog.html.matchAll(/class="wallpaper"/g)].length,24);
const link = catalog.html.match(/class="wallpaper" href="([^"]+)"/)[1];
const detail = await get(link);
assert.match(detail.html,/id="wallpaper-seo-content"/);
assert.match(detail.html,/id="wallpaper-schema"/);
assert.ok(!detail.html.includes('id="site-schema"'),'Homepage schema removed on detail');
assert.ok(detail.html.includes(`href="https://wallverse.win${link}"`));
const suggestive = await get('/wallpaper/himiko-toga-in-black-satin-c533602a');
assert.match(suggestive.r.headers.get('x-robots-tag'),/noindex/);
assert.match(suggestive.html,/Sign up or sign in to view this image/);
assert.ok(!suggestive.html.includes('images.wallverse.win/wallpapers/c533602a'),'No unlocked image in server preview');
await get('/wallpapers/anime/');
const second = await get('/wallpapers/?page=2');
assert.match(second.html,/canonical" href="https:\/\/wallverse.win\/wallpapers\/\?page=2/);
for (const bad of ['/not-a-real-seo-page','/wallpaper/fake-00000000','/wallpaper/not-an-id','/wallpapers/unknown/','/wallpapers/toString/','/wallpapers/?page=-1','/wallpapers/?page=999999','/sitemap.xml?page=0']) await get(bad,404);
const alias = await get('/wallpaper/old-title-'+link.slice(-8),301);
assert.equal(alias.r.headers.get('location'),`https://wallverse.win${link}`);
const head = await fetch(`${origin}${link}`,{method:'HEAD'});
assert.equal(head.status,200); assert.equal(await head.text(),'');
console.log(`SEO smoke checks passed: ${imageCount} image entries, server-rendered catalog/details, redirects, 404s, escaping and suggestive gate.`);
