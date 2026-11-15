// dev/capture.mjs — takes the game's screenshots with the headless Chrome
// shell over CDP: serves game/ with serve.ts, opens each shots.json entry,
// waits for window.__shotReady, and saves the frame as a JPEG sized and
// weighted for the gate (long side 1280, at most 256 KiB).
//   node dev/capture.mjs [name ...]     (default: every shot in shots.json)
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.env.NODE22 || '/home/hatch/workspace/tools/node22/bin/node';
const CHROME = '/home/hatch/workspace/makefun/browsers/chrome-headless-shell/linux-157.0.8103.78/chrome-headless-shell-linux64/chrome-headless-shell';
const PORT = 8137, CDP = 9337;
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const wanted = process.argv.slice(2);
const list = wanted.length ? shots.filter((s) => wanted.includes(s.name)) : shots;

const server = spawn(NODE, [join(root, 'serve.ts'), '--port', String(PORT)], { stdio: 'ignore' });
const chrome = spawn(CHROME, [
  '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP,
  '--window-size=1280,720', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout, what) {
  const start = Date.now();
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error('timeout: ' + what);
    await sleep(200);
  }
}

let msgId = 0;
function makeClient(ws) {
  const pending = new Map();
  const listeners = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) for (const fn of listeners) fn(m);
  });
  return {
    send(method, params = {}) {
      const id = ++msgId;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((res) => pending.set(id, res));
    },
    on(fn) { listeners.push(fn); },
  };
}

try {
  const target = await until(async () => {
    const r = await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' });
    if (!r.ok) return null;
    return r.json();
  }, 15000, 'chrome cdp');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = makeClient(ws);
  const pageErrors = [];
  cdp.on((m) => {
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error')) {
      pageErrors.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      pageErrors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    }
  });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

  for (const shot of list) {
    pageErrors.length = 0;
    const url = `http://127.0.0.1:${PORT}/index.html${shot.query}`;
    await cdp.send('Page.navigate', { url });
    await until(async () => {
      const r = await cdp.send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true });
      return r.result && r.result.result && r.result.result.value === true;
    }, 30000, 'shotReady ' + shot.name);
    await sleep(120);
    const shotRes = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 82, fromSurface: true });
    const buf = Buffer.from(shotRes.result.data, 'base64');
    const out = join(root, 'screenshots', shot.name);
    writeFileSync(out, buf);
    console.log(`${shot.name}: ${buf.length} bytes${pageErrors.length ? ' PAGE ERRORS: ' + pageErrors.join(' | ') : ''}`);
    if (buf.length > 262144) console.log(`  WARNING: over the 256 KiB gate cap`);
  }
  ws.close();
} finally {
  chrome.kill();
  server.kill();
}
