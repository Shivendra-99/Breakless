// Breakless for JioHotstar (isolated world).
// Movies and shows: ends separately-played ad videos, jumps past ad breaks shown
// with an "Ad" countdown, and hides ad billboards. Live streams are only muted
// during a detected break (you can't skip ahead of a live stream).
(() => {
  const SC = window.__breakless;
  if (!SC || window.__breaklessHotstar) return;
  window.__breaklessHotstar = true;

  const AD_VIDEO = '#ad-video-container video, [id^="ad-video"] video, [data-testid^="ad-video"] video';
  const BILLBOARD_CSS = `
    div[data-testid^="bbtype-video"], div[data-testid^="bbtype-image"] { display: none !important; }
  `;

  const ctrl = SC.createAdController('hotstar', { maxSeek: 90, seekGapMs: 2000 });
  const handledAdVideos = new WeakSet();
  let styleEl = null;
  let loop = 0;

  function applyCss() {
    if (SC.settings.hotstarEnabled) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.textContent = BILLBOARD_CSS;
      }
      if (!styleEl.isConnected) (document.head || document.documentElement).appendChild(styleEl);
    } else if (styleEl) {
      styleEl.remove();
    }
  }

  const isAdVideo = (v) => !!v.closest('#ad-video-container, [id^="ad-video"], [data-testid^="ad-video"]');

  // 1) Ads played in their own <video> element: mute and jump to the end.
  function handleAdVideos() {
    let found = false;
    for (const v of document.querySelectorAll(AD_VIDEO)) {
      if (!SC.isVisible(v) && v.paused) continue;
      found = true;
      v.muted = true;
      const d = v.duration;
      if (Number.isFinite(d) && d > 0 && v.currentTime < d - 0.3) {
        try { v.currentTime = d - 0.05; } catch (_) {}
      } else if (!Number.isFinite(d)) {
        try { v.playbackRate = 16; } catch (_) {}
      }
      if (!handledAdVideos.has(v)) {
        handledAdVideos.add(v);
        SC.countSkip();
        SC.notice.done(v);
        SC.log('hotstar', 'ended a separate ad video');
      }
    }
    return found;
  }

  // 2) Ads inside the main video, signalled by an "Ad" badge with a countdown.
  function detectBadge() {
    const badge = document.querySelector('ad-badge-overlay');
    const timeEl = badge && badge.shadowRoot && badge.shadowRoot.querySelector('.ad-badge-overlay__content--time-display');
    if (timeEl && SC.isVisible(badge)) {
      return { how: 'badge', remaining: SC.parseClock(timeEl.textContent) };
    }
    return null;
  }

  function playerRootFor(video) {
    let el = video;
    for (let i = 0; i < 4 && el && el.parentElement; i++) el = el.parentElement;
    return el;
  }

  function tick() {
    applyCss();
    if (!SC.settings.hotstarEnabled) {
      ctrl.reset();
      return;
    }
    handleAdVideos();
    const video = SC.pickMainVideo(['video'], isAdVideo);
    if (!video) return ctrl.idle();
    let ad = detectBadge();
    if (!ad) {
      const label = SC.findAdLabel(playerRootFor(video));
      if (label) ad = { how: 'label', remaining: label.remaining };
    }
    if (!ad) return ctrl.idle();
    ctrl.during(video, ad.remaining);
  }

  function schedule() {
    loop = setTimeout(() => {
      try { tick(); } catch (e) { SC.log('tick error', e); }
      if (loop) schedule();
    }, ctrl.active ? 60 : 400);
  }

  function start() {
    applyCss();
    const check = () => {
      const has = !!document.querySelector('video');
      if (has && !loop) schedule();
      if (!has && loop) {
        clearTimeout(loop);
        loop = 0;
        ctrl.reset();
      }
    };
    check();
    setInterval(check, 1500);
  }

  SC.onSettings(applyCss);
  SC.ready.then(start);
})();
