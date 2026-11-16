// Renders the store listing images (tile + screenshots) with headless Chrome.
// Usage: node tools/render-store-assets.js <path-to-popup-screenshot.png>
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const out = path.join(__dirname, '..', 'store-assets');
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(out, 'icon512.png')).toString('base64');
const popupPath = process.argv[2];
const popup = popupPath ? 'data:image/png;base64,' + fs.readFileSync(popupPath).toString('base64') : '';

const BASE = `
  * { box-sizing: border-box; margin: 0; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #fff; overflow: hidden; }
  .bg { position: absolute; inset: 0; background: radial-gradient(1200px 700px at 80% 20%, #12343a 0%, #0b0e13 55%); }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand img { width: 56px; height: 56px; border-radius: 14px; }
  .brand b { font-size: 30px; letter-spacing: .3px; }
  h1 { font-size: 52px; line-height: 1.08; letter-spacing: -.5px; }
  p.lead { font-size: 22px; line-height: 1.45; color: #b7c0cc; }
  .player { position: relative; border-radius: 18px; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.08);
            background:
              radial-gradient(500px 300px at 30% 70%, rgba(255,170,90,.55), transparent 60%),
              radial-gradient(600px 380px at 75% 30%, rgba(80,140,255,.55), transparent 60%),
              linear-gradient(160deg, #1d2b44 0%, #3a2a3f 50%, #6b3b2f 100%); }
  .player .hill { position: absolute; left: -10%; right: -10%; bottom: -30%; height: 70%; border-radius: 50%;
                  background: linear-gradient(180deg, #13202b, #0a0f14); }
  .player .bar { position: absolute; left: 24px; right: 24px; bottom: 22px; height: 5px; border-radius: 3px; background: rgba(255,255,255,.25); }
  .player .bar i { display: block; height: 100%; width: 38%; border-radius: 3px; background: #fff; }
  .card { position: absolute; left: 50%; top: 34px; transform: translateX(-50%); display: flex; align-items: center; gap: .65em;
          padding: .7em 1.25em .85em; border-radius: 16px; font: 700 26px/1.15 system-ui, sans-serif; min-width: 12em;
          background: linear-gradient(135deg, #12b886 0%, #0e7490 100%);
          box-shadow: 0 10px 34px rgba(0,0,0,.55), 0 0 0 2px rgba(255,255,255,.28) inset; overflow: hidden; white-space: nowrap; }
  .card.done { background: linear-gradient(135deg, #22c55e 0%, #15803d 100%); }
  .card .ico { width: 1.45em; height: 1.45em; border-radius: 50%; background: rgba(255,255,255,.2); display: grid; place-items: center; }
  .card .ico svg { width: .95em; height: .95em; }
  .card small { display: block; font-weight: 600; font-size: .62em; opacity: .9; margin-top: .15em; }
  .card .p { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: rgba(255,255,255,.25); }
  .card .p i { display: block; height: 100%; width: 82%; background: #fff; }
  .pill { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; background: rgba(255,255,255,.08);
          border: 1px solid rgba(255,255,255,.12); font-size: 17px; color: #d8dee6; }
`;
const SKIP = '<svg viewBox="0 0 24 24"><path d="M4 5.5v13l8.5-6.5L4 5.5zm8.5 0v13L21 12l-8.5-6.5z" fill="#fff"/></svg>';
const DONE = '<svg viewBox="0 0 24 24"><path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z" fill="#fff"/></svg>';

const shots = {
  'screenshot-1-skipping-1280x800.png': [1280, 800, `
    <div class="bg"></div>
    <div style="position:absolute;left:72px;top:70px;width:470px">
      <div class="brand"><img src="${icon}"><b>Breakless</b></div>
      <h1 style="margin-top:56px">Ad breaks,<br>skipped for you.</h1>
      <p class="lead" style="margin-top:22px">When an ad starts, Breakless jumps past it, keeps it muted and brings your show straight back.</p>
      <div style="margin-top:34px;display:flex;flex-wrap:wrap;gap:10px"><span class="pill">Automatic</span><span class="pill">No setup</span><span class="pill">No data collected</span></div>
    </div>
    <div class="player" style="position:absolute;left:600px;top:150px;width:620px;height:500px">
      <div class="hill"></div><div class="bar"><i></i></div>
      <div class="card"><span class="ico">${SKIP}</span><span>Skipping ad<small>Breakless · your show is coming right back</small></span><span class="p"><i></i></span></div>
    </div>`],
  'screenshot-2-done-1280x800.png': [1280, 800, `
    <div class="bg"></div>
    <div style="position:absolute;left:72px;top:70px;width:470px">
      <div class="brand"><img src="${icon}"><b>Breakless</b></div>
      <h1 style="margin-top:56px">Back to your<br>show in seconds.</h1>
      <p class="lead" style="margin-top:22px">Sound and speed come back the moment the ad is gone. Works with Prime Video and JioHotstar in your browser.</p>
    </div>
    <div class="player" style="position:absolute;left:600px;top:150px;width:620px;height:500px">
      <div class="hill"></div><div class="bar"><i style="width:41%"></i></div>
      <div class="card done"><span class="ico">${DONE}</span><span>Ad skipped<small>Breakless</small></span></div>
    </div>`],
  'screenshot-3-popup-1280x800.png': [1280, 800, `
    <div class="bg"></div>
    <div style="position:absolute;left:72px;top:70px;width:520px">
      <div class="brand"><img src="${icon}"><b>Breakless</b></div>
      <h1 style="margin-top:56px">One switch<br>per site.</h1>
      <p class="lead" style="margin-top:22px">Turn sites on or off, see how many ad breaks were handled, and try the stronger beta mode for Prime Video.</p>
      <p class="lead" style="margin-top:22px;font-size:18px;color:#8e98a6">Settings stay in your browser. Nothing is sent anywhere.</p>
    </div>
    <img src="${popup}" style="position:absolute;left:760px;top:60px;width:340px;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.1)">`],
  'small-tile-440x280.png': [440, 280, `
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,#0f766e 0%,#0b3a4a 100%)"></div>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px">
      <img src="${icon}" style="width:96px;height:96px;border-radius:24px;box-shadow:0 10px 30px rgba(0,0,0,.35)">
      <div style="font-size:36px;font-weight:800;letter-spacing:.3px">Breakless</div>
      <div style="font-size:17px;color:#d4f3ec">Movies &amp; shows without ad breaks</div>
    </div>`],
  'large-tile-1400x560.png': [1400, 560, `
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,#0f766e 0%,#0b3a4a 60%,#0b0e13 100%)"></div>
    <div style="position:absolute;left:90px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:18px;width:640px">
      <div class="brand"><img src="${icon}" style="width:72px;height:72px;border-radius:18px"><b style="font-size:40px">Breakless</b></div>
      <div style="font-size:50px;font-weight:800;line-height:1.1">Movies &amp; shows<br>without ad breaks</div>
      <div style="font-size:22px;color:#cfeee7">Skips ads automatically. No setup.</div>
    </div>
    <div class="player" style="position:absolute;right:90px;top:70px;width:520px;height:420px">
      <div class="hill"></div><div class="bar"><i></i></div>
      <div class="card" style="font-size:22px"><span class="ico">${SKIP}</span><span>Skipping ad<small>Breakless · your show is coming right back</small></span><span class="p"><i></i></span></div>
    </div>`],
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  for (const [name, [w, h, body]] of Object.entries(shots)) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${BASE}</style></head><body style="width:${w}px;height:${h}px;position:relative">${body}</body></html>`, { waitUntil: 'load' });
    await page.screenshot({ path: path.join(out, name), clip: { x: 0, y: 0, width: w, height: h } });
    console.log('wrote', name);
  }
  await browser.close();
})();
