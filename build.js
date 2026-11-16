// Builds dist/chrome (Chrome, Edge, Brave, Opera) and dist/firefox, plus zips.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = __dirname;
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

fs.rmSync(dist, { recursive: true, force: true });
const manifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));

// Chrome / Edge / Brave
const chromeDir = path.join(dist, 'chrome');
copyDir(src, chromeDir);

// Firefox 140+ (MV3 with event-page background; also runs on Firefox for Android 142+)
const ffDir = path.join(dist, 'firefox');
copyDir(src, ffDir);
const ff = JSON.parse(JSON.stringify(manifest));
ff.background = { scripts: ['background.js'] };
ff.browser_specific_settings = {
  gecko: {
    id: 'breakless@extension',
    strict_min_version: '140.0',
    data_collection_permissions: { required: ['none'] },
  },
  gecko_android: { strict_min_version: '142.0' },
};
fs.writeFileSync(path.join(ffDir, 'manifest.json'), JSON.stringify(ff, null, 2) + '\n');

const v = manifest.version;
for (const [dir, name] of [[chromeDir, `breakless-chrome-edge-v${v}.zip`], [ffDir, `breakless-firefox-v${v}.zip`]]) {
  execFileSync('zip', ['-qr', path.join(dist, name), '.'], { cwd: dir });
  console.log('built', path.join('dist', name));
}
