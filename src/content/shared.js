// Breakless shared helpers (isolated world). Loaded before prime.js / hotstar.js.
(() => {
  if (window.__breakless) return;

  const DEFAULTS = {
    primeEnabled: true, hotstarEnabled: true, primePreload: true,
    youtubeEnabled: true, youtubePreload: true,
  };
  const CFG_EVENT = '__bl_cfg_e1';
  const HELLO_EVENT = '__bl_hello_e1';

  const settings = { ...DEFAULTS };
  const listeners = new Set();

  const log = (...args) => console.debug('[Breakless]', ...args);

  // ---- Settings + bridge to the page-context (MAIN world) script ----------
  function pageConfig() {
    return {
      primeEnabled: !!settings.primeEnabled,
      hotstarEnabled: !!settings.hotstarEnabled,
      primePreload: !!(settings.primeEnabled && settings.primePreload),
      youtubeEnabled: !!settings.youtubeEnabled,
      youtubePreload: !!(settings.youtubeEnabled && settings.youtubePreload),
    };
  }
  function pushConfigToPage() {
    document.dispatchEvent(new CustomEvent(CFG_EVENT, { detail: JSON.stringify(pageConfig()) }));
  }
  // The page-context scripts start with sensible defaults; they only hear from us once the
  // real settings are loaded, never the placeholders above.
  let loaded = false;
  document.addEventListener(HELLO_EVENT, () => { if (loaded) pushConfigToPage(); });

  const ready = chrome.storage.local
    .get(Object.keys(DEFAULTS))
    .then((stored) => {
      Object.assign(settings, stored);
      loaded = true;
      pushConfigToPage();
      listeners.forEach((fn) => fn(settings));
    })
    .catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let touched = false;
    for (const key of Object.keys(DEFAULTS)) {
      if (key in changes) {
        settings[key] = changes[key].newValue ?? DEFAULTS[key];
        touched = true;
      }
    }
    if (touched) {
      pushConfigToPage();
      listeners.forEach((fn) => fn(settings));
    }
  });

  function countSkip() {
    chrome.storage.local
      .get('skipped')
      .then(({ skipped = 0 }) => chrome.storage.local.set({ skipped: skipped + 1 }))
      .catch(() => {});
  }

  // ---- DOM helpers ---------------------------------------------------------
  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === 'function') {
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // "Ad 0:45", "Ad0:20", "1:05", "25s" -> seconds. Uses the last clock in the text.
  function parseClock(text) {
    if (!text) return null;
    const clocks = [...String(text).matchAll(/(\d{1,2}):(\d{2})/g)];
    if (clocks.length) {
      const m = clocks[clocks.length - 1];
      return Number(m[1]) * 60 + Number(m[2]);
    }
    const secs = String(text).match(/(\d{1,3})\s*(?:s|sec|secs|seconds)\b/i);
    return secs ? Number(secs[1]) : null;
  }

  // An ad label followed by a countdown, in a few UI languages.
  const AD_LABEL_RE =
    /^\s*(?:ad|ads|advert|advertisement|sponsored|anuncio|werbung|publicité|pubblicità|विज्ञापन)\s*(?:\d+\s*(?:of|\/)\s*\d+)?\s*[·•:|\-–]?\s*\d{1,2}:\d{2}\s*$/i;

  // Scan short text elements inside `root` for an "Ad 0:20" style label.
  function findAdLabel(root) {
    if (!root) return null;
    const els = root.querySelectorAll('span, div, p, label');
    let checked = 0;
    for (const el of els) {
      if (el.childElementCount > 3) continue;
      const t = el.textContent;
      if (!t || t.length > 32) continue;
      if (++checked > 600) break;
      if (AD_LABEL_RE.test(t) && isVisible(el)) return { el, remaining: parseClock(t) };
    }
    return null;
  }

  function pickMainVideo(selectors, exclude) {
    let best = null;
    let bestArea = 0;
    for (const sel of selectors) {
      for (const v of document.querySelectorAll(sel)) {
        if (exclude && exclude(v)) continue;
        const r = v.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > bestArea) {
          best = v;
          bestArea = area;
        }
      }
      if (best) return best;
    }
    return best;
  }

  function isLive(video) {
    const d = video.duration;
    return !Number.isFinite(d) || d > 86400;
  }

  // ---- On-player notice: big, highlighted card at the top of the video ----
  const notice = (() => {
    let host = null;
    let ui = null;
    let hideTimer = 0;
    let anchor = null;

    function build() {
      host = document.createElement('div');
      host.setAttribute('aria-live', 'polite');
      const shadow = host.attachShadow({ mode: 'closed' });
      shadow.innerHTML = `
        <style>
          :host { all: initial; }
          .card {
            position: fixed; z-index: 2147483647; transform: translate(-50%, -8px); opacity: 0;
            display: flex; align-items: center; gap: .65em; min-width: 12em;
            padding: .7em 1.25em .85em; border-radius: 16px; color: #fff;
            font: 700 var(--fs, 18px)/1.15 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #12b886 0%, #0e7490 100%);
            box-shadow: 0 10px 34px rgba(0,0,0,.55), 0 0 0 2px rgba(255,255,255,.28) inset;
            pointer-events: none; overflow: hidden;
            transition: opacity .18s ease, transform .18s ease, background .25s ease;
          }
          .card.show { opacity: 1; transform: translate(-50%, 0); }
          .card.done { background: linear-gradient(135deg, #22c55e 0%, #15803d 100%); }
          .ico { width: 1.45em; height: 1.45em; flex: none; display: grid; place-items: center;
                 border-radius: 50%; background: rgba(255,255,255,.2); }
          .ico svg { width: .95em; height: .95em; }
          .card:not(.done) .ico { animation: pulse 1.1s ease-in-out infinite; }
          @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(255,255,255,.45); } 50% { box-shadow: 0 0 0 .35em rgba(255,255,255,0); } }
          .txt { display: flex; flex-direction: column; gap: .15em; }
          .title { letter-spacing: .2px; }
          .sub { font-weight: 600; font-size: .62em; opacity: .9; }
          .bar { position: absolute; left: 0; bottom: 0; height: 4px; width: 100%;
                 background: rgba(255,255,255,.25); }
          .fill { height: 100%; width: 0%; background: #fff; transition: width .2s linear; }
          .card.done .bar, .card.done .i-skip, .card:not(.done) .i-done { display: none; }
        </style>
        <div class="card" role="status">
          <span class="ico">
            <svg class="i-skip" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5v13l8.5-6.5L4 5.5zm8.5 0v13L21 12l-8.5-6.5z" fill="currentColor"/></svg>
            <svg class="i-done" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z" fill="currentColor"/></svg>
          </span>
          <span class="txt"><span class="title"></span><span class="sub"></span></span>
          <span class="bar"><span class="fill"></span></span>
        </div>`;
      ui = {
        card: shadow.querySelector('.card'),
        title: shadow.querySelector('.title'),
        sub: shadow.querySelector('.sub'),
        fill: shadow.querySelector('.fill'),
      };
    }

    function place() {
      if (!host) return;
      const parent = document.fullscreenElement || document.body || document.documentElement;
      if (host.parentNode !== parent) parent.appendChild(host);
      let r = anchor && anchor.isConnected ? anchor.getBoundingClientRect() : null;
      if (!r || r.width < 50 || r.height < 50) {
        r = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      }
      const fs = Math.max(15, Math.min(26, r.width * 0.024));
      ui.card.style.setProperty('--fs', `${fs.toFixed(1)}px`);
      ui.card.style.left = `${r.left + r.width / 2}px`;
      ui.card.style.top = `${Math.max(8, r.top + Math.max(16, r.height * 0.07))}px`;
    }

    return {
      // progress: 0..1 or null
      skipping(video, { progress = null, sub = '' } = {}) {
        try {
          if (!host) build();
          clearTimeout(hideTimer);
          anchor = video;
          ui.card.classList.remove('done');
          ui.title.textContent = 'Skipping ad';
          ui.sub.textContent = sub || 'Breakless · your show is coming right back';
          ui.fill.style.width = progress == null ? '35%' : `${Math.round(Math.max(0.05, Math.min(1, progress)) * 100)}%`;
          place();
          ui.card.classList.add('show');
        } catch (_) {}
      },
      done(video, ms = 1600) {
        try {
          if (!host) build();
          if (video) anchor = video;
          ui.card.classList.add('done');
          ui.title.textContent = 'Ad skipped';
          ui.sub.textContent = 'Breakless';
          place();
          ui.card.classList.add('show');
          clearTimeout(hideTimer);
          hideTimer = setTimeout(() => this.hide(), ms);
        } catch (_) {}
      },
      hide() {
        clearTimeout(hideTimer);
        if (ui) ui.card.classList.remove('show');
      },
    };
  })();

  // ---- Ad session: jump, mute, fast-forward only if needed, then restore ---
  // One controller per site. Call during(video, remaining) on every tick while an
  // ad is detected and idle() on ticks without one.
  //  * Countdown known -> jump forward by it (max 90 s per jump), play the last second muted.
  //    The jump is verified with video.currentTime, not the on-screen countdown, which
  //    can lag behind while the player buffers after a seek.
  //  * No countdown, the player refused the jump, or the countdown is frozen
  //    -> muted 16x until the ad ends.
  // Speed is restored on the first tick without an ad; sound after a short grace period.
  function createAdController(site, opts = {}) {
    const maxSeek = opts.maxSeek ?? 90; // Prime's player crashes on bigger jumps
    const verifyMs = opts.verifyMs ?? 2500;
    const reseekMs = opts.reseekMs ?? 3000;
    const frozenMs = opts.frozenMs ?? 4500;
    const endGraceMs = opts.endGraceMs ?? 800;
    const tail = opts.tail ?? 1; // seconds of the ad left to play (muted) after a jump
    const st = {};

    function fresh(video) {
      Object.assign(st, {
        active: true, video, startedAt: performance.now(), lastSeen: 0,
        rate: video.playbackRate >= 2 ? 1 : video.playbackRate || 1,
        muted: video.muted,
        fast: false,
      });
      newAd(video);
    }

    // A new ad inside the same break (YouTube plays each ad of a pod as its own video).
    function newAd(video) {
      Object.assign(st, {
        src: video.currentSrc, firstRemaining: null,
        seekAt: 0, seekTarget: null, remainingAtSeek: null, seekOk: false, fallback: false,
      });
    }

    function slowDown() {
      if (st.fast && st.video) {
        try { st.video.playbackRate = st.rate; } catch (_) {}
        st.fast = false;
      }
    }

    function end() {
      slowDown();
      if (st.video) {
        try { st.video.muted = st.muted; } catch (_) {}
      }
      st.active = false;
      st.video = null;
    }

    function seek(video, remaining, now) {
      const jump = Math.min(remaining - tail, maxSeek);
      try {
        const from = video.currentTime;
        video.currentTime = from + jump;
        st.seekTarget = from + jump;
        st.remainingAtSeek = remaining;
        st.seekAt = now;
        st.seekOk = false;
        log(site, `jumped ${jump.toFixed(1)}s`);
      } catch (_) {
        st.fallback = true;
      }
    }

    return {
      get active() { return !!st.active; },
      during(video, remaining, { allowSeek = true, allowFast = true } = {}) {
        const now = performance.now();
        if (!st.active || st.video !== video) {
          if (st.active) end();
          fresh(video);
          log(site, 'ad break started', remaining != null ? `(${remaining}s left)` : '(no countdown)');
        }
        st.lastSeen = now;
        if (video.currentSrc !== st.src) newAd(video);
        const live = isLive(video);
        const known = remaining != null && Number.isFinite(remaining);

        if (known && st.firstRemaining == null) st.firstRemaining = remaining;

        if (allowSeek && !live && known && !st.fallback) {
          if (st.seekTarget == null) {
            if (remaining > tail + 1) seek(video, remaining, now);
          } else if (!st.seekOk) {
            if (video.currentTime >= st.seekTarget - 2) {
              st.seekOk = true; // the jump landed
            } else if (now - st.seekAt > verifyMs) {
              st.fallback = true; // player put us back
              log(site, 'player refused the jump, using fast-forward');
            }
          } else if (remaining > 2 && now - st.seekAt > reseekMs) {
            if (remaining < st.remainingAtSeek) {
              seek(video, remaining, now); // countdown is live: a longer pod than one capped jump
            } else if (now - st.seekAt > frozenMs) {
              st.fallback = true; // countdown never moved after the jump; don't trust it
              log(site, 'countdown frozen, using fast-forward');
            }
          }
        }

        if (!video.muted) video.muted = true;

        const wantFast = allowFast && !live && (!known || st.fallback || !allowSeek);
        if (wantFast && video.playbackRate !== 16) {
          try { video.playbackRate = 16; } catch (_) {
            try { video.playbackRate = 8; } catch (_) {}
          }
          st.fast = true;
        } else if (!wantFast) {
          slowDown();
        }

        let progress = null;
        if (known && st.firstRemaining) progress = 1 - remaining / st.firstRemaining;
        notice.skipping(video, {
          progress,
          sub: live ? 'Breakless · muted until the ad ends' : '',
        });
      },
      idle() {
        if (!st.active) return;
        slowDown(); // never fast-forward real content
        if (performance.now() - st.lastSeen > endGraceMs) {
          const v = st.video;
          end();
          countSkip();
          notice.done(v);
          log(site, 'ad break ended');
        }
      },
      reset() {
        if (st.active) end();
        notice.hide();
      },
    };
  }

  window.__breakless = {
    settings,
    ready,
    onSettings: (fn) => listeners.add(fn),
    log,
    notice,
    countSkip,
    isVisible,
    parseClock,
    findAdLabel,
    pickMainVideo,
    isLive,
    createAdController,
  };
})();
