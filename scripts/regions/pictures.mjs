/**
 * The pictures of the regions examples: the page at each example's address in headless Chrome, driven over the
 * DevTools protocol, captured once the map has drawn every tile (OpenLayers `rendercomplete`), cropped to the
 * map without its panel and written as regions/examples/<id>.jpg (640×400) with `magick`.
 *
 *   npm run dev   # then, with the overview before its upload:
 *   BASE=http://localhost:5199/demo/regions/ OVERVIEW=/demo/.local/harmonized-field-data-overview.pmtiles \
 *     node scripts/regions/pictures.mjs [id…]
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EXAMPLES, exampleHash } from '../../regions/src/examples.js';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE ?? 'http://localhost:5173/demo/regions/';
const query = process.env.OVERVIEW ? `?overview=${process.env.OVERVIEW}` : '';
const OUT = new URL('../../regions/examples/', import.meta.url);
const W = 1280;
const H = 800;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function devtools(port) {
  for (let i = 0; i < 50; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = pages.find((p) => p.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}

function client(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id);
      waiting.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      waiting.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return new Promise((resolve) => (ws.onopen = () => resolve({ send, close: () => ws.close() })));
}

const evaluate = async (cdp, expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true })).result.value;

async function picture(cdp, example, dir) {
  // Via a blank page: a new hash on the same page would only fly the map there, not reload it.
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await cdp.send('Page.navigate', { url: `${BASE}${query}${exampleHash(example)}` });
  await sleep(1500);
  // Hide the page around the map, and the panel, so the map fills the window.
  await evaluate(cdp, `(() => {
    const s = document.createElement('style');
    s.textContent = '.site-header, .intro, .map-panel, .zoom-hint, .ol-control, .ol-attribution { display: none !important } .map { height: ${H}px !important }';
    document.head.append(s);
    window.dispatchEvent(new Event('resize'));
    delete document.documentElement.dataset.rendered;
  })()`);
  // Wait until the map has drawn everything and stayed so for a few seconds.
  let last = null;
  for (let i = 0; i < 240; i++) {
    await sleep(1000);
    const now = await evaluate(cdp, 'document.documentElement.dataset.rendered ?? null');
    if (now && now === last) break;
    last = now;
  }
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
  const png = join(dir, `${example.id}.png`);
  writeFileSync(png, Buffer.from(data, 'base64'));
  const out = new URL(`${example.id}.jpg`, OUT).pathname;
  execFileSync('magick', [png, '-resize', '640x400^', '-gravity', 'center', '-extent', '640x400', '-quality', '82', '-strip', out]);
  console.log(example.id, out);
}

const ids = process.argv.slice(2);
const dir = mkdtempSync(join(tmpdir(), 'regions-'));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
  `--window-size=${W},${H}`, `--remote-debugging-port=${port}`, `--user-data-dir=${dir}/profile`, 'about:blank',
], { stdio: 'ignore' });
try {
  const cdp = await client(await devtools(port));
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  for (const e of EXAMPLES.filter((e) => !ids.length || ids.includes(e.id))) await picture(cdp, e, dir);
  cdp.close();
} finally {
  chrome.kill();
}
