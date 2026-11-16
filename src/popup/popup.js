const DEFAULTS = { primeEnabled: true, hotstarEnabled: true, primePreload: false };
const KEYS = Object.keys(DEFAULTS);

const $ = (id) => document.getElementById(id);

function siteOf(url) {
  try {
    const { hostname, pathname } = new URL(url);
    if (/(^|\.)primevideo\.com$/.test(hostname)) return 'prime';
    if (/(^|\.)amazon\.(in|com|co\.uk|de|co\.jp)$/.test(hostname) && pathname.startsWith('/gp/video')) return 'prime';
    if (/(^|\.)(jio)?hotstar\.com$/.test(hostname)) return 'hotstar';
  } catch (_) {}
  return null;
}

async function render() {
  const s = { ...DEFAULTS, skipped: 0, ...(await chrome.storage.local.get([...KEYS, 'skipped'])) };
  for (const k of KEYS) $(k).checked = !!s[k];
  $('primePreload').disabled = !s.primeEnabled;
  $('skipped').textContent = Number(s.skipped || 0).toLocaleString('en-IN');

  let tab = null;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (_) {}
  const site = tab && tab.url ? siteOf(tab.url) : null;
  const status = $('status');
  const text = $('statusText');
  if (!site) {
    status.dataset.state = 'idle';
    text.textContent = 'Open Prime Video or JioHotstar';
  } else {
    const name = site === 'prime' ? 'Prime Video' : 'JioHotstar';
    const on = site === 'prime' ? s.primeEnabled : s.hotstarEnabled;
    status.dataset.state = on ? 'on' : 'off';
    text.textContent = on ? `Working on ${name}` : `Paused on ${name}`;
  }
}

for (const k of KEYS) {
  $(k).addEventListener('change', async (e) => {
    await chrome.storage.local.set({ [k]: e.target.checked });
    render();
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ('skipped' in changes || KEYS.some((k) => k in changes))) render();
});

render();
