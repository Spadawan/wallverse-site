(() => {
  function openCreator(profile) {
    if (!profile?.id) return;
    const destination = new URL('/creator/', window.location.origin);
    destination.searchParams.set('id', profile.id);
    window.location.assign(destination.href);
  }

  window.WallverseOpenCreator = openCreator;
  window.addEventListener('wallverse:creator-inspect', (event) => openCreator(event.detail?.profile));
})();
