// Local HTTPS server that impersonates the sites in tests (Chrome maps every host to 127.0.0.1).
const https = require('https');
const fs = require('fs');
const path = require('path');

const FIX = path.join(__dirname, 'fixtures');
const PAGES = path.join(__dirname, 'pages');
const log = [];

const MPD = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT10M40S">
  <Period id="content-1" start="PT0S" duration="PT5M"><AdaptationSet><Representation id="v1" bandwidth="1000"><BaseURL>https://cdn.example/content/1.mp4</BaseURL></Representation></AdaptationSet></Period>
  <Period id="ad-1" start="PT5M" duration="PT30S"><SupplementalProperty schemeIdUri="urn:amazon:period-type" value="Ad"/><AdaptationSet><Representation id="a1" bandwidth="1000"><BaseURL>https://cdn.example/ad/1.mp4</BaseURL></Representation></AdaptationSet></Period>
  <Period id="content-2" start="PT5M30S" duration="PT5M"><AdaptationSet><Representation id="v2" bandwidth="1000"><BaseURL>https://cdn.example/content/2.mp4</BaseURL></Representation></AdaptationSet></Period>
  <Period id="promo-1" start="PT10M30S" duration="PT10S"><AdaptationSet><Representation id="p1" bandwidth="1000"><BaseURL>https://cdn.example/interstitial/promo.mp4</BaseURL></Representation></AdaptationSet></Period>
</MPD>`;

function send(res, code, type, body, extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}

function serveVideo(req, res, name = 'video.webm') {
  const file = path.join(FIX, name);
  const size = fs.statSync(file).size;
  const range = req.headers.range;
  if (range) {
    const [s, e] = range.replace('bytes=', '').split('-');
    const start = Number(s);
    const end = e ? Number(e) : size - 1;
    res.writeHead(206, {
      'Content-Type': 'video/webm',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
    });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': 'video/webm', 'Content-Length': size, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  }
}

const server = https.createServer(
  { key: fs.readFileSync(path.join(FIX, 'key.pem')), cert: fs.readFileSync(path.join(FIX, 'cert.pem')) },
  (req, res) => {
    const host = (req.headers.host || '').split(':')[0];
    const url = new URL(req.url, `https://${host}`);
    log.push(`${host}${req.url}`);
    if (req.method === 'OPTIONS') return send(res, 204, 'text/plain', '', { 'Access-Control-Allow-Headers': '*' });
    if (url.pathname === '/video.webm') return serveVideo(req, res);
    if (url.pathname === '/ad.webm') return serveVideo(req, res, 'ad.webm');
    if (url.pathname === '/youtubei/v1/player') {
      return send(res, 200, 'application/json', JSON.stringify({
        playabilityStatus: { status: 'OK' }, videoDetails: { videoId: 'next' },
        adPlacements: [{ a: 1 }], playerAds: [{ b: 1 }], adSlots: [{ c: 1 }], keep: 1,
      }));
    }
    if (/(^|\.)youtube\.com$/.test(host) && (url.pathname === '/' || url.pathname === '/watch')) {
      return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(path.join(PAGES, 'youtube.html')));
    }
    if (url.pathname === '/manifest.mpd') return send(res, 200, 'application/dash+xml', MPD);
    if (url.pathname.endsWith('/GetPlaybackResources')) return send(res, 200, 'application/json', JSON.stringify({ url: req.url }));
    const isPage = /^(www\.)?(primevideo|hotstar|jiohotstar)\.com$|^www\.amazon\./.test(host) && (url.pathname === '/' || url.pathname.startsWith('/detail') || url.pathname.startsWith('/dp/') || url.pathname.startsWith('/in/'));
    if (isPage) {
      let page = 'prime.html';
      if (/hotstar\.com$/.test(host)) page = 'hotstar.html';
      else if (/amazon\./.test(host) && url.pathname.startsWith('/dp/')) page = 'amazon-shopping.html';
      return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(path.join(PAGES, page)));
    }
    return send(res, 200, 'text/plain', 'ok');
  }
);

module.exports = {
  start: () => new Promise((r) => server.listen(443, '127.0.0.1', r)),
  stop: () => new Promise((r) => server.close(r)),
  log,
  MPD,
};
