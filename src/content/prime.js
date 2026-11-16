// Breakless for Prime Video (isolated world).
// Watches the web player for an ad break and gets through it:
// clicks Skip when Amazon offers it, jumps forward by the remaining ad time,
// and plays whatever is left muted at 16x. Restores sound and speed afterwards.
(() => {
  const SC = window.__breakless;
  if (!SC || window.__breaklessPrime) return;
  window.__breaklessPrime = true;

  const PLAYER_ROOTS = ['.dv-player-fullscreen', '#dv-web-player', '.webPlayerSDKContainer', '.webPlayerContainer'];
  const VIDEO_SELECTORS = ['.dv-player-fullscreen video', '#dv-web-player video', '.webPlayerSDKContainer video', 'video'];
  // Countdown elements. Amazon A/B-tests the exact class names, so match the family.
  const TIMER_SELECTORS = [
    '.dv-player-fullscreen .atvwebplayersdk-ad-timer-remaining-time',
    '.dv-player-fullscreen [class*="atvwebplayersdk-ad-timer"]',
    '[class*="atvwebplayersdk-ad-timer"]',
    '[class*="atvwebplayersdk-adtimeindicator"]',
  ];
  const SKIP_SELECTORS = [
    '.atvwebplayersdk-skip-ad-button',
    '.fu4rd6c.f1cw2swo',
    'button[aria-label*="skip ad" i]',
  ];
  const AD_ARIA = '[aria-label*="playing ad" i], [aria-label*="advertisement" i]';

  const ctrl = SC.createAdController('prime', { maxSeek: 90, seekGapMs: 2000 });
  let loop = 0;
  let lastSkipClick = 0;

  function playerRoot() {
    for (const sel of PLAYER_ROOTS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function detectAd() {
    for (const sel of TIMER_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        const text = el.textContent.trim();
        if (!text || !SC.isVisible(el)) continue;
        const remaining = SC.parseClock(text);
        if (remaining != null) return { how: 'timer', remaining };
      }
    }
    // Looser signals are only trusted inside the player, never elsewhere on Amazon pages.
    const root = playerRoot();
    if (!root) return null;
    for (const el of root.querySelectorAll(AD_ARIA)) {
      if (SC.isVisible(el)) return { how: 'aria', remaining: SC.parseClock(el.textContent) };
    }
    const label = SC.findAdLabel(root);
    if (label) return { how: 'label', remaining: label.remaining };
    return null;
  }

  function clickSkip() {
    if (performance.now() - lastSkipClick < 1000) return false;
    for (const sel of SKIP_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        if (!SC.isVisible(el)) continue;
        lastSkipClick = performance.now();
        el.click();
        SC.log('prime', 'clicked Skip');
        return true;
      }
    }
    return false;
  }

  function tick() {
    if (!SC.settings.primeEnabled) {
      ctrl.reset();
      return;
    }
    const video = SC.pickMainVideo(VIDEO_SELECTORS);
    if (!video) return ctrl.idle();
    const ad = detectAd();
    if (!ad) return ctrl.idle();
    clickSkip();
    ctrl.during(video, ad.remaining);
  }

  // Run the fast loop only on pages that actually have the player.
  function schedule() {
    loop = setTimeout(() => {
      try { tick(); } catch (e) { SC.log('tick error', e); }
      if (loop) schedule();
    }, ctrl.active ? 60 : 400);
  }

  function watchForPlayer() {
    const check = () => {
      const hasPlayer = !!(playerRoot() || document.querySelector('video'));
      if (hasPlayer && !loop) schedule();
      if (!hasPlayer && loop) {
        clearTimeout(loop);
        loop = 0;
        ctrl.reset();
      }
    };
    check();
    setInterval(check, 1500);
  }

  SC.ready.then(watchForPlayer);
})();
