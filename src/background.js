// Breakless background: keeps the network rule sets and the YouTube beta script in step with
// the user's toggles, migrates settings on update, and opens the welcome tab.

const DEFAULTS = {
  primeEnabled: true, hotstarEnabled: true, primePreload: true,
  youtubeEnabled: true, youtubePreload: false,
};
// The YouTube skipper is a normal content script (manifest.json), like Prime's and Hotstar's.
// Only the page-context script for the "before they load" beta is registered here, and only
// while that beta is on, so with it off Breakless never touches YouTube's own JavaScript.
const YT_MAIN = {
  id: 'bl-yt-main', matches: ['*://*.youtube.com/*'], js: ['content/youtube-main.js'],
  runAt: 'document_start', world: 'MAIN', persistAcrossSessions: true,
};

async function readSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

async function syncRulesets() {
  const s = await readSettings();
  const want = {
    prime_basic: s.primeEnabled,
    prime_preload: s.primeEnabled && s.primePreload,
    hotstar_basic: s.hotstarEnabled,
  };
  const enableRulesetIds = Object.keys(want).filter((id) => want[id]);
  const disableRulesetIds = Object.keys(want).filter((id) => !want[id]);
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds, disableRulesetIds });
  } catch (err) {
    console.warn('[Breakless] could not update rule sets', err);
  }
}

async function syncYouTube() {
  const s = await readSettings();
  const want = s.youtubeEnabled && s.youtubePreload;
  let have = [];
  try { have = (await chrome.scripting.getRegisteredContentScripts()).map((x) => x.id); } catch (_) {}
  const drop = have.filter((id) => id !== YT_MAIN.id || !want);
  if (drop.length) await chrome.scripting.unregisterContentScripts({ ids: drop }).catch(() => {});
  if (want && !have.includes(YT_MAIN.id)) {
    await chrome.scripting.registerContentScripts([YT_MAIN]).catch((err) =>
      console.warn('[Breakless] could not register the YouTube page script', err));
  }
}

const sync = () => Promise.all([syncRulesets(), syncYouTube()]);

function olderThan(version, target) {
  const a = String(version || '0').split('.').map(Number);
  const b = target.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0);
  }
  return false;
}

chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  const { skipped } = await chrome.storage.local.get('skipped');
  if (skipped == null) await chrome.storage.local.set({ skipped: 0 });
  if (reason === 'update' && olderThan(previousVersion, '0.3.0')) {
    // 0.2.x saved every default at install, so the old "off" for Prime's pre-load removal
    // is stored even for people who never touched it. It is now a main feature: turn it on.
    await chrome.storage.local.set({ primePreload: true });
  }
  await sync();
  if (reason === 'install') chrome.tabs.create({ url: 'welcome/welcome.html' });
  if (reason === 'update' && olderThan(previousVersion, '0.3.0')) chrome.tabs.create({ url: 'welcome/welcome.html?updated=1' });
});

chrome.runtime.onStartup.addListener(sync);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (['primeEnabled', 'hotstarEnabled', 'primePreload'].some((k) => k in changes)) syncRulesets();
  if ('youtubeEnabled' in changes || 'youtubePreload' in changes) syncYouTube();
});

