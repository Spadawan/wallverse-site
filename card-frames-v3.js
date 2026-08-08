(() => {
  const supported = new Set(['neonrounded', 'neongradient', 'cyberpunk', 'electric']);
  const aliases = new Map([
    ['defaultframe', 'default'],
    ['frameneonrounded', 'neonrounded'],
    ['frameneongradient', 'neongradient'],
    ['framecyberpunk', 'cyberpunk'],
    ['frameelectric', 'electric'],
  ]);

  function frameCandidates(value) {
    if (value && typeof value === 'object') {
      const nestedFrame = value.frame && typeof value.frame === 'object' ? value.frame : {};
      return [
        value.card_frame_type, value.card_frame_id, value.cardFrameType, value.cardFrameId,
        value.frame_type, value.frame_id, value.frameType, value.frameId,
        nestedFrame.type, nestedFrame.id, nestedFrame.name,
      ];
    }
    return [value];
  }

  function normalize(...values) {
    for (const value of values) {
      for (const rawValue of frameCandidates(value)) {
        const candidate = String(rawValue || '').replace(/[^A-Za-z]/g, '').toLowerCase();
        if (supported.has(candidate)) return candidate;
        if (aliases.has(candidate)) return aliases.get(candidate);
        if (candidate.includes('neonrounded')) return 'neonrounded';
        if (candidate.includes('neongradient')) return 'neongradient';
        if (candidate.includes('cyberpunk')) return 'cyberpunk';
        if (candidate.includes('electric')) return 'electric';
      }
    }
    return 'default';
  }

  function label(value) {
    return ({ neonrounded: 'Neon Rounded', neongradient: 'Neon Gradient', cyberpunk: 'Cyberpunk', electric: 'Electric' })[normalize(value)] || 'Default';
  }

  function creatorRarity(profile = {}, stats = {}) {
    const role = String(profile.role || 'user').toLowerCase();
    if (role === 'admin') return 'mythic';
    if (role === 'moderator') return 'epic';
    const uploads = Number(stats.uploads ?? stats.approvedUploads) || 0;
    const likes = Number(stats.likes ?? stats.likesReceived) || 0;
    const downloads = Number(stats.downloads ?? stats.downloadsReceived) || 0;
    const followers = Number(stats.followers ?? profile.followers_count) || 0;
    const featured = Number(stats.featured ?? stats.featuredCount) || 0;
    const score = uploads * 18 + likes * 2 + downloads + followers * 8 + featured * 120 + (uploads >= 5 ? 80 : 0);
    if (score >= 5000) return 'mythic';
    if (score >= 1200) return 'epic';
    if (score >= 450) return 'rare';
    if (score >= 120 || uploads >= 3) return 'uncommon';
    return 'common';
  }

  function makeSkin(frame) {
    const skin = document.createElement('span');
    skin.className = 'card-frame-skin';
    skin.setAttribute('aria-hidden', 'true');
    skin.dataset.frame = frame;
    for (let index = 1; index <= 2; index += 1) {
      const tracer = document.createElement('i');
      tracer.className = `card-frame-skin__tracer card-frame-skin__tracer--${index}`;
      skin.append(tracer);
    }
    for (const position of ['top', 'right', 'bottom', 'left']) {
      const rail = document.createElement('i');
      rail.className = `card-frame-skin__rail card-frame-skin__rail--${position}`;
      skin.append(rail);
    }
    for (let index = 1; index <= 8; index += 1) {
      const spark = document.createElement('i');
      spark.className = `card-frame-skin__spark card-frame-skin__spark--${index}`;
      skin.append(spark);
    }
    for (let index = 1; index <= 4; index += 1) {
      const plate = document.createElement('i');
      plate.className = `card-frame-skin__plate card-frame-skin__plate--${index}`;
      skin.append(plate);
    }
    return skin;
  }

  function apply(card, ...values) {
    if (!card) return 'default';
    const frame = normalize(...values);
    [...card.classList].filter((name) => name.startsWith('frame--')).forEach((name) => card.classList.remove(name));
    card.querySelector(':scope > .card-frame-skin')?.remove();
    card.dataset.cardFrame = frame;
    if (frame !== 'default') {
      card.classList.add(`frame--${frame}`);
      card.append(makeSkin(frame));
    }
    return frame;
  }

  function applyAvatar(avatar, frameValue, rarity = 'common') {
    if (!avatar) return 'default';
    const frame = normalize(frameValue);
    [...avatar.classList].filter((name) => name.startsWith('avatar-frame--') || name.startsWith('avatar-tier--')).forEach((name) => avatar.classList.remove(name));
    avatar.classList.toggle('avatar-frame', frame !== 'default');
    avatar.dataset.avatarFrame = frame;
    avatar.dataset.avatarRarity = rarity;
    if (frame === 'default') {
      const previousContent = avatar.querySelector(':scope > .avatar-frame__content');
      if (previousContent) {
        while (previousContent.firstChild) avatar.insertBefore(previousContent.firstChild, previousContent);
        previousContent.remove();
      }
      return frame;
    }
    avatar.classList.add(`avatar-frame--${frame}`, `avatar-tier--${rarity}`);
    let content = avatar.querySelector(':scope > .avatar-frame__content');
    if (!content) {
      content = document.createElement('span');
      content.className = 'avatar-frame__content';
      while (avatar.firstChild) content.append(avatar.firstChild);
      avatar.append(content);
    }
    return frame;
  }

  window.WallverseCardFrames = Object.freeze({ apply, applyAvatar, creatorRarity, label, normalize, supported: [...supported] });
})();
