// End-to-end tests: real Chrome + the built extension + mock Prime/Hotstar/Amazon pages.
const path = require('path');
const puppeteer = require('puppeteer-core');
const server = require('./server');

const EXT = path.resolve(__dirname, '..', 'dist', 'chrome');
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
async function waitFor(page, fn, timeout = 8000, ...args) {
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(fn, ...args).catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > timeout) return null;
    await sleep(100);
  }
}
const fetchStatus = (page, url) =>
  page.evaluate((u) => fetch(u).then((r) => 'ok:' + r.status).catch((e) => 'blocked:' + e.message), url);

(async () => {
  await server.start();
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    pipe: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      '--no-sandbox',
      '--no-proxy-server',
      '--host-resolver-rules=MAP * 127.0.0.1',
      '--ignore-certificate-errors',
      '--autoplay-policy=no-user-gesture-required',
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
    ],
  });

  try {
    // ---- Extension loads ---------------------------------------------------
    const swTarget = await browser.waitForTarget(
      (t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'),
      { timeout: 15000 }
    ).catch(() => null);
    check('extension loads and background starts', !!swTarget);
    if (!swTarget) throw new Error('extension did not load');
    const extId = new URL(swTarget.url()).host;
    const sw = await swTarget.worker();
    await sleep(500);
    const enabled = await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets());
    check('default rule sets on: prime_basic + prime_preload + hotstar_basic',
      enabled.includes('prime_basic') && enabled.includes('hotstar_basic') && enabled.includes('prime_preload'),
      JSON.stringify(enabled));
    const setSettings = (obj) => sw.evaluate((o) => chrome.storage.local.set(o), obj);
    const stored = await sw.evaluate(() => chrome.storage.local.get(null));
    check('fresh install stores only the counter (defaults stay in code)',
      JSON.stringify(stored) === '{"skipped":0}', JSON.stringify(stored));
    const versions = await sw.evaluate(() => [olderThan('0.2.0', '0.3.0'), olderThan('0.2.9', '0.3.0'), olderThan('0.3.0', '0.3.0'), olderThan('0.3.1', '0.3.0'), olderThan(undefined, '0.3.0')]);
    check('update from 0.2.x is recognised (turns Prime pre-load removal on for existing users)',
      JSON.stringify(versions) === '[true,true,false,false,true]', JSON.stringify(versions));
    const welcome = await browser.waitForTarget((t) => t.url().endsWith('/welcome/welcome.html'), { timeout: 5000 }).catch(() => null);
    check('welcome tab opens on install', !!welcome);
    if (welcome) {
      const wp = await welcome.page();
      await wp.setViewport({ width: 900, height: 900, deviceScaleFactor: 1 });
      await sleep(500);
      const w = await wp.evaluate(() => ({
        on: [...document.querySelectorAll('.checks li.on')].map((li) => li.dataset.svc),
        warning: !document.getElementById('needAccess').hidden,
      }));
      check('welcome tab: Prime Video, JioHotstar and YouTube all ready, nothing to do',
        JSON.stringify(w.on) === '["prime","hotstar","youtube"]' && !w.warning, JSON.stringify(w));
      await wp.screenshot({ path: path.join(__dirname, 'welcome.png'), fullPage: true });
      await wp.close();
    }

    const page = await browser.newPage();
    const consoleLines = [];
    page.on('console', (m) => { if (m.text().includes('Breakless')) consoleLines.push(m.text()); });

    // ---- Prime: countdown -> jump -------------------------------------------
    await page.goto('https://www.primevideo.com/detail/test', { waitUntil: 'load' });
    await waitFor(page, () => T.state().t > 1.5);
    let ad = await page.evaluate(() => T.startAd(45));
    let jumped = await waitFor(page, (s) => T.state().t > s + 40 && T.state(), 4000, ad.start);
    check('Prime: 45s ad with countdown is jumped over', !!jumped, jumped ? `video ${ad.start.toFixed(1)}s -> ${jumped.t.toFixed(1)}s` : 'no jump');
    const duringAd = await page.evaluate(() => ({ ...T.state(), done: T.ad.done }));
    check('Prime: sound muted while ad is on screen', duringAd.muted || duringAd.done, JSON.stringify(duringAd));
    await waitFor(page, () => T.ad.done, 6000);
    await sleep(1500);
    let after = await page.evaluate(() => ({ ...T.state(), endedAt: T.ad.endedAtVideo }));
    check('Prime: sound and speed restored after the ad', !after.muted && after.rate === 1, JSON.stringify(after));
    check('Prime: show is not fast-forwarded after the ad (<3s past ad end)',
      after.t - after.endedAt < 3 + 1.5 /* 1.5s of normal playback while we waited */, `ad ended at ${after.endedAt.toFixed(1)}s, now ${after.t.toFixed(1)}s`);

    // ---- Prime: Skip button ---------------------------------------------------
    ad = await page.evaluate(() => T.startAd(20, { skipButton: true }));
    const clicked = await waitFor(page, () => T.skipClicked, 3000);
    check('Prime: clicks Amazon\'s own Skip button', !!clicked);
    await waitFor(page, () => T.ad.done, 6000);
    await sleep(1200);

    // ---- Prime: text-only label fallback ("Ad0:20") ------------------------
    ad = await page.evaluate(() => T.startAd(30, { noClass: true, tag: 'span', prefix: 'Ad' }));
    jumped = await waitFor(page, (s) => T.state().t > s + 25 && T.state(), 4000, ad.start);
    check('Prime: detects an unlabelled "Ad0:30" countdown inside the player', !!jumped);
    await waitFor(page, () => T.ad.done, 6000);
    await sleep(1200);

    // ---- Prime: no countdown visible -> muted 16x ---------------------------
    ad = await page.evaluate(() => T.startAd(24, { aria: true, noTime: true }));
    const fast = await waitFor(page, () => T.state().rate === 16 && T.state(), 3000);
    check('Prime: ad without countdown plays muted at 16x', !!fast && fast.muted, JSON.stringify(fast));
    await waitFor(page, () => T.ad.done, 8000);
    await sleep(300);
    after = await page.evaluate(() => ({ ...T.state(), endedAt: T.ad.endedAtVideo }));
    check('Prime: 16x stops right after the ad', after.rate === 1, `rate ${after.rate}, ${(after.t - after.endedAt).toFixed(1)}s past ad end`);
    await sleep(1200);

    // ---- Prime: player refuses the jump -> muted 16x fallback ---------------
    ad = await page.evaluate(() => T.startAd(20, { blockSeek: true }));
    const fb = await waitFor(page, () => T.state().rate === 16 && T.state(), 6000);
    check('Prime: if the player refuses the jump, falls back to muted 16x', !!fb && fb.muted, JSON.stringify(fb));
    await page.screenshot({ path: path.join(__dirname, 'notice-skipping.png'), clip: { x: 0, y: 0, width: 640, height: 360 } });
    await waitFor(page, () => T.ad.done, 8000);
    await sleep(1000);
    await page.screenshot({ path: path.join(__dirname, 'notice-done.png'), clip: { x: 0, y: 0, width: 640, height: 360 } });
    after = await page.evaluate(() => ({ ...T.state(), endedAt: T.ad.endedAtVideo }));
    check('Prime: after the fallback, sound and normal speed are back', !after.muted && after.rate === 1, JSON.stringify(after));
    await sleep(1000);

    // ---- Prime: long ad pod (150s) with a live countdown -> two capped jumps ---
    await page.goto('https://www.primevideo.com/detail/test', { waitUntil: 'load' });
    await waitFor(page, () => T.state().t > 1.5);
    ad = await page.evaluate(() => T.startAd(150));
    let wall0 = Date.now();
    await waitFor(page, () => T.ad.done, 15000);
    let pod = await page.evaluate(() => ({ seeks: T.seekCount, end: T.ad.end, endedAt: T.ad.endedAtVideo }));
    check('Prime: 150s ad pod skipped with two jumps (90s cap respected)',
      pod.seeks >= 2 && pod.endedAt - pod.end < 3 && Date.now() - wall0 < 12000,
      `${pod.seeks} jumps, ad gone after ${((Date.now() - wall0) / 1000).toFixed(1)}s, overshoot ${(pod.endedAt - pod.end).toFixed(1)}s`);
    await sleep(1500);

    // ---- Prime: countdown freezes after the first jump -> no blind second jump --
    await page.goto('https://www.primevideo.com/detail/test', { waitUntil: 'load' });
    await waitFor(page, () => T.state().t > 1.5);
    ad = await page.evaluate(() => T.startAd(150, { freezeAfterSeek: true }));
    wall0 = Date.now();
    await waitFor(page, () => T.ad.done, 20000);
    await sleep(300);
    pod = await page.evaluate(() => ({ seeks: T.seekCount, end: T.ad.end, endedAt: T.ad.endedAtVideo, rate: T.state().rate }));
    check('Prime: frozen countdown -> no blind second jump, finishes with 16x, no overshoot into the show',
      pod.seeks === 1 && pod.endedAt - pod.end < 3 && pod.rate === 1,
      `${pod.seeks} jump(s), ad gone after ${((Date.now() - wall0) / 1000).toFixed(1)}s, overshoot ${(pod.endedAt - pod.end).toFixed(1)}s, rate now ${pod.rate}`);
    await sleep(1500);

    // ---- Prime: pre-load removal switched OFF -> manifest and JSON untouched --
    await setSettings({ primePreload: false });
    await sleep(800);
    await page.goto('https://www.primevideo.com/detail/test', { waitUntil: 'load' });
    await sleep(600);
    let mpd = await page.evaluate(() => fetch('/manifest.mpd').then((r) => r.text()));
    check('Prime (pre-load off): manifest left untouched', mpd.includes('value="Ad"'));
    let gpr = await page.evaluate(() =>
      fetch('https://atv-ps.primevideo.com/cdp/catalog/GetPlaybackResources?deviceAdInsertionTypeOverride=SSAI&desiredResources=PlaybackUrls%2CCuepointPlaylist&x=1')
        .then((r) => r.json()));
    check('Prime (pre-load off): playback request untouched', gpr.url.includes('deviceAdInsertionTypeOverride') && gpr.url.includes('CuepointPlaylist'), gpr.url);

    // ---- Prime: network blocks ----------------------------------------------
    let s1 = await fetchStatus(page, 'https://eu.regolith.prime-video.amazon.dev/getVideoAds?x=1');
    let s2 = await fetchStatus(page, 'https://eu.regolith.prime-video.amazon.dev/getThumbnails?x=1');
    check('Prime: ad-decision call getVideoAds is blocked', s1.startsWith('blocked'), s1);
    check('Prime: other calls on the same server still work', s2.startsWith('ok'), s2);

    // ---- Prime: pre-load removal back ON (the default) ----------------------
    await setSettings({ primePreload: true });
    await sleep(800);
    const enabled2 = await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets());
    check('Pre-load toggle turns the prime_preload rule set back on', enabled2.includes('prime_preload'), JSON.stringify(enabled2));
    await page.goto('https://www.primevideo.com/detail/test', { waitUntil: 'load' });
    await sleep(600);
    mpd = await page.evaluate(() => fetch('/manifest.mpd').then((r) => r.text()));
    const mpdInfo = (txt) => {
      const ids = [...txt.matchAll(/<Period[^>]*id="([^"]+)"/g)].map((m) => m[1]);
      return { ids, hasDuration: /mediaPresentationDuration=/.test(txt), hasStart: /<Period[^>]*\sstart=/.test(txt) };
    };
    let info = mpdInfo(mpd);
    check('Prime (pre-load, fetch): ad + /interstitial/ periods removed, content kept',
      JSON.stringify(info.ids) === '["content-1","content-2"]' && !info.hasDuration && !info.hasStart, JSON.stringify(info));
    const mpdXhr = await page.evaluate(() => new Promise((res) => {
      const x = new XMLHttpRequest();
      x.open('GET', '/manifest.mpd');
      x.onload = () => res(x.responseText);
      x.send();
    }));
    info = mpdInfo(mpdXhr);
    check('Prime (pre-load, XHR): ad periods removed', JSON.stringify(info.ids) === '["content-1","content-2"]', JSON.stringify(info));
    const pruned = await page.evaluate(() => JSON.parse(JSON.stringify({
      cuepointPlaylist: { a: 1 },
      vodPlaybackUrls: { result: { playbackUrls: { cuepoints: [1, 2], urlSets: { x: 1 } } } },
      vodPlaylistedPlaybackUrls: { result: { playbackUrls: {
        pauseBehavior: 'x', pauseAdsResolution: 'y',
        intraTitlePlaylist: [{ type: 'MAIN', url: 'm' }, { type: 'AD', shouldShowOnScrubBar: true }],
      } } },
      ads: { z: 1 },
      keep: true,
    })));
    const pu = pruned.vodPlaylistedPlaybackUrls.result.playbackUrls;
    check('Prime (pre-load): ad cue points, pause ads and ad playlist items removed from playback data',
      !('cuepointPlaylist' in pruned) && !('cuepoints' in pruned.vodPlaybackUrls.result.playbackUrls) &&
      !('pauseBehavior' in pu) && !('pauseAdsResolution' in pu) && pu.intraTitlePlaylist.length === 1 &&
      pu.intraTitlePlaylist[0].type === 'MAIN' && !('ads' in pruned) && pruned.keep === true &&
      pruned.vodPlaybackUrls.result.playbackUrls.urlSets.x === 1,
      JSON.stringify(pruned));
    gpr = await page.evaluate(() => new Promise((res) => {
      const x = new XMLHttpRequest();
      x.open('GET', 'https://atv-ps.primevideo.com/cdp/catalog/GetPlaybackResources?deviceAdInsertionTypeOverride=SSAI&desiredResources=PlaybackUrls%2CCuepointPlaylist&x=1');
      x.onload = () => res(JSON.parse(x.responseText));
      x.send();
    }));
    check('Prime (pre-load): playback request asks for no ad insertion and no cue points',
      !gpr.url.includes('deviceAdInsertionTypeOverride') && !gpr.url.includes('CuepointPlaylist') && gpr.url.includes('x=1'), gpr.url);
    const adbFlag = await page.evaluate(() => window.ue_adb_chk);
    check('Prime: ad-block check flag neutralised', adbFlag === 1, String(adbFlag));

    // ---- Amazon shopping page: must not touch product videos ----------------
    await page.goto('https://www.amazon.in/dp/B000TEST', { waitUntil: 'load' });
    await waitFor(page, () => T.state().t > 1);
    await sleep(2500);
    const shop = await page.evaluate(() => T.state());
    check('Amazon shopping page: product video not muted or sped up', !shop.muted && shop.rate === 1, JSON.stringify(shop));

    // ---- JioHotstar -----------------------------------------------------------
    await page.goto('https://www.hotstar.com/in/movies/test', { waitUntil: 'load' });
    await waitFor(page, () => T.state().t > 1.5);
    const blocks = {
      preroll: await fetchStatus(page, 'https://service.hotstar.com/vs/preroll?x=1'),
      midroll: await fetchStatus(page, 'https://service.hotstar.com/vs/midroll?x=1'),
      videoads: await fetchStatus(page, 'https://videoads.hotstar.com/x'),
      hesads: await fetchStatus(page, 'https://hesads.akamaized.net/x.mp4'),
      gampad: await fetchStatus(page, 'https://pubads.g.doubleclick.net/gampad/ads?x=1'),
      getad: await fetchStatus(page, 'https://service.hotstar.com/vs/getad.php?adspot=1'),
      content: await fetchStatus(page, 'https://www.hotstar.com/api/content'),
    };
    check('Hotstar: ad requests blocked (preroll, midroll, videoads, hesads, Google ad requests)',
      ['preroll', 'midroll', 'videoads', 'hesads', 'gampad'].every((k) => blocks[k].startsWith('blocked')), JSON.stringify(blocks));
    check('Hotstar: normal requests still work', blocks.getad.startsWith('ok') && blocks.content.startsWith('ok'));
    check('Hotstar: ad billboards hidden', await page.evaluate(() => T.billboardHidden()));
    const hsJson = await page.evaluate(() => JSON.parse('{"success":{"page":{"spaces":{"player":{"widget_wrappers":[{"widget":{"data":{"intervention_data":{"x":1},"keep":2}}}]}}}}}'));
    const hsData = hsJson.success.page.spaces.player.widget_wrappers[0].widget.data;
    check('Hotstar: ad interventions removed from page data', !('intervention_data' in hsData) && hsData.keep === 2, JSON.stringify(hsData));

    await page.evaluate(() => T.startAdVideo());
    const adv = await waitFor(page, () => { const s = T.adVideoState(); return Number.isFinite(s.d) && s.t > s.d - 1 && s; }, 6000);
    check('Hotstar: separate ad video muted and ended', !!adv && adv.muted, JSON.stringify(adv));
    await page.evaluate(() => T.adVideo.parentNode.remove());

    ad = await page.evaluate(() => T.startBadgeAd(30));
    jumped = await waitFor(page, (s) => T.state().t > s + 25 && T.state(), 4000, ad.start);
    check('Hotstar: "Ad" badge countdown in the main video is jumped over', !!jumped, jumped ? `video ${ad.start.toFixed(1)}s -> ${jumped.t.toFixed(1)}s` : 'no jump');
    await waitFor(page, () => T.ad.done, 6000);
    await sleep(1500);
    after = await page.evaluate(() => T.state());
    check('Hotstar: sound and speed restored', !after.muted && after.rate === 1, JSON.stringify(after));

    // ---- Turning a site off really turns it off ------------------------------
    await setSettings({ hotstarEnabled: false });
    await sleep(800);
    await page.goto('https://www.hotstar.com/in/movies/test', { waitUntil: 'load' });
    await sleep(800);
    const off = {
      preroll: await fetchStatus(page, 'https://service.hotstar.com/vs/preroll?x=1'),
      billboard: await page.evaluate(() => T.billboardHidden()),
    };
    check('Hotstar switched off: nothing blocked or hidden', off.preroll.startsWith('ok') && !off.billboard, JSON.stringify(off));
    await setSettings({ hotstarEnabled: true });


    // ---- YouTube: on by default, nothing to set up ---------------------------
    const ytScripts = () => sw.evaluate(() => chrome.scripting.getRegisteredContentScripts().then((l) => l.map((x) => `${x.id}:${x.world || 'ISOLATED'}`)));
    check('YouTube: "remove ads before they load" script registered by default', JSON.stringify(await ytScripts()) === '["bl-yt-main:MAIN"]', JSON.stringify(await ytScripts()));
    await page.goto('https://www.youtube.com/watch?v=test', { waitUntil: 'load' });
    await waitFor(page, () => T.state().t > 1.5);
    let yt = await page.evaluate(() => ({
      adItem: T.shown('adItem'), masthead: T.shown('masthead-ad'), playerAds: T.shown('player-ads'), normal: T.shown('normalItem'),
    }));
    check('YouTube (no setup): feed, masthead and companion ad slots hidden, normal videos kept',
      !yt.adItem && !yt.masthead && !yt.playerAds && yt.normal, JSON.stringify(yt));
    yt = await page.evaluate(() => ({ data: 'adPlacements' in ytInitialPlayerResponse }));
    check('YouTube (default): ad schedule removed from the page\'s player data', !yt.data);

    // One ad, no countdown on screen: jump to the end of the ad clip.
    await sleep(1000);
    let wall = Date.now();
    let yad = await page.evaluate(() => T.startAd());
    const ytMuted = await waitFor(page, () => T.state().ad && T.state().muted, 2000);
    check('YouTube: ad muted', !!ytMuted);
    await waitFor(page, () => T.ad.done, 8000);
    let ytDone = await page.evaluate(() => ({ ...T.ad }));
    check('YouTube: 30s ad skipped in seconds by jumping to its end',
      ytDone.done && ytDone.seeks >= 1 && Date.now() - wall < 5000, `gone after ${((Date.now() - wall) / 1000).toFixed(1)}s, ${ytDone.seeks} jump(s)`);
    await sleep(1500);
    let ytAfter = await page.evaluate(() => T.state());
    check('YouTube: video resumes where it left off, sound and speed back',
      !ytAfter.muted && ytAfter.rate === 1 && !ytAfter.ad && /video\.webm$/.test(ytAfter.src) && Math.abs(ytAfter.t - yad.resumeAt) < 4,
      `resume ${yad.resumeAt.toFixed(1)}s, now ${ytAfter.t.toFixed(1)}s, muted ${ytAfter.muted}, rate ${ytAfter.rate}`);

    // Two ads back to back, with YouTube's countdown on screen.
    wall = Date.now();
    yad = await page.evaluate(() => T.startAd({ count: 2, countdown: true }));
    await waitFor(page, () => T.ad.done, 12000);
    ytDone = await page.evaluate(() => ({ ...T.ad }));
    check('YouTube: two-ad break, both ads skipped', ytDone.done && ytDone.played === 2 && Date.now() - wall < 8000,
      `${ytDone.played} ads, gone after ${((Date.now() - wall) / 1000).toFixed(1)}s`);
    await sleep(1500);

    // Player refuses the jump: Skip button is clicked once it appears.
    yad = await page.evaluate(() => T.startAd({ skipButton: true, blockSeek: true }));
    const ytSkip = await waitFor(page, () => T.skipClicked, 5000);
    check('YouTube: clicks Skip as soon as it appears', !!ytSkip);
    await waitFor(page, () => T.ad.done, 5000);
    await sleep(1500);
    ytAfter = await page.evaluate(() => T.state());
    check('YouTube: after Skip, sound and speed back', !ytAfter.muted && ytAfter.rate === 1, JSON.stringify(ytAfter));

    // The break starts a moment before the ad clip loads: the real video must not be jumped.
    const before = await page.evaluate(() => T.state().t);
    yad = await page.evaluate(() => T.startAd({ delaySrc: 1200 }));
    await sleep(700);
    const settle = await page.evaluate(() => T.state());
    check('YouTube: while the ad is still loading, the video is muted but never jumped or sped up',
      settle.muted && settle.rate === 1 && /video\.webm$/.test(settle.src) && settle.t < before + 2.5,
      `t ${before.toFixed(1)} -> ${settle.t.toFixed(1)}, rate ${settle.rate}, muted ${settle.muted}`);
    await waitFor(page, () => T.ad.done, 8000);
    await sleep(1500);
    ytAfter = await page.evaluate(() => T.state());
    check('YouTube: then the ad is skipped and the video continues from the same spot',
      !ytAfter.muted && ytAfter.rate === 1 && Math.abs(ytAfter.t - yad.resumeAt) < 4,
      `resume ${yad.resumeAt.toFixed(1)}s, now ${ytAfter.t.toFixed(1)}s`);

    // Removing ads before they load (default).
    await page.goto('https://www.youtube.com/watch?v=test', { waitUntil: 'load' });
    await sleep(800);
    const ytData = await page.evaluate(async () => {
      const p = ytInitialPlayerResponse;
      const next = await fetch('/youtubei/v1/player').then((r) => r.json());
      const other = JSON.parse('{"adPlacements":1,"foo":2}');
      return {
        initial: ['adPlacements', 'playerAds', 'adSlots'].filter((k) => k in p), kept: !!p.videoDetails && !!p.streamingData,
        next: ['adPlacements', 'playerAds', 'adSlots'].filter((k) => k in next), nextKept: next.keep === 1,
        other: 'adPlacements' in other,
      };
    });
    check('YouTube (pre-load): ad schedule removed from page and fetched player data, rest kept',
      ytData.initial.length === 0 && ytData.kept && ytData.next.length === 0 && ytData.nextKept, JSON.stringify(ytData));
    check('YouTube (pre-load): non-player data never touched', ytData.other, JSON.stringify(ytData));
    await setSettings({ youtubePreload: false });
    await sleep(800);
    const regOff = await ytScripts();
    await page.goto('https://www.youtube.com/watch?v=test', { waitUntil: 'load' });
    await sleep(800);
    const untouched = await page.evaluate(() => 'adPlacements' in ytInitialPlayerResponse);
    check('YouTube pre-load switched off: script removed, YouTube\'s player data untouched', regOff.length === 0 && untouched, JSON.stringify({ regOff, untouched }));
    await setSettings({ youtubePreload: true });
    await sleep(800);
    check('YouTube pre-load back on: script registered again', JSON.stringify(await ytScripts()) === '["bl-yt-main:MAIN"]', JSON.stringify(await ytScripts()));

    // Switching YouTube off really turns it off.
    await setSettings({ youtubeEnabled: false });
    await sleep(800);
    await page.goto('https://www.youtube.com/watch?v=test', { waitUntil: 'load' });
    await waitFor(page, () => T.state().t > 1.5);
    await page.evaluate(() => T.startAd());
    await sleep(1500);
    yt = await page.evaluate(() => ({ adSlot: T.shown('adItem'), ...T.state(), seeks: T.ad.seeks }));
    check('YouTube switched off: ad slots shown, ad plays untouched (not muted, not jumped)',
      yt.adSlot && yt.ad && !yt.muted && yt.rate === 1 && yt.seeks === 0, JSON.stringify(yt));
    await setSettings({ youtubeEnabled: true });
    await sleep(600);

    // ---- Popup ----------------------------------------------------------------
    const pop = await browser.newPage();
    await pop.setViewport({ width: 320, height: 420, deviceScaleFactor: 2 });
    await pop.goto(`chrome-extension://${extId}/popup/popup.html`, { waitUntil: 'load' });
    await sleep(400);
    const shown = await pop.evaluate(() => document.getElementById('skipped').textContent);
    check('Popup shows ad breaks handled counter', Number(shown) >= 8, `counter = ${shown}`);
    let popState = await pop.evaluate(() => ({
      access: !document.getElementById('access').hidden,
      yt: document.getElementById('youtubeEnabled').checked,
      preload: document.getElementById('primePreload').checked,
      ytPreload: document.getElementById('youtubePreload').checked,
      beta: [...document.querySelectorAll('.beta')].map((b) => b.closest('.row').querySelector('input').id),
    }));
    check('Popup: everything on by default, no Beta labels, no access warning',
      !popState.access && popState.yt && popState.preload && popState.ytPreload && popState.beta.length === 0, JSON.stringify(popState));
    await pop.screenshot({ path: path.join(__dirname, 'popup.png'), clip: { x: 0, y: 0, width: 320, height: (await pop.evaluate(() => document.body.scrollHeight)) } });

    // Site access withheld (what Edge did). Chrome won't let a test switch required access off,
    // so the popup is shown the answer the browser gives in that case: JioHotstar not allowed.
    const pop2 = await browser.newPage();
    await pop2.setViewport({ width: 320, height: 420, deviceScaleFactor: 2 });
    await pop2.evaluateOnNewDocument(() => {
      const real = chrome.permissions.contains.bind(chrome.permissions);
      chrome.permissions.contains = (p) => (p.origins || []).some((o) => /hotstar/.test(o)) ? Promise.resolve(false) : real(p);
    });
    await pop2.goto(`chrome-extension://${extId}/popup/popup.html`, { waitUntil: 'load' });
    await sleep(400);
    popState = await pop2.evaluate(() => ({ access: !document.getElementById('access').hidden, text: document.getElementById('accessText').textContent }));
    check('Popup: warns when site access is switched off, with an Allow button', popState.access && /JioHotstar/.test(popState.text) && !/Prime/.test(popState.text), JSON.stringify(popState));
    await pop2.screenshot({ path: path.join(__dirname, 'popup-access.png'), clip: { x: 0, y: 0, width: 320, height: (await pop2.evaluate(() => document.body.scrollHeight)) } });

    console.log('\nExtension console lines seen:', consoleLines.length);
  } catch (e) {
    check('test run completed', false, e.stack);
  } finally {
    await browser.close();
    await server.stop();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    process.exit(failed.length ? 1 : 0);
  }
})();
