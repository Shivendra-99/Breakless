// Breakless background: keeps the network rule sets and the YouTube scripts in step with
// the user's toggles and site permissions, and opens the welcome tab.

const DEFAULTS = {
  primeEnabled: true, hotstarEnabled: true, primePreload: true,
  youtubeEnabled: false, youtubePreload: false,
};
const YOUTUBE = ['*://*.youtube.com/*'];
const YT_SCRIPTS = [
  // Page-context script: strips ad schedules from YouTube's player data (beta toggle).
  { id: 'bl-yt-main', matches: YOUTUBE, js: ['content/youtube-main.js'], runAt: 'document_start', world: 'MAIN' },
  // Isolated script: skips ads in the player and hides ad slots on the page.
  { id: 'bl-yt', matches: YOUTUBE, js: ['content/shared.js', 'content/youtube.js'], runAt: 'document_start' },
];

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

// YouTube is opt-in: its scripts are registered only while the user has YouTube switched on
// and has allowed Breakless on youtube.com. Nothing runs on YouTube otherwise. The page-context
// script is registered only while the "before they load" beta is on, so with the beta off
// Breakless never touches YouTube's own JavaScript.
async function syncYouTube() {
  const s = await readSettings();
  let granted = false;
  try { granted = await chrome.permissions.contains({ origins: YOUTUBE }); } catch (_) {}
  const on = s.youtubeEnabled && granted;
  const want = YT_SCRIPTS.filter((x) => on && (x.world !== 'MAIN' || s.youtubePreload));
  const ids = YT_SCRIPTS.map((x) => x.id);
  let have = [];
  try { have = (await chrome.scripting.getRegisteredContentScripts({ ids })).map((x) => x.id); } catch (_) {}
  const drop = have.filter((id) => !want.some((x) => x.id === id));
  const add = want.filter((x) => !have.includes(x.id));
  if (drop.length) await chrome.scripting.unregisterContentScripts({ ids: drop }).catch(() => {});
  for (const script of add) {
    try {
      await chrome.scripting.registerContentScripts([{ ...script, persistAcrossSessions: true }]);
    } catch (err) {
      console.warn('[Breakless] could not register', script.id, err);
    }
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

chrome.permissions.onAdded.addListener(syncYouTube);
chrome.permissions.onRemoved.addListener(syncYouTube);
