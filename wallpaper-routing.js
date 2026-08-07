(() => {
  // Keep routing independent from the feed script's cache version. The detail
  // viewer and data helpers can finish loading after this deferred script.
  const helpers = () => window.WallverseCards || {};
  const inspection = () => window.WallverseInspection;

  const defaultSeo = {
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content || '',
    canonical: document.querySelector('link[rel="canonical"]')?.href || `${window.location.origin}/`,
    ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
    ogDescription: document.querySelector('meta[property="og:description"]')?.content || '',
    ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
    ogUrl: document.querySelector('meta[property="og:url"]')?.content || '',
  };
  let ignoreInspectionClose = false;
  let routeNotFound;

  function isWallpaperRoute() { return /^\/wallpaper\/[^/]+\/?$/.test(window.location.pathname); }
  function wallpaperPath(wallpaper) {
    const title = String(wallpaper?.title || 'wallpaper').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'wallpaper';
    const shortId = String(wallpaper?.id || '').replace(/-/g, '').slice(0, 8);
    return shortId ? `/wallpaper/${title}-${shortId}` : '/';
  }
  function shortIdFromRoute() {
    const segment = window.location.pathname.replace(/\/$/, '').split('/').pop() || '';
    return segment.match(/-([a-z0-9]{6,})$/i)?.[1].toLowerCase() || '';
  }
  function findWallpaper() {
    const historyId = String(history.state?.wallpaperId || '');
    if (historyId) {
      const byId = (window.WallversePublicCatalog || []).find((wallpaper) => String(wallpaper.id || '') === historyId);
      if (byId) return byId;
    }
    const shortId = shortIdFromRoute();
    if (!shortId) return null;
    return (window.WallversePublicCatalog || []).find((wallpaper) => String(wallpaper.id || '').replace(/-/g, '').toLowerCase().startsWith(shortId)) || null;
  }
  function meta(selector, attributes, value) {
    let node = document.querySelector(selector);
    if (!node) { node = document.createElement('meta'); Object.entries(attributes).forEach(([key, item]) => node.setAttribute(key, item)); document.head.append(node); }
    node.content = value;
  }
  function canonical(value) {
    let node = document.querySelector('link[rel="canonical"]');
    if (!node) { node = document.createElement('link'); node.rel = 'canonical'; document.head.append(node); }
    node.href = value;
  }
  function updateSeo(wallpaper) {
    const title = wallpaper.title || 'Wallpaper';
    const creator = wallpaper.profiles?.username ? ` by @${wallpaper.profiles.username}` : '';
    const description = wallpaper.description || `Discover ${title}${creator} on Wallverse.`;
    const url = new URL(wallpaperPath(wallpaper), window.location.origin).href;
    const image = helpers().thumbnailUrl?.(wallpaper) || '';
    document.title = `${title} Wallpaper | Wallverse`;
    meta('meta[name="description"]', { name: 'description' }, description);
    meta('meta[property="og:title"]', { property: 'og:title' }, document.title);
    meta('meta[property="og:description"]', { property: 'og:description' }, description);
    meta('meta[property="og:image"]', { property: 'og:image' }, image);
    meta('meta[property="og:url"]', { property: 'og:url' }, url);
    canonical(url);
  }
  function restoreSeo() {
    document.title = defaultSeo.title;
    meta('meta[name="description"]', { name: 'description' }, defaultSeo.description);
    meta('meta[property="og:title"]', { property: 'og:title' }, defaultSeo.ogTitle);
    meta('meta[property="og:description"]', { property: 'og:description' }, defaultSeo.ogDescription);
    meta('meta[property="og:image"]', { property: 'og:image' }, defaultSeo.ogImage);
    meta('meta[property="og:url"]', { property: 'og:url' }, defaultSeo.ogUrl);
    canonical(defaultSeo.canonical);
  }
  function hideNotFound() { routeNotFound?.remove(); routeNotFound = null; }
  function showNotFound() {
    hideNotFound();
    routeNotFound = document.createElement('aside');
    routeNotFound.className = 'wallpaper-route-not-found';
    routeNotFound.setAttribute('role', 'alert');
    routeNotFound.innerHTML = '<strong>Wallpaper unavailable</strong><span>This wallpaper may have been removed or is not public.</span><a class="button button--small" href="/">Back to home</a>';
    document.body.append(routeNotFound);
    document.title = 'Wallpaper not found | Wallverse';
  }
  function closeForHistory() {
    const viewer = inspection();
    if (!viewer?.isOpen?.()) return;
    ignoreInspectionClose = true;
    viewer.close();
  }
  function present(wallpaper) {
    const viewer = inspection();
    if (!viewer?.open) return;
    hideNotFound();
    const canonicalPath = wallpaperPath(wallpaper);
    if (`${window.location.pathname}${window.location.search}` !== canonicalPath) {
      history.replaceState({ ...(history.state || {}), wallverseWallpaper: true, wallpaperId: wallpaper.id }, '', canonicalPath);
    }
    updateSeo(wallpaper);
    viewer.open(wallpaper);
  }
  function openCurrentRoute() {
    if (!isWallpaperRoute()) { hideNotFound(); restoreSeo(); closeForHistory(); return; }
    const wallpaper = findWallpaper();
    if (wallpaper) present(wallpaper);
    else if (Array.isArray(window.WallversePublicCatalog)) { restoreSeo(); closeForHistory(); showNotFound(); }
  }
  function bootstrapDirectRoute() {
    if (!isWallpaperRoute() || history.state?.wallverseWallpaper) return;
    const route = `${window.location.pathname}${window.location.search}`;
    history.replaceState({ wallverseBase: true }, '', '/');
    history.pushState({ wallverseWallpaper: true }, '', route);
  }
  function navigate(wallpaper) {
    const target = wallpaperPath(wallpaper);
    if (`${window.location.pathname}${window.location.search}` !== target) history.pushState({ wallverseWallpaper: true, wallpaperId: wallpaper.id }, '', target);
    present(wallpaper);
  }
  function onInspectionClosed() {
    if (ignoreInspectionClose) { ignoreInspectionClose = false; return; }
    if (isWallpaperRoute()) history.back();
    else restoreSeo();
  }

  window.WallverseWallpaperRouter = { navigate, onInspectionClosed, wallpaperPath };
  bootstrapDirectRoute();
  window.addEventListener('wallverse:catalog-ready', openCurrentRoute);
  window.addEventListener('wallverse:inspection-ready', openCurrentRoute);
  window.addEventListener('popstate', openCurrentRoute);
  openCurrentRoute();
})();
