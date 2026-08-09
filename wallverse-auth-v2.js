(() => {
  const config = window.WALLVERSE_PUBLIC_CONFIG;
  const supabaseApi = window.supabase;
  if (!config || !supabaseApi?.createClient) return;

  const client = window.WallverseSupabase || supabaseApi.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const authDialog = document.getElementById('auth-dialog');
  const authForm = document.getElementById('auth-form');
  const authTrigger = document.getElementById('auth-trigger');
  const accountMenu = document.getElementById('account-menu');
  const accountMenuTrigger = document.getElementById('account-menu-trigger');
  const accountMenuPanel = document.getElementById('account-menu-panel');
  const message = document.getElementById('auth-message');
  const usernameInput = document.getElementById('auth-username');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const authSubmit = document.getElementById('auth-submit');
  const authReset = document.getElementById('auth-reset');
  const authSignUp = document.getElementById('auth-sign-up');
  const googleSignIn = document.getElementById('google-sign-in');
  let mode = 'sign-in';
  let currentUser = null;
  let currentProfile = null;

  function redirectUrl() { return `${window.location.origin}/`; }
  function setMessage(target, text = '') { target.textContent = text; target.hidden = !text; }
  function avatar(node, profile) {
    const username = profile?.username || currentUser?.email?.split('@')[0] || 'W';
    node.textContent = username.charAt(0).toUpperCase();
    node.replaceChildren(document.createTextNode(node.textContent));
    window.WallverseAvatarCrop?.apply(node, profile);
    const rarity = window.WallverseCardFrames?.creatorRarity(profile) || 'common';
    window.WallverseCardFrames?.applyAvatar?.(node, profile?.avatar_frame_type, rarity);
    if (!profile?.avatar_url) return;
    const image = new Image();
    image.className = 'avatar__image'; image.alt = ''; image.src = profile.avatar_url;
    image.onload = () => { node.replaceChildren(image); window.WallverseCardFrames?.applyAvatar?.(node, profile?.avatar_frame_type, rarity); };
  }
  function displayName() { return currentProfile?.username || currentUser?.user_metadata?.username || 'Profile'; }
  function setMode(nextMode) {
    mode = nextMode;
    const recovering = mode === 'recovery';
    const signingUp = mode === 'sign-up';
    usernameInput.closest('label').hidden = !signingUp;
    usernameInput.required = signingUp;
    emailInput.closest('label').hidden = recovering;
    emailInput.required = !recovering;
    passwordInput.autocomplete = recovering || signingUp ? 'new-password' : 'current-password';
    document.getElementById('auth-title').textContent = recovering ? 'Choose a new password.' : signingUp ? 'Create your account.' : 'Welcome back.';
    document.getElementById('auth-description').textContent = recovering ? 'Choose a new password for your Wallverse account.' : signingUp ? 'Create an account to collect, save and share wallpapers.' : 'Sign in to access your Wallverse profile.';
    authSubmit.textContent = recovering ? 'Set new password' : signingUp ? 'Create account' : 'Sign in';
    authReset.hidden = recovering || signingUp;
    authSignUp.hidden = recovering;
    authSignUp.textContent = signingUp ? 'Already have an account?' : 'Create an account';
    googleSignIn.hidden = recovering;
    setMessage(message);
  }
  function openAuth() { setMode('sign-in'); authDialog.showModal(); emailInput.focus(); }
  async function fetchProfile(user) {
    const { data, error } = await client.from('profiles').select('id,username,role,avatar_url,avatar_crop_x,avatar_crop_y,avatar_crop_scale,avatar_crop_rotation,followers_count').eq('id', user.id).maybeSingle();
    if (error) throw error;
    return data;
  }
  async function ensureProfile(user) {
    const existing = await fetchProfile(user);
    if (existing) return existing;
    const preferred = String(user.user_metadata?.username || user.email?.split('@')[0] || 'user').replace(/[^A-Za-z0-9_]/g, '').slice(0, 14);
    const username = /^[A-Za-z0-9_]{3,20}$/.test(preferred) ? preferred : `user_${user.id.slice(0, 6)}`;
    const { error } = await client.from('profiles').insert({ id: user.id, username });
    if (error) throw error;
    return fetchProfile(user);
  }
  async function renderProfile(user) {
    currentUser = user || null;
    currentProfile = null;
    authTrigger.hidden = Boolean(user);
    document.querySelectorAll('[data-open-auth]').forEach((button) => { button.hidden = Boolean(user); });
    document.querySelectorAll('[data-open-upload]').forEach((button) => { button.hidden = !user; });
    accountMenu.hidden = !user;
    document.documentElement.dataset.authenticated = user ? 'true' : 'false';
    if (!user) return;
    try { currentProfile = await ensureProfile(user); } catch (error) { console.error('Profile load failed', error); }
    const name = displayName();
    document.getElementById('account-name').textContent = `@${name}`;
    avatar(document.getElementById('account-avatar'), currentProfile);
  }
  async function submitAuth(event) {
    event.preventDefault();
    const email = emailInput.value.trim(); const password = passwordInput.value;
    setMessage(message); authSubmit.disabled = true;
    try {
      if (mode === 'recovery') {
        const { error } = await client.auth.updateUser({ password }); if (error) throw error;
        setMessage(message, 'Password updated. You can now sign in.'); setMode('sign-in'); return;
      }
      if (mode === 'sign-up') {
        const username = usernameInput.value.trim();
        if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) throw new Error('Username must be 3–20 characters and use only letters, numbers, or underscores.');
        const { data: existing, error: usernameError } = await client.from('profiles').select('id').ilike('username', username).maybeSingle();
        if (usernameError) throw usernameError;
        if (existing) throw new Error('Username is already taken.');
        const { data, error } = await client.auth.signUp({ email, password, options: { data: { username } } });
        if (error) throw error;
        if (data.session) { authDialog.close(); return; }
        setMode('sign-in');
        setMessage(message, 'Account created. Check your email to confirm your account, then sign in.');
        return;
      }
      const { error } = await client.auth.signInWithPassword({ email, password }); if (error) throw error; authDialog.close();
    } catch (error) { setMessage(message, error.message || 'Authentication failed. Please try again.'); }
    finally { authSubmit.disabled = false; }
  }
  authForm.addEventListener('submit', submitAuth);
  authTrigger.addEventListener('click', openAuth);
  document.querySelectorAll('[data-open-auth]').forEach((button) => button.addEventListener('click', openAuth));
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
  authReset.addEventListener('click', async () => {
    const email = emailInput.value.trim(); if (!email) { setMessage(message, 'Enter your email address first.'); emailInput.focus(); return; }
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
    setMessage(message, error ? error.message : 'Check your email for a password reset link.');
  });
  authSignUp.addEventListener('click', () => setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up'));
  googleSignIn.addEventListener('click', async () => {
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl() } });
    if (error) setMessage(message, error.message);
  });
  accountMenuTrigger.addEventListener('click', () => { const open = accountMenuPanel.hidden; accountMenuPanel.hidden = !open; accountMenuTrigger.setAttribute('aria-expanded', String(open)); });
  document.querySelector('[data-open-profile]').addEventListener('click', () => { window.location.assign('/profile/'); });
  document.querySelector('[data-sign-out]').addEventListener('click', async () => { await client.auth.signOut(); accountMenuPanel.hidden = true; });
  client.auth.onAuthStateChange((event, session) => { if (event === 'PASSWORD_RECOVERY') { authDialog.showModal(); setMode('recovery'); } window.setTimeout(() => renderProfile(session?.user), 0); });
  client.auth.getSession().then(({ data }) => renderProfile(data.session?.user)).catch(() => renderProfile(null));
})();
