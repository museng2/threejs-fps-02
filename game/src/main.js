// main.js — bootstrap and the frame loop. The simulation runs on a fixed
// step (60 Hz) accumulated from rAF time; rendering, camera and HUD read the
// state the step leaves behind. This file also owns the ?shot= scenes the
// screenshots are taken from: deterministic set-ups of real game state,
// rendered by the game's own code and frozen for the capture.

import * as THREE from 'three';
import { buildWorld } from './world.js';
import { createActor, buildCharacterMesh, poseCharacter, eyeHeight } from './actors.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { initMatch, updateRounds, buyItem } from './rounds.js';
import { updateBot, makeBrain } from './bots.js';
import {
  updateWeapon, updateGrenades, startReload, switchTo, throwGrenade,
  currentWeapon, buildViewmodel, buildGrenadeViewmodel, giveWeapon,
} from './weapons.js';
import { applyLook, movePlayer } from './player.js';
import { makeRng } from './rng.js';
import { TEAM_SIZE } from './config.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const seed = Number(params.get('seed') || 1);
const testMode = params.get('test') === '1';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.32;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.08, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);

const { colliders } = buildWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();

// --- actors -------------------------------------------------------------------
const actors = [];
for (const team of ['warden', 'breaker']) {
  for (let i = 0; i < TEAM_SIZE; i++) {
    const a = createActor(team, i, team === 'warden' && i === 0);
    if (!a.isPlayer) {
      const built = buildCharacterMesh(team);
      a.mesh = built.group;
      a.parts = built.parts;
      scene.add(a.mesh);
    }
    actors.push(a);
  }
}
const player = actors[0];

// --- the shared game context every module reads --------------------------------
const G = {
  scene, colliders, actors, effects, audio,
  events: [], noise: [], grenades: [],
  time: 0, rng: shot ? makeRng(seed * 7919 + 13) : Math.random,
  bomb: null, match: null, player, playerAction: false,
  intel: { warden: { x: 0, z: 0, t: -99 }, breaker: { x: 0, z: 0, t: -99 } },
  onBuy(item) {
    const err = buyItem(G, player, item);
    if (err) audio.denied(); else audio.buy();
  },
};

const hud = createHud(G);
const input = createInput(renderer.domElement);
initMatch(G);

// --- viewmodel ------------------------------------------------------------------
const vmHolder = new THREE.Group();
camera.add(vmHolder);
// a soft fill so the gun reads as shaped metal instead of a black slab
const vmLight = new THREE.PointLight(0xdfe8ff, 0.7, 5, 1.6);
vmLight.position.set(0.3, 0.05, -0.25);
camera.add(vmLight);
let vmKey = '';
function refreshViewmodel() {
  const kit = player.kit;
  if (!kit) return;
  const slot = kit.current;
  const key = slot === 'frag' || slot === 'flash' ? slot : (currentWeapon(player) ? currentWeapon(player).id : 'none');
  if (key === vmKey) return;
  vmKey = key;
  while (vmHolder.children.length) vmHolder.remove(vmHolder.children[0]);
  if (key === 'none') return;
  const vm = slot === 'frag' || slot === 'flash' ? buildGrenadeViewmodel(slot) : buildViewmodel(key);
  if (slot !== 'frag' && slot !== 'flash') {
    vm.scale.setScalar(0.55);
    vm.position.set(0.27, -0.245, -0.58);
    vm.rotation.y = Math.PI;
  }
  vmHolder.add(vm);
}

// --- input events -----------------------------------------------------------------
const BUY_BY_DIGIT = ['armor', 'rifle', 'smg', 'shotgun', 'dmr', 'frag', 'flash'];
function drainInputEvents() {
  for (const ev of input.events.splice(0)) {
    if (ev.type === 'lock') {
      if (!ev.locked && started && !shot) overlay.hidden = false;
      continue;
    }
    if (ev.type !== 'key') continue;
    const code = ev.code;
    if (code === 'KeyB' && G.match.phase === 'buy') hud.buyOpen = !hud.buyOpen;
    else if (code === 'KeyR') {
      if (G.match.phase === 'matchover') initMatch(G);
      else startReload(G, player);
    } else if (code.startsWith('Digit')) {
      const n = Number(code.slice(5));
      if (hud.buyOpen && G.match.phase === 'buy' && BUY_BY_DIGIT[n - 1]) G.onBuy(BUY_BY_DIGIT[n - 1]);
      else if (n === 1) switchTo(G, player, 'primary');
      else if (n === 2) switchTo(G, player, 'sidearm');
      else if (n === 3) switchTo(G, player, 'frag');
      else if (n === 4) switchTo(G, player, 'flash');
    }
  }
}

// --- the fixed simulation step ------------------------------------------------------
let prevFiring = false;
function step(dt) {
  G.time += dt;
  const phase = G.match.phase;
  for (const a of actors) { a._px = a.pos.x; a._pz = a.pos.z; }

  if (phase === 'live') {
    G.playerAction = testMode ? !!(player.brain && player.brain.action === 'defuse') : input.held('KeyE');
    if (player.alive && !testMode) movePlayer(G, input, dt);
    for (const a of actors) if (a.brain) updateBot(G, a, dt);
    for (const a of actors) {
      if (!a.alive) continue;
      let trigger = false;
      if (a.isPlayer && !testMode) {
        trigger = input.firing && input.locked && !hud.buyOpen;
        const slot = a.kit.current;
        if ((slot === 'frag' || slot === 'flash') && trigger && !prevFiring) throwGrenade(G, a);
      } else trigger = a.brain ? a.brain.trigger : false;
      updateWeapon(G, a, trigger, dt);
    }
    prevFiring = input.firing;
    updateGrenades(G, dt);
  }
  updateRounds(G, dt);
  for (const a of actors) {
    a.speed2d = Math.hypot(a.pos.x - a._px, a.pos.z - a._pz) / dt;
  }
  if (G.noise.length > 60) G.noise.splice(0, G.noise.length - 60);
  for (const ev of G.events.splice(0)) hud.event(ev);
}

// --- camera and per-frame presentation ----------------------------------------------
let bobPhase = 0, eyeY = 1.62, zoomCur = 1;
function present(dt) {
  for (const a of actors) if (a.mesh) poseCharacter(a, dt);
  // look
  if (input.locked && player.alive && !shot) {
    const d = input.consumeLook();
    const w = currentWeapon(player);
    const ads = input.aiming && w ? (w.id === 'dmr' ? 2.4 : 1.12) : 1;
    zoomCur += (ads - zoomCur) * Math.min(1, dt * 11);
    applyLook(player, d.dx, d.dy, 0.0021 / zoomCur);
  }
  camera.fov = 78 / zoomCur;
  camera.updateProjectionMatrix();
  // eye: crouch dips, walking bobs, death drops
  const targetEye = player.alive ? eyeHeight(player) : 0.5;
  eyeY += (targetEye - eyeY) * Math.min(1, dt * 12);
  bobPhase += dt * (player.grounded ? player.speed2d * 1.6 : 0);
  const bobY = Math.sin(bobPhase * 2) * 0.026 * Math.min(1, player.speed2d / 4);
  const bobX = Math.cos(bobPhase) * 0.014 * Math.min(1, player.speed2d / 4);
  camera.position.set(
    player.pos.x + Math.cos(player.yaw) * bobX,
    player.pos.y + eyeY + bobY,
    player.pos.z - Math.sin(player.yaw) * bobX,
  );
  camera.rotation.set(player.pitch, Math.PI + player.yaw, 0);
  // viewmodel: sway, recoil recovery, reload dip, ADS centring
  refreshViewmodel();
  const vm = vmHolder.children[0];
  if (vm && player.kit && player.kit.current !== 'frag' && player.kit.current !== 'flash') {
    const w = currentWeapon(player);
    const adsK = Math.min(1, Math.max(0, (zoomCur - 1) / 1.4));
    const hipX = 0.27, hipY = -0.245;
    vm.position.x = hipX + (0 - hipX) * adsK;
    vm.position.y = hipY + (-0.155 - hipY) * adsK + Math.sin(bobPhase * 2) * 0.006 * Math.min(1, player.speed2d / 4);
    vm.position.z = -0.58 + (player.recoil || 0) * 1.4;
    vm.rotation.x = (w && w.reloading > 0) ? -0.7 : (player.recoil || 0) * 2.2;
  }
  vmHolder.visible = player.alive;
  effects.update(dt);
  audio.setListener(player.pos.x, player.pos.z);
  if (!shot) hud.sbOpen = input.held('Tab') || G.match.phase === 'matchover';
  hud.update(dt);
}

// --- shot scenes (screenshots) -------------------------------------------------------
// Deterministic set-ups of genuine game state. The sim is never stepped here:
// actors are placed, kits and scores set, effects fired once, then the frame
// is rendered and frozen.

function place(a, x, z, yaw, pitch = 0) {
  a.pos.x = x; a.pos.y = 0; a.pos.z = z;
  a.yaw = yaw; a.pitch = pitch;
  a.speed2d = 0;
}
function kitOut(a, primaryId, armor, mag) {
  if (primaryId) giveWeapon(a.kit, primaryId);
  a.armor = armor;
  const w = currentWeapon(a);
  if (w && mag !== undefined) w.mag = mag;
}
const W = () => actors.filter((a) => a.team === 'warden');
const B = () => actors.filter((a) => a.team === 'breaker');

function setupShot(name) {
  const [w0, w1, w2, w3] = W();
  const [b0, b1, b2, b3] = B();
  const M = G.match;
  if (name === 'combat') {
    M.round = 5; M.score.warden = 3; M.score.breaker = 2;
    M.phase = 'live'; M.phaseT = 47;
    // south of mid, firing north-east across the containers at two breakers
    place(player, -4, -10.5, Math.atan2(9, 6.5), 0.0);
    kitOut(player, 'rifle', true, 24);
    player.health = 72; player.money = 3400;
    place(w1, -9.5, -4, Math.PI / 2 - 0.2); kitOut(w1, 'rifle', true);
    place(w2, -13, -13, Math.PI / 2); kitOut(w2, 'smg', false);
    place(w3, -18, -2, Math.PI / 2); w3.alive = false; w3.health = 0; w3.deathT = 1;
    place(b0, 5, -4, Math.atan2(-9, -6.5)); kitOut(b0, 'rifle', true); b0.health = 65;
    place(b1, 9.5, 0.5, Math.atan2(-13.5, -11)); kitOut(b1, 'smg', true);
    place(b2, 14, -6, Math.atan2(-18, -4.5)); kitOut(b2, 'rifle', false);
    place(b3, 19, 6, -Math.PI / 2); kitOut(b3, 'shotgun', false);
    // a shot already in flight (fired in finishShot, just before the capture,
    // so the tracer and muzzle light are still alive in the frame)
    G.__shotFx = () => {
      effects.muzzle(player);
      effects.tracer(-3.4, 1.55, -9.9, 4.8, 1.35, -4.1, 0xffe9b0);
      effects.blood(4.8, 1.35, -4.1);
      b0.flashT = 0.6;
    };
    hud.event({ type: 'kill', attacker: b2, target: w3, part: 'body' });
    hud.event({ type: 'hitmark', part: 'body', killed: false });
  } else if (name === 'buy') {
    M.round = 3; M.score.warden = 1; M.score.breaker = 1;
    M.phase = 'buy'; M.phaseT = 9;
    place(player, 38, -6, -Math.PI / 2 + 0.18, 0.02);
    kitOut(player, 'rifle', true);
    player.money = 4750;
    place(w1, 35, 2, -Math.PI / 2 + 0.3); kitOut(w1, 'smg', true);
    place(w2, 42, -11, -Math.PI / 2 - 0.25); kitOut(w2, 'rifle', false);
    place(w3, 33, -9, -Math.PI / 2 + 0.1);
    hud.buyOpen = true;
  } else if (name === 'plant') {
    M.round = 8; M.score.warden = 4; M.score.breaker = 3;
    M.phase = 'live'; M.phaseT = 30;
    const b = G.bomb;
    b.planted = true; b.site = 'A'; b.x = 32.5; b.z = -22.5; b.timer = 17.4;
    if (b.mesh) { b.mesh.visible = true; b.mesh.position.set(b.x, 0.12, b.z); }
    place(player, 25, -28, Math.atan2(32.5 - 25, -22.5 + 28), -0.02);
    kitOut(player, 'rifle', true, 17);
    player.health = 58; player.money = 5100;
    place(w1, 23, -22, Math.atan2(36 - 23, -15.5 + 22)); w1.crouch = true; kitOut(w1, 'rifle', true);
    place(b0, 36, -15.5, Math.atan2(25 - 36, -28 + 15.5)); kitOut(b0, 'rifle', true);
    place(b1, 24, -31, Math.atan2(27.5 - 24, -26.5 + 31)); kitOut(b1, 'smg', false);
  } else if (name === 'scoreboard') {
    M.round = 9; M.score.warden = 5; M.score.breaker = 3;
    M.phase = 'live'; M.phaseT = 63;
    place(player, -2, -9.5, Math.PI / 3, 0.03);
    kitOut(player, 'rifle', true, 30);
    player.kills = 9; player.deaths = 4; player.money = 6200;
    const stats = [[w1, 6, 5], [w2, 4, 6], [w3, 3, 5], [b0, 7, 5], [b1, 5, 6], [b2, 4, 7], [b3, 2, 6]];
    for (const [a, k, d] of stats) { a.kills = k; a.deaths = d; }
    place(w1, 4, -14, Math.PI / 2); kitOut(w1, 'rifle', true);
    place(b0, 16, -18, -Math.PI / 2 + 0.5); kitOut(b0, 'dmr', true);
    place(b1, 20, -10, -Math.PI / 2); kitOut(b1, 'rifle', false);
    hud.sbOpen = true;
  }
  G.events.length = 0;
  hud.banner('', '', 0.01);
}

// --- boot and loop ---------------------------------------------------------------------
const overlay = document.getElementById('overlay');
let started = false;
document.getElementById('play').addEventListener('click', () => {
  audio.unlock();
  started = true;
  overlay.hidden = true;
  input.lock();
});

let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (shot) { renderer.render(scene, camera); return; }
  drainInputEvents();
  acc += Math.min(0.12, dt);
  while (acc >= STEP) { step(STEP); acc -= STEP; }
  present(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

if (testMode) {
  // soak test: the player is driven by a bot brain and the sim runs as fast
  // as the CPU allows; window.__testResult reports what happened
  overlay.hidden = true;
  started = true;
  player.brain = makeBrain('hold');
  window.__trace = [];
  let steps = 0;
  const maxSteps = 60 * 600; // ten sim-minutes: several full rounds
  const chunk = () => {
    const end = Math.min(maxSteps, steps + 900);
    while (steps < end) {
      step(STEP); steps++;
      if (steps % 300 === 0) {
        window.__trace.push({
          t: Math.round(G.time), phase: G.match.phase, round: G.match.round,
          planted: G.bomb.planted, target: G.bomb.targetSite,
          progress: G.bomb.progressKind ? G.bomb.progressKind + ':' + G.bomb.progress.toFixed(2) : '-',
          carrierAction: G.bomb.carrier && G.bomb.carrier.brain ? G.bomb.carrier.brain.action : '-',
          actors: actors.map((a) => `${a.name}:${a.team[0]}@${a.pos.x.toFixed(0)},${a.pos.z.toFixed(0)}:${a.alive ? (a.brain ? a.brain.state + '/' + a.brain.role : 'you') : 'dead'}${a.kit.hasCharge ? ':CHARGE' : ''}`),
        });
      }
    }
    if (steps < maxSteps && !G.match.over) { setTimeout(chunk, 0); return; }
    const reasons = {};
    for (const h of G.match.history) reasons[h.reason] = (reasons[h.reason] || 0) + 1;
    window.__testResult = {
      steps, roundsPlayed: G.match.history.length,
      score: { ...G.match.score }, reasons,
      totalKills: actors.reduce((s, a) => s + a.kills, 0),
      totalDeaths: actors.reduce((s, a) => s + a.deaths, 0),
      matchOver: G.match.over, phase: G.match.phase,
    };
    console.log('TEST RESULT', JSON.stringify(window.__testResult));
  };
  setTimeout(chunk, 0);
} else if (shot) {
  overlay.hidden = true;
  started = true;
  setupShot(shot);
  // a few presentation passes so poses and the HUD settle; then the shot's
  // one-frame effects fire and the frame freezes for the capture
  for (let i = 0; i < 3; i++) { present(1 / 30); renderer.render(scene, camera); }
  if (G.__shotFx) { G.__shotFx(); present(0.016); renderer.render(scene, camera); }
  window.__shotReady = true;
} else {
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
