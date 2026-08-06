(() => {
  const protectedVisuals = 'img, picture, .wallpaper-image, .collectible-card__media, .spotlight-card, .featured-card, .creator-spotlight, .profile-hero__visual, .app-promo__visual';
  const isProtectedImage = (target) => target instanceof Element && Boolean(target.closest(protectedVisuals));

  document.addEventListener('contextmenu', (event) => {
    if (isProtectedImage(event.target)) event.preventDefault();
  });

  document.addEventListener('dragstart', (event) => {
    if (isProtectedImage(event.target)) event.preventDefault();
  });

  const protectImage = (image) => { image.draggable = false; };
  const protectImages = () => document.querySelectorAll('img').forEach(protectImage);

  protectImages();
  new MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
    if (!(node instanceof Element)) return;
    if (node.matches('img')) protectImage(node);
    node.querySelectorAll?.('img').forEach(protectImage);
  }))).observe(document.documentElement, { childList: true, subtree: true });
})();
