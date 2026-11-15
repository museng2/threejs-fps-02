// dev/simtest.mjs — loads the game with ?test=1 (player driven by a bot
// brain, sim unthrottled) and waits for window.__testResult, printing it and
// any page errors. Proves rounds, economy, plants and kills actually happen.
//   node dev/simtest.mjs
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NODE = '/home/hatch/workspace/tools/node22/bin/node';
const CHROME = '/home/hatch/workspace/makefun/browsers/chrome-headless-shell/linux-157.0.8103.78/chrome-headless-shell-linux64/chrome-headless-shell';
const PORT = 8139, CDP = 9339;
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
  const errors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push(m.params.args.map((a) => a.value || '').join(' '));
    }
  });
  const send = (method, params = {}) => {
    const id = ++msgId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res) => pending.set(id, res));
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?test=1` });
  const start = Date.now();
  let result = null;
  while (Date.now() - start < 150000) {
    const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__testResult || null)', returnByValue: true });
    const v = r.result?.result?.value;
    if (v && v !== 'null') { result = JSON.parse(v); break; }
    await sleep(1000);
  }
  console.log('wall time', ((Date.now() - start) / 1000).toFixed(1) + 's');
  console.log('result', JSON.stringify(result, null, 1));
  console.log('page errors', errors.length ? errors : 'none');
  ws.close();
} finally {
  chrome.kill();
  server.kill();
}
