(() => {
  const start = () => {
    const config = window.WALLVERSE_PUBLIC_CONFIG;
    const dialog = document.getElementById('upload-dialog');
    if (!config || !dialog || !window.supabase?.createClient) return false;

    const client = window.WallverseSupabase || window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const fileInput = document.getElementById('upload-file');
    const choose = document.getElementById('upload-choose');
    const picker = document.getElementById('upload-picker');
    const crop = document.getElementById('upload-crop');
    const stage = document.getElementById('upload-crop-stage');
    const image = document.getElementById('upload-crop-image');
    const zoom = document.getElementById('upload-zoom');
    const fields = document.getElementById('upload-fields');
    const status = document.getElementById('upload-status');
    const form = document.getElementById('upload-form');
    const tagInput = document.getElementById('upload-tag-input');
    const tagsNode = document.getElementById('upload-tags');
    const title = document.getElementById('upload-wallpaper-title');
    const description = document.getElementById('upload-description');
    const category = document.getElementById('upload-category');
    const submit = document.getElementById('upload-submit');
    const progress = document.getElementById('upload-progress');
    const progressTrack = document.getElementById('upload-progress-track');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressTitle = document.getElementById('upload-progress-title');
    const progressValue = document.getElementById('upload-progress-value');
    const progressDetail = document.getElementById('upload-progress-detail');

    let sourceFile;
    let natural = { width: 0, height: 0 };
    let scale = 1;
    let position = { x: 0, y: 0 };
    let drag;
    let tags = [];
    let titleTouched = false;
    let tagsTouched = false;
    let categoryTouched = false;
    let uploadProgress = 0;
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

    const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
    const setStatus = (text = '') => { status.textContent = text; };
    const resetProgress = () => {
      uploadProgress = 0;
      progress.hidden = true;
      progress.classList.remove('is-error', 'is-complete');
      progressBar.style.transform = 'scaleX(0)';
      progressTrack.setAttribute('aria-valuenow', '0');
      progressValue.textContent = '0%';
      progressTitle.textContent = 'Preparing your wallpaper';
      progressDetail.textContent = 'Your artwork is being prepared securely.';
    };
    const setProgress = (value, heading, detail, state = '') => {
      uploadProgress = Math.max(uploadProgress, clamp(value, 0, 100));
      const percent = Math.round(uploadProgress);
      progress.hidden = false;
      progress.classList.toggle('is-error', state === 'error');
      progress.classList.toggle('is-complete', state === 'complete');
      progressBar.style.transform = `scaleX(${uploadProgress / 100})`;
      progressTrack.setAttribute('aria-valuenow', String(percent));
      progressValue.textContent = `${percent}%`;
      progressTitle.textContent = heading;
      progressDetail.textContent = detail;
    };
    const normalizeTag = (value) => String(value || '').trim().toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '')
      .replace(/-+/g, '-').replace(/^-|-$/g, '');
    const baseScale = () => Math.max(stage.clientWidth / natural.width, stage.clientHeight / natural.height);
    const maxScale = () => Math.max(1, Math.min((stage.clientWidth / 585) / baseScale(), (stage.clientHeight / 1300) / baseScale(), 3));
    const constrain = () => {
      const renderedWidth = natural.width * baseScale() * scale;
      const renderedHeight = natural.height * baseScale() * scale;
      position.x = clamp(position.x, -(renderedWidth - stage.clientWidth) / 2, (renderedWidth - stage.clientWidth) / 2);
      position.y = clamp(position.y, -(renderedHeight - stage.clientHeight) / 2, (renderedHeight - stage.clientHeight) / 2);
    };
    const drawCrop = () => {
      constrain();
      stage.style.setProperty('--crop-scale', scale);
      stage.style.setProperty('--crop-x', `${position.x}px`);
      stage.style.setProperty('--crop-y', `${position.y}px`);
      zoom.max = String(maxScale());
      zoom.value = String(scale);
    };
    const renderTags = () => tagsNode.replaceChildren(...tags.map((tag) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.textContent = `${tag} \u00d7`;
      node.addEventListener('click', () => { tagsTouched = true; tags = tags.filter((value) => value !== tag); renderTags(); });
      return node;
    }));
    const reset = () => {
      sourceFile = null;
      tags = [];
      title.value = '';
      description.value = '';
      category.value = 'Anime';
      titleTouched = tagsTouched = categoryTouched = false;
      picker.hidden = false;
      crop.hidden = true;
      fields.hidden = true;
      fileInput.value = '';
      setStatus();
      resetProgress();
      renderTags();
    };
    const addTag = (raw) => {
      const tag = normalizeTag(raw);
      if (!tag) return;
      if (tag.length < 2 || tag.length > 32) return setStatus('Tags must be 2\u201332 characters.');
      if (['ai-generated', 'ai', 'suggestive', 'nsfw'].includes(tag)) return setStatus('Use the dedicated content toggles instead.');
      if (tags.includes(tag)) return;
      if (tags.length === 15) return setStatus('Use 15 tags maximum.');
      tagsTouched = true;
      tags.push(tag);
      tagInput.value = '';
      setStatus();
      renderTags();
    };
    const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    const hasWebpSignature = async (blob) => {
      const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
      return bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    };
    const encodePreferred = async (canvas, quality) => {
      const jpeg = await toBlob(canvas, 'image/jpeg', quality);
      if (!jpeg) throw new Error('Could not encode crop.');
      try {
        const jpegSource = await toBlob(canvas, 'image/jpeg', 1);
        if (!jpegSource || !window.createImageBitmap) return { blob: jpeg, contentType: 'image/jpeg' };
        const bitmap = await createImageBitmap(jpegSource);
        const webpCanvas = document.createElement('canvas');
        webpCanvas.width = canvas.width;
        webpCanvas.height = canvas.height;
        webpCanvas.getContext('2d').drawImage(bitmap, 0, 0);
        bitmap.close?.();
        const webp = await toBlob(webpCanvas, 'image/webp', quality);
        if (webp && webp.size <= jpeg.size && await hasWebpSignature(webp)) return { blob: webp, contentType: 'image/webp' };
      } catch { /* JPEG is the supported fallback, matching Android. */ }
      return { blob: jpeg, contentType: 'image/jpeg' };
    };
    const blobToBase64 = async (blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let text = '';
      for (let index = 0; index < bytes.length; index += 0x8000) text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      return btoa(text);
    };
    const sha256 = async (blob) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const output = async (maxWidth = 1260, quality = .85, preferWebp = true) => {
      const factor = baseScale() * scale;
      const sourceWidth = stage.clientWidth / factor;
      const sourceHeight = stage.clientHeight / factor;
      const sourceX = natural.width / 2 - sourceWidth / 2 - position.x / factor;
      const sourceY = natural.height / 2 - sourceHeight / 2 - position.y / factor;
      const ratio = Math.min(1, maxWidth / sourceWidth);
      const width = Math.floor(sourceWidth * ratio);
      const height = Math.floor(sourceHeight * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
      const encoded = preferWebp ? await encodePreferred(canvas, quality) : { blob: await toBlob(canvas, 'image/jpeg', quality), contentType: 'image/jpeg' };
      if (!encoded.blob) throw new Error('Could not encode crop.');
      return { ...encoded, width, height, canvas };
    };
    const invoke = async (name, body) => {
      const { data, error } = await client.functions.invoke(name, { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error.code || 'Service error');
      return data;
    };
    const putUpload = (upload, blob, onProgress) => new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('PUT', upload.uploadUrl, true);
      request.timeout = 120000;
      Object.entries(upload.requiredHeaders || {}).forEach(([key, value]) => request.setRequestHeader(key, String(value)));
      request.upload.addEventListener('progress', (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); });
      request.addEventListener('load', () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`Cloudflare rejected the upload (${request.status}).`)));
      request.addEventListener('error', () => reject(new Error('Could not reach Cloudflare. Please try again.')));
      request.addEventListener('timeout', () => reject(new Error('The upload timed out. Please try again.')));
      request.send(blob);
    });
    const suggestMetadata = async () => {
      if (!sourceFile) return;
      const aiTitle = document.getElementById('upload-ai-title');
      const aiCopy = document.getElementById('upload-ai-copy');
      const retry = document.getElementById('upload-ai-retry');
      aiTitle.textContent = 'Generating metadata\u2026';
      aiCopy.textContent = 'Wallverse AI is suggesting a title, category and tags.';
      retry.hidden = true;
      try {
        const preview = await output(768, .75, false);
        const hash = await sha256(sourceFile);
        let data = await invoke('generate-wallpaper-metadata', { imageHash: hash, lookupOnly: true });
        if (data.cacheMiss) data = await invoke('generate-wallpaper-metadata', { imageHash: hash, imageBase64: await blobToBase64(preview.blob), contentType: 'image/jpeg' });
        if (!titleTouched && !title.value.trim() && data.titleSuggestions?.[0]) title.value = data.titleSuggestions[0];
        if (!tagsTouched && !tags.length) { tags = (data.tags || []).map(normalizeTag).filter((tag) => tag.length >= 2 && tag.length <= 32).slice(0, 15); renderTags(); }
        if (!categoryTouched && data.category && [...category.options].some((option) => option.value === data.category)) category.value = data.category;
        aiTitle.textContent = 'Metadata suggestions ready';
        aiCopy.textContent = 'Review the AI suggestions before you submit.';
      } catch (error) {
        console.warn('Metadata suggestion unavailable.', error);
        aiTitle.textContent = 'Metadata suggestions unavailable';
        aiCopy.textContent = 'You can continue manually.';
        retry.hidden = false;
      }
    };
    const selectFile = async (file) => {
      if (!file) return;
      const type = file.type || (file.name.endsWith('.webp') ? 'image/webp' : file.name.match(/\.png$/i) ? 'image/png' : 'image/jpeg');
      if (!allowedTypes.has(type)) return setStatus('Choose a JPG, PNG or WebP image.');
      const url = URL.createObjectURL(file);
      image.onload = async () => {
        URL.revokeObjectURL(url);
        natural = { width: image.naturalWidth, height: image.naturalHeight };
        if (natural.width < 585 || natural.height < 1300) return setStatus('Image is too small. Minimum cropped size is 585 × 1300.');
        sourceFile = file;
        scale = 1;
        position = { x: 0, y: 0 };
        picker.hidden = true;
        crop.hidden = false;
        fields.hidden = false;
        resetProgress();
        drawCrop();
        setStatus('Crop ready. Metadata suggestions are being generated\u2026');
        suggestMetadata();
      };
      image.onerror = () => setStatus('This image could not be read.');
      image.src = url;
    };
    const open = async () => {
      const { data } = await client.auth.getUser();
      if (!data.user) return document.getElementById('auth-trigger')?.click();
      if (!dialog.open) dialog.showModal();
    };
    const upload = async (event) => {
      event.preventDefault();
      if (!sourceFile) return setStatus('Choose a wallpaper image first.');
      const normalized = tags.map(normalizeTag).filter(Boolean);
      if (title.value.trim().length < 2) return setStatus('Add a title of at least 2 characters.');
      if (normalized.length < 3) return setStatus('Add at least 3 tags.');
      resetProgress();
      setStatus('');
      setProgress(6, 'Preparing your wallpaper', 'Optimizing your 9:20 artwork for Wallverse.');
      let hd;
      try {
        hd = await output();
        if (hd.width < 585 || hd.height < 1300) return setStatus('Crop is too small. Minimum is 585 × 1300.');
        if (hd.blob.size > 4 * 1024 * 1024) return setStatus('Crop is too large. Try a simpler image or smaller crop.');
      } catch (error) { return setStatus(error.message || 'Could not prepare this image.'); }
      const quality = hd.width >= 1260 && hd.height >= 2800 ? 'premium' : hd.width >= 1080 && hd.height >= 2400 ? 'high' : 'standard';
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = Math.min(320, hd.width);
      thumbCanvas.height = Math.round(hd.height * thumbCanvas.width / hd.width);
      thumbCanvas.getContext('2d').drawImage(hd.canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
      const thumbnail = await encodePreferred(thumbCanvas, .8);
      const thumb = thumbnail.blob;
      if (thumb.size > 1024 * 1024) return setStatus('Thumbnail is too large. Try a different image.');
      const wallpaperId = crypto.randomUUID();
      submit.disabled = true;
      dialog.setAttribute('aria-busy', 'true');
      try {
        setProgress(18, 'Preparing HD upload', 'Creating a secure upload for your artwork.');
        const hdUpload = await invoke('create-r2-upload', { wallpaperId, variant: 'hd', contentType: hd.contentType, contentLength: hd.blob.size });
        setProgress(20, 'Uploading HD artwork', 'Sending the full-quality file securely.');
        await putUpload(hdUpload, hd.blob, (fraction) => setProgress(20 + fraction * 36, 'Uploading HD artwork', 'Sending the full-quality file securely.'));
        setProgress(60, 'Preparing preview', 'Creating the lightweight wallpaper preview.');
        const thumbUpload = await invoke('create-r2-upload', { wallpaperId, variant: 'thumbnail', contentType: thumbnail.contentType, contentLength: thumb.size });
        setProgress(64, 'Uploading preview', 'Sending the optimized preview.');
        await putUpload(thumbUpload, thumb, (fraction) => setProgress(64 + fraction * 20, 'Uploading preview', 'Sending the optimized preview.'));
        setProgress(90, 'Finalizing submission', 'Verifying your files and saving your submission.');
        await invoke('finalize-r2-upload', { wallpaperId, title: title.value.trim(), description: description.value.trim(), category: category.value, tags: normalized, width: hd.width, height: hd.height, fileSize: hd.blob.size, quality, isAi: document.getElementById('upload-is-ai').checked, isSuggestive: document.getElementById('upload-is-suggestive').checked });
        setProgress(100, 'Submitted for review', 'Your wallpaper is safely queued for moderation.', 'complete');
        window.setTimeout(() => { dialog.close(); reset(); }, 1800);
      } catch (error) {
        console.error('Wallpaper upload failed.', error);
        invoke('delete-r2-media', { wallpaperId, mode: 'cancel_upload' }).catch(() => {});
        setProgress(uploadProgress, 'Upload could not be completed', 'No wallpaper was published. Review the error and try again.', 'error');
        setStatus(error.message || 'Upload failed. Please try again.');
      } finally {
        submit.disabled = false;
        dialog.removeAttribute('aria-busy');
      }
    };

    document.querySelectorAll('[data-open-upload]').forEach((button) => button.addEventListener('click', open));
    document.querySelector('[data-close-upload]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    choose.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => selectFile(fileInput.files?.[0]));
    zoom.addEventListener('input', () => { scale = Number(zoom.value); drawCrop(); });
    document.getElementById('upload-zoom-in').addEventListener('click', () => { scale = clamp(scale + .1, 1, maxScale()); drawCrop(); });
    document.getElementById('upload-zoom-out').addEventListener('click', () => { scale = clamp(scale - .1, 1, maxScale()); drawCrop(); });
    stage.addEventListener('pointerdown', (event) => { drag = { x: event.clientX, y: event.clientY, px: position.x, py: position.y }; stage.setPointerCapture(event.pointerId); });
    stage.addEventListener('pointermove', (event) => { if (!drag) return; position = { x: drag.px + event.clientX - drag.x, y: drag.py + event.clientY - drag.y }; drawCrop(); });
    stage.addEventListener('pointerup', () => { drag = null; });
    tagInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addTag(tagInput.value); } });
    title.addEventListener('input', () => { titleTouched = true; });
    category.addEventListener('change', () => { categoryTouched = true; });
    document.getElementById('upload-ai-retry').addEventListener('click', suggestMetadata);
    form.addEventListener('submit', upload);
    if (new URLSearchParams(window.location.search).get('upload') === '1') window.setTimeout(open, 350);
    return true;
  };
  if (!start()) window.addEventListener('wallverse:data-ready', start, { once: true });
})();
