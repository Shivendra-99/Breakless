// Breakless background: keeps the network rule sets in step with the user's toggles.

const DEFAULTS = { primeEnabled: true, hotstarEnabled: true, primePreload: false };

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

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(null);
  await chrome.storage.local.set({ ...DEFAULTS, skipped: 0, ...stored });
  await syncRulesets();
});

chrome.runtime.onStartup.addListener(syncRulesets);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (Object.keys(DEFAULTS).some((k) => k in changes)) syncRulesets();
});
