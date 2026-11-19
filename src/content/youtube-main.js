// Breakless for YouTube (page context / MAIN world, document_start).
// Registered only while YouTube is switched on, youtube.com is allowed and the
// "Remove YouTube ads before they load" beta is on. It strips the ad schedule
// (adPlacements, playerAds, adSlots) from YouTube's player data before the player reads it,
// the same fields uBlock Origin's YouTube filters remove. Nothing else in the data is touched.
(() => {
  if (window.__blYouTubeMain) return;
  Object.defineProperty(window, '__blYouTubeMain', { value: true });

  const CFG_EVENT = '__bl_cfg_e1';
  const HELLO_EVENT = '__bl_hello_e1';
  // On from the start (this script only exists while the beta is on), so the player data that
  // arrives with the page is covered before settings reach the page.
  const cfg = { youtubeEnabled: true, youtubePreload: true };
  document.addEventListener(CFG_EVENT, (e) => {
    try { Object.assign(cfg, JSON.parse(String(e.detail))); } catch (_) {}
  });
  document.dispatchEvent(new CustomEvent(HELLO_EVENT));
  const active = () => cfg.youtubeEnabled && cfg.youtubePreload;

  const AD_KEYS = ['adPlacements', 'playerAds', 'adSlots'];
  // Only objects that are clearly a player response are touched.
  const isPlayerResponse = (o) =>
    !!o && typeof o === 'object' && !Array.isArray(o) &&
    ('playabilityStatus' in o || 'streamingData' in o || 'videoDetails' in o);

  function strip(o) {
    let n = 0;
    for (const k of AD_KEYS) {
      if (Object.prototype.hasOwnProperty.call(o, k)) { delete o[k]; n++; }
    }
    return n;
  }

  function prune(data) {
    if (!active() || !data || typeof data !== 'object') return data;
    try {
      let n = 0;
      if (isPlayerResponse(data)) n += strip(data);
      if (isPlayerResponse(data.playerResponse)) n += strip(data.playerResponse);
      if (Array.isArray(data)) {
        for (const item of data) if (item && isPlayerResponse(item.playerResponse)) n += strip(item.playerResponse);
      }
      if (n) console.debug('[Breakless] youtube: removed ad schedule from player data');
    } catch (_) {}
    return data;
  }

  // Player data arriving with the page: `var ytInitialPlayerResponse = {...}`.
  let initial;
  try {
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      configurable: true,
      get: () => initial,
      set: (v) => { initial = prune(v); },
    });
  } catch (_) {}

  // Player data fetched when a video opens from inside the site.
  const nativeParse = JSON.parse;
  JSON.parse = new Proxy(nativeParse, {
    apply(target, thisArg, args) {
      return prune(Reflect.apply(target, thisArg, args));
    },
  });

  const nativeJson = Response.prototype.json;
  Response.prototype.json = new Proxy(nativeJson, {
    apply(target, thisArg, args) {
      return Reflect.apply(target, thisArg, args).then(prune);
    },
  });
})();
