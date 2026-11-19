const hosts = chrome.runtime.getManifest().host_permissions;
const ORIGINS = {
  prime: hosts.filter((h) => !/hotstar/.test(h)),
  hotstar: hosts.filter((h) => /hotstar/.test(h)),
  youtube: ['*://*.youtube.com/*'],
};
const CORE = {
  prime: ['*://*.primevideo.com/*', '*://*.aiv-delivery.net/*', '*://*.amazonvideo.com/*'],
  hotstar: ORIGINS.hotstar,
  youtube: ORIGINS.youtube,
};
const $ = (id) => document.getElementById(id);

if (new URLSearchParams(location.search).has('updated')) {
  $('title').textContent = 'Breakless now works on YouTube';
  $('lead').textContent = 'Prime Video ads are also removed before they load now. Switch YouTube on below if you want it.';
}

const has = (svc) => chrome.permissions.contains({ origins: CORE[svc] }).catch(() => true);

async function render() {
  const ok = { prime: await has('prime'), hotstar: await has('hotstar'), youtube: await has('youtube') };
  for (const li of document.querySelectorAll('.checks li')) li.classList.toggle('on', ok[li.dataset.svc]);
  const sitesOk = ok.prime && ok.hotstar;
  $('allowSites').hidden = sitesOk;
  $('sitesOk').hidden = !sitesOk;
  $('sitesCard').classList.toggle('done', sitesOk);

  const { youtubeEnabled } = await chrome.storage.local.get('youtubeEnabled');
  const ytOn = !!youtubeEnabled && ok.youtube;
  $('ytOn').hidden = ytOn;
  $('ytOk').hidden = !ytOn;
  $('ytCard').classList.toggle('done', ytOn);
}

$('allowSites').addEventListener('click', () => {
  chrome.permissions.request({ origins: [...ORIGINS.prime, ...ORIGINS.hotstar] }).catch(() => false).finally(render);
});

$('ytOn').addEventListener('click', () => {
  chrome.storage.local.set({ youtubeEnabled: true });
  chrome.permissions.request({ origins: ORIGINS.youtube }).catch(() => false).finally(render);
});

chrome.permissions.onAdded.addListener(render);
chrome.permissions.onRemoved.addListener(render);
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && 'youtubeEnabled' in c) render(); });
render();
