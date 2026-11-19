// Breakless for YouTube (isolated world). On by default, like Prime Video and JioHotstar;
// does nothing while the YouTube switch in the popup is off.
//  * In the player: while YouTube marks an ad as playing (`.ad-showing`), clicks "Skip" as soon
//    as it appears, otherwise mutes the ad and jumps to its end (muted 16x if the jump is refused).
//    Each ad of a multi-ad break is handled in turn.
//  * On the page: hides ad slots (feed, sidebar, banner and masthead ads) with CSS. Nothing is
//    blocked on the network, so YouTube's own pages and requests keep working as normal.
(() => {
  const SC = window.__breakless;
  if (!SC || window.__breaklessYouTube) return;
  window.__breaklessYouTube = true;

  const PLAYERS = ['#movie_player', '.html5-video-player'];
  const VIDEOS = ['video.html5-main-video', 'video'];
  const SKIP = [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-slot button',
    'button[id^="skip-button"]',
  ];
  const REMAINING = ['.ytp-ad-duration-remaining', '[class*="ad-duration-remaining"]'];
  const OVERLAY_CLOSE = ['.ytp-ad-overlay-close-button', '.ytp-ad-overlay-close-container'];
  const HIDE = [
    'ytd-ad-slot-renderer',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-promoted-video-renderer',
    'ytd-compact-promoted-video-renderer',
    'ytd-display-ad-renderer',
    'ytd-companion-slot-renderer',
    'ytd-action-companion-ad-renderer',
    'ytd-banner-promo-renderer',
    'ytd-video-masthead-ad-v3-renderer',
    'ytd-player-legacy-desktop-watch-ads-renderer',
    '#masthead-ad',
    '#player-ads',
    'ytd-rich-item-renderer:has(ytd-ad-slot-renderer)',
    '.ytp-ad-overlay-container',
    '.ytp-ad-image-overlay',
    'ytm-promoted-sparkles-web-renderer',
    'ytm-companion-ad-renderer',
    'ad-slot-renderer',
  ];

  const style = document.createElement('style');
  style.dataset.breakless = 'youtube';
  style.textContent = `${HIDE.join(',\n')} { display: none !important; }`;
  function applyCss() {
    const on = !!SC.settings.youtubeEnabled;
    if (on && !style.isConnected) (document.head || document.documentElement).appendChild(style);
    if (!on && style.isConnected) style.remove();
  }

  // Jumps end 0.25 s before the ad's end so YouTube finishes the ad itself and moves on.
  const ctrl = SC.createAdController('youtube', { maxSeek: 600, tail: 0.25 });
  let loop = 0;
  let lastSkipClick = 0;
  let contentSrc = ''; // what the player was showing before the ad
  let adSeenAt = 0;

  const first = (root, sels) => {
    for (const sel of sels) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  };

  function adShowing(player) {
    return player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting');
  }

  function remainingOf(player, video) {
    for (const sel of REMAINING) {
      for (const el of player.querySelectorAll(sel)) {
        if (!SC.isVisible(el)) continue;
        const r = SC.parseClock(el.textContent);
        if (r != null) return r;
      }
    }
    // Most YouTube ads play as their own short video: what is left of it is the ad.
    // Only trusted once the player has actually switched away from the video being watched,
    // so the real video is never jumped.
    const d = video.duration;
    const ownMedia = video.currentSrc && video.currentSrc !== contentSrc;
    if (ownMedia && Number.isFinite(d) && d > 0 && d <= 300) return Math.max(0, d - video.currentTime);
    return null;
  }

  function clickSkip(player) {
    const now = performance.now();
    if (now - lastSkipClick < 500) return false;
    for (const sel of SKIP) {
      for (const el of player.querySelectorAll(sel)) {
        if (SC.isVisible(el)) {
          el.click();
          lastSkipClick = now;
          SC.log('youtube', 'clicked Skip');
          return true;
        }
      }
    }
    return false;
  }

  function closeOverlays(player) {
    for (const sel of OVERLAY_CLOSE) {
      const el = player.querySelector(sel);
      if (el && SC.isVisible(el)) el.click();
    }
  }

  function tick() {
    applyCss();
    if (!SC.settings.youtubeEnabled) {
      ctrl.reset();
      return;
    }
    const player = first(document, PLAYERS);
    if (!player) return ctrl.idle();
    const video = first(player, VIDEOS);
    if (!video) return ctrl.idle();
    closeOverlays(player);
    if (!adShowing(player)) {
      if (video.currentSrc) contentSrc = video.currentSrc;
      adSeenAt = 0;
      return ctrl.idle();
    }
    const now = performance.now();
    if (!adSeenAt) adSeenAt = now;
    clickSkip(player);
    const remaining = remainingOf(player, video);
    // The first moment of a break can still show the real video: only mute until the ad loads.
    const settling = remaining == null && video.currentSrc === contentSrc && now - adSeenAt < 1500;
    ctrl.during(video, remaining, settling ? { allowSeek: false, allowFast: false } : undefined);
  }

  // YouTube starts ads the moment a video opens, so this checks often (cheap class checks).
  function schedule() {
    loop = setTimeout(() => {
      try { tick(); } catch (e) { SC.log('tick error', e); }
      schedule();
    }, ctrl.active ? 60 : 250);
  }

  SC.onSettings(applyCss);
  SC.ready.then(() => {
    applyCss();
    if (!loop) schedule();
  });
})();
