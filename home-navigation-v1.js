(() => {
  const url = new URL(window.location.href);
  if (url.searchParams.get('home') !== '1') return;

  // The browser can restore the previous, long-feed scroll position when
  // navigating to /. A logo click always represents a fresh visit to the top.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const scrollHome = () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  scrollHome();
  window.requestAnimationFrame(() => window.requestAnimationFrame(scrollHome));
  window.addEventListener('pageshow', scrollHome, { once: true });

  url.searchParams.delete('home');
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
})();
