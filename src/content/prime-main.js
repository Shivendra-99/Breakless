// Breakless for Prime Video (page context / MAIN world, document_start).
// "Remove ads before they load" (on by default): strips ad cue points from the
// playback JSON and ad Periods from the DASH manifest before Amazon's player reads them.
// Rules mirror uBlock Origin's Prime Video filters (uAssets filters-2025.txt).
(() => {
  if (window.__blPrimeMain) return;
  Object.defineProperty(window, '__blPrimeMain', { value: true });

  const CFG_EVENT = '__bl_cfg_e1';
  const HELLO_EVENT = '__bl_hello_e1';
  const cfg = { primeEnabled: true, primePreload: true };
  document.addEventListener(CFG_EVENT, (e) => {
    try { Object.assign(cfg, JSON.parse(String(e.detail))); } catch (_) {}
  });
  document.dispatchEvent(new CustomEvent(HELLO_EVENT));
  const active = () => cfg.primeEnabled && cfg.primePreload;

  const host = location.hostname;
  const onPrimeHost = /(^|\.)primevideo\.com$/.test(host) || location.pathname.startsWith('/gp/video');

  // Amazon's ad-block check flag (uBO: primevideo.com##+js(set, ue_adb_chk, 1)).
  if (/(^|\.)primevideo\.com$/.test(host)) {
    try {
      Object.defineProperty(window, 'ue_adb_chk', { configurable: true, get: () => 1, set: () => {} });
    } catch (_) {}
  }

  // ---- JSON pruning (port of uBO's object-find-owner semantics) ------------
  //  "[]"  = every array item;  "[-]" = remove the array items that contain the rest of the path
  function findOwner(root, chain, prune = false) {
    let owner = root;
    for (;;) {
      if (typeof owner !== 'object' || owner === null) return false;
      const pos = chain.indexOf('.');
      if (pos === -1) {
        if (!prune) return Object.prototype.hasOwnProperty.call(owner, chain);
        if (Object.prototype.hasOwnProperty.call(owner, chain)) {
          delete owner[chain];
          return true;
        }
        return false;
      }
      const prop = chain.slice(0, pos);
      const next = chain.slice(pos + 1);
      if (prop === '[-]' && Array.isArray(owner)) {
        let found = false;
        for (let i = owner.length - 1; i >= 0; i--) {
          if (findOwner(owner[i], next) === false) continue;
          owner.splice(i, 1);
          found = true;
        }
        return found;
      }
      if (prop === '[]' && Array.isArray(owner)) {
        let found = false;
        for (const item of owner) if (findOwner(item, next, prune)) found = true;
        return found;
      }
      if (!Object.prototype.hasOwnProperty.call(owner, prop)) return false;
      owner = owner[prop];
      chain = next;
    }
  }

  const PLAYBACK_PATHS = [
    'cuepointPlaylist',
    'vodPlaybackUrls.result.playbackUrls.cuepoints',
    'vodPlaylistedPlaybackUrls.result.playbackUrls.pauseBehavior',
    'vodPlaylistedPlaybackUrls.result.playbackUrls.pauseAdsResolution',
    'vodPlaylistedPlaybackUrls.result.playbackUrls.intraTitlePlaylist.[-].shouldShowOnScrubBar',
  ];

  function looksLikePlayback(o) {
    return !!o && typeof o === 'object' && !Array.isArray(o) &&
      ('vodPlaybackUrls' in o || 'vodPlaylistedPlaybackUrls' in o || 'cuepointPlaylist' in o);
  }

  function pruneJson(obj) {
    if (!obj || typeof obj !== 'object') return false;
    let changed = false;
    if (looksLikePlayback(obj)) {
      for (const p of PLAYBACK_PATHS) if (findOwner(obj, p, true)) changed = true;
    }
    // Top-level "ads" key: only on Prime Video pages, never on Amazon shopping pages.
    if ((onPrimeHost || looksLikePlayback(obj)) && findOwner(obj, 'ads', true)) changed = true;
    return changed;
  }

  const nativeParse = JSON.parse;
  JSON.parse = new Proxy(nativeParse, {
    apply(target, thisArg, args) {
      const result = Reflect.apply(target, thisArg, args);
      if (active()) {
        try { if (pruneJson(result)) console.debug('[Breakless] prime: removed ad cue points'); } catch (_) {}
      }
      return result;
    },
  });

  const nativeJson = Response.prototype.json;
  Response.prototype.json = new Proxy(nativeJson, {
    apply(target, thisArg, args) {
      const p = Reflect.apply(target, thisArg, args);
      if (!active()) return p;
      return p.then((obj) => {
        try { pruneJson(obj); } catch (_) {}
        return obj;
      });
    },
  });

  // ---- DASH manifest pruning (port of uBO's three xml-prune rules) ---------
  const XML_RULES = [
    {
      check: '[value="Ad"]',
      xpath: '//*[name()="Period"][.//*[@value="Ad"]] | /*[name()="MPD"]/@mediaPresentationDuration | //*[name()="Period"]/@start',
    },
    {
      check: '[value="Draper"]',
      xpath: '//*[name()="Period"][.//*[@value="Draper"]] | /*[name()="MPD"]/@mediaPresentationDuration | //*[name()="Period"]/@start',
    },
    {
      check: null,
      xpath:
        '//*[name()="Period"][.//*[name()="BaseURL" and contains(text(),"/interstitial/")]]' +
        ' | /*[name()="MPD"][.//*[name()="BaseURL" and contains(text(),"/interstitial/")]]/@mediaPresentationDuration' +
        ' | /*[name()="MPD"][.//*[name()="BaseURL" and contains(text(),"/interstitial/")]]/*[name()="Period"]/@start',
    },
  ];

  function pruneMpdDoc(doc) {
    let changed = false;
    for (const rule of XML_RULES) {
      try {
        if (rule.check && !doc.querySelector(rule.check)) continue;
        const res = doc.evaluate(rule.xpath, doc, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
        const nodes = [];
        for (let i = 0; i < res.snapshotLength; i++) nodes.push(res.snapshotItem(i));
        const periodsTotal = doc.getElementsByTagNameNS('*', 'Period').length;
        const periodsRemoved = nodes.filter((n) => n.nodeType === 1).length;
        if (periodsRemoved === 0) continue; // nothing ad-like here; leave timing attributes alone
        if (periodsRemoved >= periodsTotal) continue; // never strip the whole programme
        for (const n of nodes) {
          if (n.nodeType === 1) n.remove();
          else if (n.nodeType === 2 && n.ownerElement) n.ownerElement.removeAttribute(n.nodeName);
        }
        changed = true;
      } catch (_) {}
    }
    if (changed) console.debug('[Breakless] prime: removed ad periods from manifest');
    return changed;
  }

  function pruneMpdText(text) {
    if (typeof text !== 'string' || !/^\s*</.test(text) || !/>\s*$/.test(text)) return text;
    try {
      const doc = new DOMParser().parseFromString(text, 'text/xml');
      if (doc.getElementsByTagName('parsererror').length) return text;
      if (!pruneMpdDoc(doc)) return text;
      return new XMLSerializer().serializeToString(doc);
    } catch (_) {
      return text;
    }
  }

  const isMpd = (url) => typeof url === 'string' && url.includes('.mpd');
  const urlOf = (arg) => (arg instanceof Request ? arg.url : String(arg));

  const nativeFetch = window.fetch;
  window.fetch = new Proxy(nativeFetch, {
    apply(target, thisArg, args) {
      const promise = Reflect.apply(target, thisArg, args);
      if (!active() || !isMpd(urlOf(args[0]))) return promise;
      return promise.then((before) =>
        before
          .clone()
          .text()
          .then((text) => {
            const out = pruneMpdText(text);
            if (out === text) return before;
            const after = new Response(out, {
              status: before.status,
              statusText: before.statusText,
              headers: before.headers,
            });
            Object.defineProperties(after, {
              ok: { value: before.ok },
              redirected: { value: before.redirected },
              type: { value: before.type },
              url: { value: before.url },
            });
            return after;
          })
          .catch(() => before)
      );
    },
  });

  const XHR = XMLHttpRequest.prototype;
  const xhrUrls = new WeakMap();
  const xhrCache = new WeakMap();
  const nativeOpen = XHR.open;
  XHR.open = new Proxy(nativeOpen, {
    apply(target, thisArg, args) {
      try { xhrUrls.set(thisArg, String(args[1])); } catch (_) {}
      return Reflect.apply(target, thisArg, args);
    },
  });

  function xhrTransform(xhr, raw) {
    if (!active() || xhr.readyState !== 4 || !isMpd(xhrUrls.get(xhr))) return raw;
    if (typeof raw === 'string') {
      const hit = xhrCache.get(xhr);
      if (hit && hit.src === raw) return hit.out;
      const out = pruneMpdText(raw);
      xhrCache.set(xhr, { src: raw, out });
      return out;
    }
    if (raw && typeof raw === 'object' && raw.nodeType === 9 && !xhrCache.has(xhr)) {
      pruneMpdDoc(raw);
      xhrCache.set(xhr, { doc: true });
    }
    return raw;
  }

  for (const name of ['response', 'responseText', 'responseXML']) {
    const d = Object.getOwnPropertyDescriptor(XHR, name);
    if (!d || !d.get) continue;
    const nativeGet = d.get;
    Object.defineProperty(XHR, name, {
      configurable: d.configurable,
      enumerable: d.enumerable,
      get: new Proxy(nativeGet, {
        apply(target, thisArg, args) {
          const raw = Reflect.apply(target, thisArg, args);
          try { return xhrTransform(thisArg, raw); } catch (_) { return raw; }
        },
      }),
    });
  }
})();
