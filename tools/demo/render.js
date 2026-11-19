// Renders the Breakless demo video frames with headless Chrome.
// node tools/demo/render.js video [--portrait]   (stills: node tools/demo/render.js stills 9.9 12 [--portrait])
// then: python3 tools/demo/audio.py tools/demo/mix.wav, and mux with ffmpeg (see README).
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const ROOT = __dirname, FPS = 30, SRC = path.join(__dirname, '..', '..', 'src');
const PORTRAIT = process.argv.includes('--portrait');
const argv = process.argv.filter((a) => a !== '--portrait');
const mode = argv[2];
const W = PORTRAIT ? 1080 : 1920, H = PORTRAIT ? 1920 : 1080, SUF = PORTRAIT ? '_v' : '';
const data = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

function popupDoc() {
  let html = fs.readFileSync(path.join(SRC, 'popup/popup.html'), 'utf8');
  const css = fs.readFileSync(path.join(SRC, 'popup/popup.css'), 'utf8');
  html = html.replace('<link rel="stylesheet" href="popup.css" />', `<style>${css}\nbody{font-family:Inter,system-ui,sans-serif} *{transition:none!important;animation:none!important}</style>`)
    .replace('../icons/icon48.png', data(path.join(SRC, 'icons/icon48.png')))
    .replace('<script src="popup.js"></script>', '');
  return html;
}

async function openPage() {
  const html = fs.readFileSync(path.join(ROOT, 'demo.html'), 'utf8').replaceAll('ICON_SRC', data(path.join(__dirname, '..', '..', 'store-assets', 'icon512.png')))
    .replace('<script>', `<script>window.PORTRAIT = ${PORTRAIT};</script><script>`);
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(async (doc) => {
    const f = document.getElementById('popup');
    await new Promise((r) => { f.onload = r; f.srcdoc = doc; });
    const d = f.contentDocument;
    for (const c of d.querySelectorAll('input[type=checkbox]')) c.checked = true;
    d.getElementById('status').dataset.state = 'on';
    d.getElementById('statusText').textContent = 'Working on YouTube';
    d.getElementById('skipped').textContent = '214';
    await d.fonts.ready;
    window.popupReady(d.documentElement.scrollHeight);
    const rows = [...d.querySelectorAll('label.row')];
    const pick = [rows[0], rows[2], rows[3], d.querySelector('.stat')];
    window.popupRows = pick.map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await document.fonts.ready;
  }, popupDoc());
  return { browser, page };
}
const frame = async (page, t) => { await page.evaluate((tt) => window.render(tt), t); return page.screenshot({ type: 'jpeg', quality: 92 }); };
const encoder = (out) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });

(async () => {
  const { browser, page } = await openPage();
  try {
    if (mode === 'stills') {
      fs.mkdirSync(path.join(ROOT, 'stills' + SUF), { recursive: true });
      for (const t of argv.slice(3).map(Number)) fs.writeFileSync(path.join(ROOT, 'stills' + SUF, `${t}.jpg`), await frame(page, t));
    } else {
      const END = await page.evaluate(() => window.T_END);
      const dir = path.join(ROOT, 'scenes' + SUF); fs.mkdirSync(dir, { recursive: true });
      const total = Math.round(END * FPS), chunk = 240, names = [];
      for (let s = 0, n = 0; s < total; s += chunk, n++) {
        const name = `c${String(n).padStart(2, '0')}`; names.push(name);
        if (argv[3] && !argv[3].split(',').includes(String(n))) continue;
        const tmp = path.join(dir, `${name}.tmp.mp4`), out = path.join(dir, `${name}.mp4`);
        const ff = encoder(tmp);
        for (let i = s; i < Math.min(total, s + chunk); i++) {
          const buf = await frame(page, i / FPS);
          if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
        }
        ff.stdin.end();
        const code = await new Promise((r) => ff.on('close', r));
        if (code !== 0) throw new Error('ffmpeg failed ' + name);
        fs.renameSync(tmp, out);
        console.log('chunk', name);
      }
      fs.writeFileSync(path.join(dir, 'list.txt'), names.map((n) => `file '${n}.mp4'`).join('\n'));
      console.log('rendered', names.length, 'chunks', total, 'frames');
    }
  } finally { await browser.close(); }
})();
