const SHORT_ID_PATTERN = /^[a-f0-9]{8}$/i;

export function onRequestGet(context) {
  const shortId = String(context.params.shortId || '').toLowerCase();

  if (!SHORT_ID_PATTERN.test(shortId)) {
    return new Response('Wallpaper link not found.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  // The client resolves this safe ID against the approved public catalog, then
  // replaces the placeholder slug with the canonical title-based URL.
  const target = new URL(`/wallpaper/wallpaper-${shortId}`, context.request.url);
  return new Response(null, {
    status: 302,
    headers: { Location: target.toString(), 'Cache-Control': 'no-store' },
  });
}
