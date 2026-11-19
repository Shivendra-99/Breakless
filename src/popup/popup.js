const DEFAULTS = {
  primeEnabled: true, hotstarEnabled: true, primePreload: true,
  youtubeEnabled: true, youtubePreload: true,
};
const KEYS = Object.keys(DEFAULTS);
const NAMES = { prime: 'Prime Video', hotstar: 'JioHotstar', youtube: 'YouTube' };

// Sites each service needs. All are granted at install, but a browser can install an
// extension with site access switched off (Edge does this), so they are checked.
const hosts = chrome.runtime.getManifest().host_permissions;
const ORIGINS = {
  prime: hosts.filter((h) => !/hotstar|youtube/.test(h)),
  hotstar: hosts.filter((h) => /hotstar/.test(h)),
  youtube: hosts.filter((h) => /youtube/.test(h)),
};
// What has to be allowed for a service to work at all (the amazon.* stores only matter for
// Prime played inside amazon.in/com/...).
const CORE = {
  prime: ['*://*.primevideo.com/*', '*://*.aiv-delivery.net/*', '*://*.amazonvideo.com/*'],
  hotstar: ORIGINS.hotstar,
  youtube: ORIGINS.youtube,
};

const $ = (id) => document.getElementById(id);

function siteOf(url) {
  try {
    const { hostname, pathname } = new URL(url);
    if (/(^|\.)primevideo\.com$/.test(hostname)) return 'prime';
    if (/(^|\.)amazon\.(in|com|co\.uk|de|co\.jp)$/.test(hostname) && pathname.startsWith('/gp/video')) return 'prime';
    if (/(^|\.)(jio)?hotstar\.com$/.test(hostname)) return 'hotstar';
    if (/(^|\.)youtube\.com$/.test(hostname)) return 'youtube';
  } catch (_) {}
  return null;
}

async function allowed(service) {
  try { return await chrome.permissions.contains({ origins: CORE[service] }); } catch (_) { return true; }
}

let missing = [];

async function render() {
  const s = { ...DEFAULTS, skipped: 0, ...(await chrome.storage.local.get([...KEYS, 'skipped'])) };
  for (const k of KEYS) $(k).checked = !!s[k];
  $('primePreload').disabled = !s.primeEnabled;
  $('youtubePreload').disabled = !s.youtubeEnabled;
  $('skipped').textContent = Number(s.skipped || 0).toLocaleString('en-IN');

  const on = { prime: s.primeEnabled, hotstar: s.hotstarEnabled, youtube: s.youtubeEnabled };
  const ok = {};
  for (const svc of Object.keys(CORE)) ok[svc] = await allowed(svc);

  // Switched on, but the browser isn't letting Breakless run there.
  missing = Object.keys(CORE).filter((svc) => on[svc] && !ok[svc]);
  $('access').hidden = missing.length === 0;
  if (missing.length) {
    const list = missing.map((m) => NAMES[m]).join(missing.length > 2 ? ', ' : ' and ');
    $('accessText').textContent = `Breakless isn't allowed on ${list} yet, so it can't skip ads there.`;
  }

  let tab = null;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (_) {}
  const site = tab && tab.url ? siteOf(tab.url) : null;
  const status = $('status');
  const text = $('statusText');
  if (!site) {
    status.dataset.state = 'idle';
    text.textContent = 'Open Prime Video, JioHotstar or YouTube';
  } else if (!on[site]) {
    status.dataset.state = 'off';
    text.textContent = `Paused on ${NAMES[site]}`;
  } else if (!ok[site]) {
    status.dataset.state = 'off';
    text.textContent = `Not allowed on ${NAMES[site]} yet`;
  } else {
    status.dataset.state = 'on';
    text.textContent = `Working on ${NAMES[site]}`;
  }
}

// permissions.request must run straight from the click.
function requestAccess(services) {
  const origins = [...new Set(services.flatMap((svc) => ORIGINS[svc]))];
  return chrome.permissions.request({ origins }).catch(() => false).finally(render);
}

for (const k of KEYS) {
  $(k).addEventListener('change', (e) => {
    const value = e.target.checked;
    chrome.storage.local.set({ [k]: value }).then(render);
  });
}

$('allow').addEventListener('click', () => requestAccess(missing));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ('skipped' in changes || KEYS.some((k) => k in changes))) render();
});
chrome.permissions.onAdded.addListener(render);
chrome.permissions.onRemoved.addListener(render);

render();
