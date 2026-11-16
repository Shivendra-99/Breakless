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
    check('default rule sets on: prime_basic + hotstar_basic (beta off)',
      enabled.includes('prime_basic') && enabled.includes('hotstar_basic') && !enabled.includes('prime_preload'),
      JSON.stringify(enabled));
    const setSettings = (obj) => sw.evaluate((o) => chrome.storage.local.set(o), obj);

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

    // ---- Prime: beta OFF -> manifest and JSON untouched ----------------------
    let mpd = await page.evaluate(() => fetch('/manifest.mpd').then((r) => r.text()));
    check('Prime (beta off): manifest left untouched', mpd.includes('value="Ad"'));
    let gpr = await page.evaluate(() =>
      fetch('https://atv-ps.primevideo.com/cdp/catalog/GetPlaybackResources?deviceAdInsertionTypeOverride=SSAI&desiredResources=PlaybackUrls%2CCuepointPlaylist&x=1')
        .then((r) => r.json()));
    check('Prime (beta off): playback request untouched', gpr.url.includes('deviceAdInsertionTypeOverride') && gpr.url.includes('CuepointPlaylist'), gpr.url);

    // ---- Prime: network blocks ----------------------------------------------
    let s1 = await fetchStatus(page, 'https://eu.regolith.prime-video.amazon.dev/getVideoAds?x=1');
    let s2 = await fetchStatus(page, 'https://eu.regolith.prime-video.amazon.dev/getThumbnails?x=1');
    check('Prime: ad-decision call getVideoAds is blocked', s1.startsWith('blocked'), s1);
    check('Prime: other calls on the same server still work', s2.startsWith('ok'), s2);

    // ---- Prime: beta ON ----------------------------------------------------
    await setSettings({ primePreload: true });
    await sleep(800);
    const enabled2 = await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets());
    check('Beta toggle turns on the prime_preload rule set', enabled2.includes('prime_preload'), JSON.stringify(enabled2));
    await page.goto('https://www.primevideo.com/detail/test', { waitUntil: 'load' });
    await sleep(600);
    mpd = await page.evaluate(() => fetch('/manifest.mpd').then((r) => r.text()));
    const mpdInfo = (txt) => {
      const ids = [...txt.matchAll(/<Period[^>]*id="([^"]+)"/g)].map((m) => m[1]);
      return { ids, hasDuration: /mediaPresentationDuration=/.test(txt), hasStart: /<Period[^>]*\sstart=/.test(txt) };
    };
    let info = mpdInfo(mpd);
    check('Prime (beta, fetch): ad + /interstitial/ periods removed, content kept',
      JSON.stringify(info.ids) === '["content-1","content-2"]' && !info.hasDuration && !info.hasStart, JSON.stringify(info));
    const mpdXhr = await page.evaluate(() => new Promise((res) => {
      const x = new XMLHttpRequest();
      x.open('GET', '/manifest.mpd');
      x.onload = () => res(x.responseText);
      x.send();
    }));
    info = mpdInfo(mpdXhr);
    check('Prime (beta, XHR): ad periods removed', JSON.stringify(info.ids) === '["content-1","content-2"]', JSON.stringify(info));
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
    check('Prime (beta): ad cue points, pause ads and ad playlist items removed from playback data',
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
    check('Prime (beta): playback request asks for no ad insertion and no cue points',
      !gpr.url.includes('deviceAdInsertionTypeOverride') && !gpr.url.includes('CuepointPlaylist') && gpr.url.includes('x=1'), gpr.url);
    const adbFlag = await page.evaluate(() => window.ue_adb_chk);
    check('Prime: ad-block check flag neutralised', adbFlag === 1, String(adbFlag));
    await setSettings({ primePreload: false });

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

    // ---- Popup ----------------------------------------------------------------
    const pop = await browser.newPage();
    await pop.setViewport({ width: 320, height: 420, deviceScaleFactor: 2 });
    await pop.goto(`chrome-extension://${extId}/popup/popup.html`, { waitUntil: 'load' });
    await sleep(400);
    const shown = await pop.evaluate(() => document.getElementById('skipped').textContent);
    check('Popup shows ad breaks handled counter', Number(shown) >= 4, `counter = ${shown}`);
    await pop.screenshot({ path: path.join(__dirname, 'popup.png'), clip: { x: 0, y: 0, width: 320, height: (await pop.evaluate(() => document.body.scrollHeight)) } });

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
