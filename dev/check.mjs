// dev/check.mjs — local sanity checks that mirror the gate's cheap rows:
// every game .js parses as an ES module, every import resolves inside game/,
// the import map is the only one and points at the vendored three module, and
// every bot waypoint edge walks clear of the colliders at knee height.
// Run: node --experimental-vm-modules dev/check.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gameDir = join(root, 'game');
let failures = 0;
const fail = (msg) => { failures++; console.log('FAIL', msg); };

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const files = [...walk(gameDir)];
const jsFiles = files.filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));
for (const f of jsFiles) {
  try {
    new vm.SourceTextModule(readFileSync(f, 'utf8'), { identifier: f });
  } catch (e) {
    fail(`parse ${f}: ${e.message}`);
  }
}
console.log(`parsed ${jsFiles.length} js files`);

// link the module graph (with a stub for 'three') to catch bad export names
{
  const cache = new Map();
  const load = (path) => {
    if (!cache.has(path)) {
      const mod = new vm.SourceTextModule(readFileSync(path, 'utf8'), { identifier: path });
      cache.set(path, mod);
    }
    return cache.get(path);
  };
  const threeStub = new vm.SyntheticModule(
    ['WebGLRenderer', 'Scene', 'PerspectiveCamera', 'Color', 'Fog', 'HemisphereLight',
     'DirectionalLight', 'MeshStandardMaterial', 'MeshBasicMaterial', 'PlaneGeometry',
     'BoxGeometry', 'CylinderGeometry', 'CircleGeometry', 'TorusGeometry', 'SphereGeometry',
     'Group', 'Mesh', 'CanvasTexture', 'SRGBColorSpace', 'RepeatWrapping', 'BufferGeometry',
     'BufferAttribute', 'Points', 'PointsMaterial', 'Line', 'LineBasicMaterial', 'PointLight',
     'AdditiveBlending', 'PCFSoftShadowMap', 'ACESFilmicToneMapping'],
    function () { for (const n of this.exportNames) this.setExport(n, class {}); },
  );
  const linker = (spec, ref) => {
    if (spec === 'three') return threeStub;
    return load(resolve(dirname(ref.identifier), spec));
  };
  try {
    await load(join(gameDir, 'src/main.js')).link(linker);
    console.log('module graph links');
  } catch (e) {
    fail(`link: ${e.message}`);
  }
}

// import resolution: static + dynamic literal specifiers
const specRe = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;
const html = readFileSync(join(gameDir, 'index.html'), 'utf8');
const maps = [...html.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)];
if (maps.length !== 1) fail(`index.html has ${maps.length} import maps, want 1`);
const importMap = JSON.parse(maps[0][1]);
if (!importMap.imports || !importMap.imports.three) fail('import map lacks "three"');

function resolveSpec(spec, fromFile) {
  if (spec === 'three') {
    // import-map values resolve against the page (game/index.html)
    const target = resolve(gameDir, importMap.imports.three);
    try { statSync(target); } catch { fail(`import map "three" target does not resolve`); }
    return;
  }
  if (!spec.startsWith('./') && !spec.startsWith('../')) { fail(`bare specifier ${spec} in ${fromFile}`); return; }
  const target = resolve(dirname(fromFile), spec);
  if (!target.startsWith(gameDir)) { fail(`specifier ${spec} escapes game/ from ${fromFile}`); return; }
  try { statSync(target); } catch { fail(`specifier ${spec} from ${fromFile} does not resolve`); }
}
for (const f of jsFiles) {
  if (f.includes('vendor')) continue; // vendored three is checked by hash, not by us
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(specRe)) {
    const spec = m[1] || m[2] || m[3];
    if (spec) resolveSpec(spec, f);
  }
}
console.log('imports resolved');

// waypoint edges vs colliders
const { NODES, EDGES } = await import(join(gameDir, 'src/mapdata.js'));
const { makeColliders, segmentClear } = await import(join(gameDir, 'src/physics.js'));
const colliders = makeColliders();
const byId = new Map(NODES.map((n) => [n.id, n]));
for (const [a, b] of EDGES) {
  const A = byId.get(a), B = byId.get(b);
  if (!segmentClear(colliders, A.x, 0.5, A.z, B.x, 0.5, B.z)) {
    fail(`waypoint edge ${a}->${b} crosses a collider`);
  }
}
console.log(`checked ${EDGES.length} waypoint edges, ${colliders.length} colliders`);

// node sanity: no node inside a collider footprint (at ground level)
for (const n of NODES) {
  for (const c of colliders) {
    if (n.x > c.x0 + 0.3 && n.x < c.x1 - 0.3 && n.z > c.z0 + 0.3 && n.z < c.z1 - 0.3 && c.y1 > 0.6) {
      fail(`node ${n.id} sits inside a collider`);
    }
  }
}
console.log(failures === 0 ? 'ALL CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures ? 1 : 0);
