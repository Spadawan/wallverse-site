(() => {
  // Keep routing independent from the feed script's cache version. The detail
  // viewer and data helpers can finish loading after this deferred script.
  const helpers = () => window.WallverseCards || {};
  const inspection = () => window.WallverseInspection;

  const directWallpaper = /^\/wallpaper\//.test(window.location.pathname);
  const homeTitle = 'Smartphone & Android Wallpapers | Wallverse';
  const homeDescription = 'Discover smartphone and Android wallpapers on Wallverse. Explore anime, gaming, nature and space backgrounds, find your style and view HD download options.';
  const defaultSeo = {
    title: directWallpaper ? homeTitle : document.title,
    description: directWallpaper ? homeDescription : document.querySelector('meta[name="description"]')?.content || '',
    canonical: directWallpaper ? `${window.location.origin}/` : document.querySelector('link[rel="canonical"]')?.href || window.location.href,
    ogTitle: directWallpaper ? homeTitle : document.querySelector('meta[property="og:title"]')?.content || document.title,
    ogDescription: directWallpaper ? homeDescription : document.querySelector('meta[property="og:description"]')?.content || '',
    ogImage: directWallpaper ? `${window.location.origin}/assets/app-showcase.webp` : document.querySelector('meta[property="og:image"]')?.content || '',
    ogUrl: directWallpaper ? `${window.location.origin}/` : document.querySelector('meta[property="og:url"]')?.content || window.location.href,
    robots: directWallpaper ? 'index,follow,max-image-preview:large' : document.querySelector('meta[name="robots"]')?.content || 'index,follow,max-image-preview:large',
  };
  let ignoreInspectionClose = false;
  let routeNotFound;
  let routeAttempt = 0;

  function feedState() {
    const value = (id) => document.getElementById(id)?.value || '';
    return {
      search: value('feed-search'), rarity: value('feed-rarity'), category: value('feed-category'),
      quality: value('feed-quality'), sort: document.querySelector('.collection-sort__button.is-active')?.id || '',
      scrollY: window.scrollY,
    };
  }
  function restoreFeedState() {
    const state = history.state?.wallverseFeedState;
    if (!state) return;
    const setValue = (id, value, eventName) => {
      const field = document.getElementById(id);
      if (!field || field.value === value) return;
      field.value = value;
      field.dispatchEvent(new Event(eventName, { bubbles: true }));
    };
    setValue('feed-search', state.search || '', 'input');
    setValue('feed-rarity', state.rarity || 'all', 'change');
    setValue('feed-category', state.category || 'all', 'change');
    setValue('feed-quality', state.quality || 'all', 'change');
    const sort = document.getElementById(state.sort);
    if (sort && !sort.classList.contains('is-active')) sort.click();
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.scrollTo({ top: Number(state.scrollY) || 0, behavior: 'instant' })));
  }
  function revealHome() {
    const home = document.querySelector('#main-content[data-seo-home]');
    if (!home) return;
    home.removeAttribute('hidden');
    home.removeAttribute('data-seo-home');
  }

  function isWallpaperRoute() { return /^\/wallpaper\/[^/]+\/?$/.test(window.location.pathname); }
  function wallpaperPath(wallpaper) {
    const title = String(wallpaper?.title || 'wallpaper').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'wallpaper';
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
    const image = wallpaper.is_suggestive ? `${window.location.origin}/assets/app-showcase.webp` : helpers().thumbnailUrl?.(wallpaper) || '';
    document.title = `${title} — Phone Wallpaper | Wallverse`;
    meta('meta[name="robots"]', { name: 'robots' }, wallpaper.is_suggestive ? 'noindex,follow' : 'index,follow,max-image-preview:large');
    meta('meta[name="twitter:title"]', { name: 'twitter:title' }, document.title);
    meta('meta[name="twitter:description"]', { name: 'twitter:description' }, description);
    meta('meta[name="twitter:image"]', { name: 'twitter:image' }, image);
    document.getElementById('wallpaper-schema')?.remove();
    const schema = document.createElement('script');
    schema.id = 'wallpaper-schema'; schema.type = 'application/ld+json';
    schema.textContent = JSON.stringify({'@context':'https://schema.org','@type':'WebPage',name:document.title,description,url,...(!wallpaper.is_suggestive && image ? {primaryImageOfPage:{'@type':'ImageObject',contentUrl:image,name:title}} : {})});
    document.head.append(schema);
    meta('meta[name="description"]', { name: 'description' }, description);
    meta('meta[property="og:title"]', { property: 'og:title' }, document.title);
    meta('meta[property="og:description"]', { property: 'og:description' }, description);
    meta('meta[property="og:image"]', { property: 'og:image' }, image);
    meta('meta[property="og:url"]', { property: 'og:url' }, url);
    canonical(url);
  }
  function restoreSeo() {
    document.getElementById('wallpaper-schema')?.remove();
    document.getElementById('wallpaper-seo-content')?.remove();
    revealHome();
    document.title = defaultSeo.title;
    meta('meta[name="robots"]', { name: 'robots' }, defaultSeo.robots);
    meta('meta[name="twitter:title"]', { name: 'twitter:title' }, defaultSeo.ogTitle);
    meta('meta[name="twitter:description"]', { name: 'twitter:description' }, defaultSeo.ogDescription);
    meta('meta[name="twitter:image"]', { name: 'twitter:image' }, defaultSeo.ogImage);
    meta('meta[name="description"]', { name: 'description' }, defaultSeo.description);
    meta('meta[property="og:title"]', { property: 'og:title' }, defaultSeo.ogTitle);
    meta('meta[property="og:description"]', { property: 'og:description' }, defaultSeo.ogDescription);
    meta('meta[property="og:image"]', { property: 'og:image' }, defaultSeo.ogImage);
    meta('meta[property="og:url"]', { property: 'og:url' }, defaultSeo.ogUrl);
    canonical(defaultSeo.canonical);
  }
  function hideNotFound() { routeNotFound?.remove(); routeNotFound = null; }
  function serverDescription() {
    return document.querySelector('#wallpaper-seo-content .wallpaper-seo-description')?.textContent?.trim() || '';
  }
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
    if (!String(wallpaper.description || '').trim()) {
      const description = serverDescription();
      if (description) wallpaper = { ...wallpaper, description };
    }
    document.getElementById('wallpaper-seo-content')?.remove();
    hideNotFound();
    const canonicalPath = wallpaperPath(wallpaper);
    if (`${window.location.pathname}${window.location.search}` !== canonicalPath) {
      history.replaceState({ ...(history.state || {}), wallverseWallpaper: true, wallpaperId: wallpaper.id }, '', canonicalPath);
    }
    updateSeo(wallpaper);
    viewer.open(wallpaper);
  }
  async function openCurrentRoute() {
    const attempt = ++routeAttempt;
    if (!isWallpaperRoute()) { hideNotFound(); restoreSeo(); closeForHistory(); restoreFeedState(); return; }
    const wallpaper = findWallpaper();
    if (wallpaper) { present(wallpaper); return; }
    if (!Array.isArray(window.WallversePublicCatalog)) return;
    const shortId = shortIdFromRoute();
    const fetchSharedWallpaper = helpers().fetchSharedWallpaper;
    if (!shortId || typeof fetchSharedWallpaper !== 'function') { restoreSeo(); closeForHistory(); showNotFound(); return; }
    try {
      const sharedWallpaper = await fetchSharedWallpaper(shortId);
      if (attempt !== routeAttempt || !isWallpaperRoute() || shortIdFromRoute() !== shortId) return;
      if (sharedWallpaper) { present(sharedWallpaper); return; }
    } catch (error) {
      console.warn('Shared wallpaper could not be resolved.', error);
    }
    if (attempt !== routeAttempt || !isWallpaperRoute()) return;
    restoreSeo(); closeForHistory(); showNotFound();
  }
  function bootstrapDirectRoute() {
    if (!isWallpaperRoute() || history.state?.wallverseWallpaper) return;
    const route = `${window.location.pathname}${window.location.search}`;
    history.replaceState({ wallverseBase: true }, '', '/');
    history.pushState({ wallverseWallpaper: true }, '', route);
  }
  function navigate(wallpaper) {
    const target = wallpaperPath(wallpaper);
    if (`${window.location.pathname}${window.location.search}` !== target) {
      history.replaceState({ ...(history.state || {}), wallverseFeedState: feedState() }, '', window.location.href);
      history.pushState({ wallverseWallpaper: true, wallpaperId: wallpaper.id }, '', target);
    }
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
