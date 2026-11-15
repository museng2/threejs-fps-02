// dev/debug.mjs — load one URL in the headless shell, print console messages
// and exceptions, then report window.__shotReady and a few globals.
//   node dev/debug.mjs '?shot=combat&seed=1'
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NODE = '/home/hatch/workspace/tools/node22/bin/node';
const CHROME = '/home/hatch/workspace/makefun/browsers/chrome-headless-shell/linux-157.0.8103.78/chrome-headless-shell-linux64/chrome-headless-shell';
const PORT = 8138, CDP = 9338;
const query = process.argv[2] || '';
const server = spawn(NODE, [join(root, 'serve.ts'), '--port', String(PORT)], { stdio: 'ignore' });
const chrome = spawn(CHROME, [
  '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP,
  '--window-size=1280,720', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let msgId = 0;
try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' });
      if (r.ok) target = await r.json();
    } catch { await sleep(200); }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res) => ws.addEventListener('open', res));
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled') {
      console.log('[console]', m.params.type, m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      console.log('[exception]', d.exception?.description || d.text);
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      console.log('[log]', m.params.entry.text, m.params.entry.url || '');
    }
  });
  const send = (method, params = {}) => {
    const id = ++msgId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res) => pending.set(id, res));
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html${query}` });
  await sleep(7000);
  const r = await send('Runtime.evaluate', {
    expression: 'JSON.stringify({ready: window.__shotReady, hasCanvas: !!document.querySelector("canvas"), overlay: document.getElementById("overlay")?.hidden})',
    returnByValue: true,
  });
  console.log('[state]', r.result?.result?.value || JSON.stringify(r.result));
  ws.close();
} finally {
  chrome.kill();
  server.kill();
}
