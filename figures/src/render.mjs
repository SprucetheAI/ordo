// Renders figures.html into figures/<name>-<light|dark>.png at 2x with transparent corners.
// One headless Chrome per shot, no debugging port: `node figures/src/render.mjs [chrome path]`.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '..');
const chrome = process.argv[2] || process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find(existsSync);
const page = pathToFileURL(join(here, 'figures.html')).href;
const FIGS = { hero: 600, loop: 470, numbers: 500, kladds: 470 };

for (const [f, h] of Object.entries(FIGS)) {
  for (const t of ['light', 'dark']) {
    const file = join(out, `${f}-${t}.png`);
    execFileSync(chrome, [
      '--headless=new', '--hide-scrollbars', '--force-device-scale-factor=2', '--default-background-color=00000000',
      `--window-size=1200,${h}`, '--virtual-time-budget=8000', `--screenshot=${file}`, `${page}?f=${f}&t=${t}`,
    ], { stdio: 'ignore' });
    console.log(file);
  }
}

// Share images: a 16:9 cover (2x) for the splash and blog cards, and the 1200x630 og:image crawlers fetch.
for (const [name, w, h, dpr] of [['cover', 1200, 675, 2], ['og', 1200, 630, 1]]) {
  const file = join(out, `${name}.png`);
  execFileSync(chrome, [
    '--headless=new', '--hide-scrollbars', `--force-device-scale-factor=${dpr}`,
    `--window-size=${w},${h}`, '--virtual-time-budget=8000', `--screenshot=${file}`, `${page}?f=hero&t=light&cover=${w}x${h}`,
  ], { stdio: 'ignore' });
  console.log(file);
}
