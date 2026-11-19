const hosts = chrome.runtime.getManifest().host_permissions;
// What each service needs to work at all (the amazon.* stores only matter for Prime played
// inside amazon.in/com/...).
const CORE = {
  prime: ['*://*.primevideo.com/*', '*://*.aiv-delivery.net/*', '*://*.amazonvideo.com/*'],
  hotstar: hosts.filter((h) => /hotstar/.test(h)),
  youtube: hosts.filter((h) => /youtube/.test(h)),
};
const $ = (id) => document.getElementById(id);

if (new URLSearchParams(location.search).has('updated')) {
  $('title').textContent = 'Breakless now works on YouTube';
  $('lead').textContent = "It's already on, nothing to set up. Prime Video ads are now also removed before they load.";
}

const has = (svc) => chrome.permissions.contains({ origins: CORE[svc] }).catch(() => true);

async function render() {
  const ok = {};
  for (const svc of Object.keys(CORE)) ok[svc] = await has(svc);
  for (const li of document.querySelectorAll('.checks li')) li.classList.toggle('on', ok[li.dataset.svc]);
  const all = Object.values(ok).every(Boolean);
  $('needAccess').hidden = all;
  $('sitesCard').classList.toggle('done', all);
  $('stepMark').textContent = all ? '✓' : '!';
}

// Asks for every site Breakless works on; the browser only prompts for the missing ones.
$('allowSites').addEventListener('click', () => {
  chrome.permissions.request({ origins: hosts }).catch(() => false).finally(render);
});

chrome.permissions.onAdded.addListener(render);
chrome.permissions.onRemoved.addListener(render);
render();
