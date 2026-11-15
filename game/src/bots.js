// bots.js — the nine bot brains: waypoint pathfinding over the yard graph,
// perception (sight with a field of view and line of sight, hearing gunfire),
// and a small state machine per role: push a site, hold a site, plant the
// charge, rotate on the plant call, defuse. Bots aim with human-like error,
// fire in bursts, strafe in a fight and stop to shoot — the same rules the
// player is judged by.

import { NODES, EDGES, SITES, HOLDS } from './mapdata.js';
import { BOT, WEAPONS } from './config.js';
import { eyeHeight } from './actors.js';
import { segmentClear, moveCircle } from './physics.js';
import { giveWeapon } from './weapons.js';
import { randRange } from './rng.js';

const nodeById = new Map(NODES.map((n) => [n.id, n]));
const adjacency = new Map(NODES.map((n) => [n.id, []]));
for (const [a, b] of EDGES) { adjacency.get(a).push(b); adjacency.get(b).push(a); }

export function nearestNode(x, z) {
  let best = null, bd = Infinity;
  for (const n of NODES) {
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

// Dijkstra over the (tiny) graph; paths are cached, the graph never changes.
const pathCache = new Map();
export function findPath(fromId, toId) {
  const key = fromId + '>' + toId;
  if (pathCache.has(key)) return pathCache.get(key);
  const dist = new Map([[fromId, 0]]);
  const prev = new Map();
  const open = new Set([fromId]);
  while (open.size) {
    let u = null, du = Infinity;
    for (const id of open) { const d = dist.get(id); if (d < du) { du = d; u = id; } }
    open.delete(u);
    if (u === toId) break;
    for (const v of adjacency.get(u)) {
      const w = Math.hypot(nodeById.get(v).x - nodeById.get(u).x, nodeById.get(v).z - nodeById.get(u).z);
      const nd = du + w;
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); open.add(v); }
    }
  }
  const path = [];
  let cur = toId;
  while (cur !== undefined) { path.unshift(cur); if (cur === fromId) break; cur = prev.get(cur); }
  pathCache.set(key, path);
  return path;
}

export function makeBrain(role) {
  return {
    role, state: 'advance', path: [], pathI: 0,
    enemy: null, seenSince: 0, reactT: 0, lastSeen: null, lastSeenT: -99,
    thinkT: Math.random() * 0.12, trigger: false,
    burstT: 0, burstWait: 0, strafeDir: 1, strafeT: 0,
    watchYaw: 0, action: null, actionT: 0,
    holdNode: null, goalNode: null, peekT: 0,
    stuckT: 0, lastX: 0, lastZ: 0, dodgeT: 0, dodgeDir: 0,
  };
}

// Round-start plans, called by rounds.js. siteId is the breakers' target.
export function assignPlans(G, siteId) {
  const siteNode = siteId === 'A' ? 7 : 17;
  const approachesA = [6, 26, 9];
  const approachesB = [19, 29];
  let ai = 0;
  for (const a of G.actors) {
    if (a.isPlayer || !a.brain) continue;
    const b = a.brain;
    const start = nearestNode(a.pos.x, a.pos.z).id;
    b.enemy = null; b.lastSeen = null; b.action = null; b.actionT = 0; b.staged = false;
    if (a.team === 'breaker') {
      if (a.kit.hasCharge) {
        b.role = 'carrier';
        b.path = findPath(start, siteNode).slice();
      } else if (ai % 3 === 2) {
        b.role = 'lurk'; // one breaker works mid and joins late
        b.path = findPath(start, 12).concat(findPath(12, siteNode).slice(1));
      } else {
        b.role = 'push';
        const approach = siteId === 'A' ? approachesA[ai % 3] : approachesB[ai % 2];
        b.path = findPath(start, approach).concat(findPath(approach, siteNode).slice(1));
      }
      b.state = 'advance';
      const site = SITES[siteId];
      b.watchYaw = Math.atan2(site.x - nodeById.get(siteNode).x + 6, site.z - nodeById.get(siteNode).z);
      ai++;
    } else {
      // wardens: split 2/2 across the sites, one floats mid
      const table = { A: HOLDS.A, B: HOLDS.B };
      const which = a.index % 5; // index 0 is the player
      let hold;
      if (which === 1) hold = table.A[0];
      else if (which === 2) hold = table.B[0];
      else if (which === 3) hold = table.A[1];
      else hold = table.B[1];
      b.role = 'hold';
      b.holdNode = hold.node;
      b.watchYaw = Math.atan2(nodeById.get(hold.watch).x - nodeById.get(hold.node).x,
        nodeById.get(hold.watch).z - nodeById.get(hold.node).z);
      b.path = findPath(start, hold.node).slice();
      b.state = 'advance';
    }
    b.pathI = b.path.length > 1 ? 1 : 0;
    b.goalNode = b.path[b.path.length - 1];
  }
}

// What a bot's buy phase buys, cheapest sensible first.
export function botBuy(bot, rng) {
  const kit = bot.kit;
  if (!bot.armor && bot.money >= 650) { bot.money -= 650; bot.armor = true; }
  if (!kit.primary) {
    if (bot.money >= 2700) {
      const id = rng() < 0.18 && bot.money >= 3200 ? 'dmr' : 'rifle';
      bot.money -= WEAPONS[id].price; giveWeapon(kit, id);
    } else if (bot.money >= 1400) { bot.money -= 1400; giveWeapon(kit, 'smg'); }
    else if (bot.money >= 1100 && rng() < 0.5) { bot.money -= 1100; giveWeapon(kit, 'shotgun'); }
  }
  if (kit.grenades.frag === 0 && bot.money >= 300 && rng() < 0.65) { bot.money -= 300; kit.grenades.frag = 1; }
  if (kit.grenades.flash === 0 && bot.money >= 200 && rng() < 0.4) { bot.money -= 200; kit.grenades.flash = 1; }
}

// --- perception ---------------------------------------------------------------

function canSee(G, bot, other) {
  const dx = other.pos.x - bot.pos.x, dz = other.pos.z - bot.pos.z;
  const d2 = dx * dx + dz * dz;
  if (d2 > BOT.seeRange * BOT.seeRange) return false;
  const d = Math.sqrt(d2) || 1;
  const fx = Math.sin(bot.yaw), fz = Math.cos(bot.yaw);
  if ((fx * dx + fz * dz) / d < BOT.seeFovCos && d > 3.5) return false; // point blank is always noticed
  const ey = bot.pos.y + eyeHeight(bot);
  return segmentClear(G.colliders,
    bot.pos.x, ey, bot.pos.z,
    other.pos.x, other.pos.y + 1.3, other.pos.z);
}

function perceive(G, bot, dt) {
  const b = bot.brain;
  let seen = null;
  for (const o of G.actors) {
    if (!o.alive || o.team === bot.team) continue;
    if (canSee(G, bot, o)) { seen = o; break; }
  }
  if (seen) {
    if (b.enemy !== seen) { b.enemy = seen; b.reactT = BOT.reaction * randRange(G.rng, 0.8, 1.35); }
    b.lastSeen = { x: seen.pos.x, z: seen.pos.z };
    b.lastSeenT = G.time;
    b.seenSince += dt;
    // team intel: the whole side learns where contact was made (rotations)
    const intel = G.intel && G.intel[bot.team];
    if (intel) { intel.x = seen.pos.x; intel.z = seen.pos.z; intel.t = G.time; }
  } else {
    b.seenSince = 0;
    if (b.enemy && G.time - b.lastSeenT > 2.6) b.enemy = null;
  }
  // hearing: fresh enemy gunfire pulls attention to its position
  for (const n of G.noise) {
    if (G.time - n.t > 0.4) continue;
    const d = Math.hypot(n.x - bot.pos.x, n.z - bot.pos.z);
    if (d < BOT.hearRange && d > 1) {
      const shooter = G.actors.find((a) => a.alive && a.team !== bot.team &&
        Math.abs(a.pos.x - n.x) < 1 && Math.abs(a.pos.z - n.z) < 1);
      if (shooter && !b.enemy) { b.lastSeen = { x: n.x, z: n.z }; b.lastSeenT = G.time; }
    }
  }
}

// --- movement -----------------------------------------------------------------

const _mv = { x: 0, z: 0 };

function steerTo(G, bot, tx, tz, speed, dt) {
  const b = bot.brain;
  let dx = tx - bot.pos.x, dz = tz - bot.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return true;
  dx /= d; dz /= d;
  if (b.dodgeT > 0) { // sidestep while the stuck timer runs
    b.dodgeT -= dt;
    const px = -dz * b.dodgeDir, pz = dx * b.dodgeDir;
    dx = dx * 0.4 + px; dz = dz * 0.4 + pz;
    const il = 1 / Math.hypot(dx, dz); dx *= il; dz *= il;
  }
  moveCircle(G.colliders, bot.pos.x, bot.pos.z, 0.42, dx * speed * dt, dz * speed * dt, 0, 0.3, _mv);
  bot.pos.x = _mv.x; bot.pos.z = _mv.z;
  // face the walk direction unless fighting or holding
  if (b.state === 'advance') bot.yaw = turnToward(bot.yaw, Math.atan2(dx, dz), 6.5 * dt);
  // stuck detection
  const moved = Math.hypot(bot.pos.x - b.lastX, bot.pos.z - b.lastZ);
  if (moved < 0.12 * dt * 10) b.stuckT += dt; else b.stuckT = 0;
  if (b.stuckT > 0.7) { b.stuckT = 0; b.dodgeT = 0.55; b.dodgeDir = G.rng() < 0.5 ? -1 : 1; }
  b.lastX = bot.pos.x; b.lastZ = bot.pos.z;
  return d < 0.75;
}

export function turnToward(cur, target, maxStep) {
  let diff = target - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return cur + Math.sign(diff) * maxStep;
}

// --- combat -------------------------------------------------------------------

function fight(G, bot, dt) {
  const b = bot.brain;
  const e = b.enemy;
  b.trigger = false;
  if (!e || !e.alive) return;
  const dx = e.pos.x - bot.pos.x, dz = e.pos.z - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  // aim at the chest, the head when close; error grows with range and with
  // how fast the target crosses
  const aimH = dist < 13 ? 1.58 : 1.32;
  const cross = Math.abs(e.speed2d || 0);
  const err = BOT.aimError * (0.7 + dist * 0.012) * (1 + cross * 0.22) * (bot.blindT > 0 ? 6 : 1);
  const wantYaw = Math.atan2(dx, dz) + (G.rng() * 2 - 1) * err;
  const wantPitch = Math.atan2((e.pos.y + aimH) - (bot.pos.y + eyeHeight(bot)), dist) + (G.rng() * 2 - 1) * err * 0.7;
  bot.yaw = turnToward(bot.yaw, wantYaw, 7.5 * dt);
  bot.pitch = turnToward(bot.pitch, wantPitch, 7.5 * dt);
  if (b.reactT > 0) { b.reactT -= dt; return; }
  if (dist > 55) return; // beyond effective range: hold fire, close in instead
  // bursts: hold the trigger in short runs, pause between
  if (b.burstWait > 0) { b.burstWait -= dt; return; }
  if (b.burstT <= 0) b.burstT = randRange(G.rng, 0.16, 0.42);
  b.burstT -= dt;
  b.trigger = true;
  if (b.burstT <= 0) b.burstWait = BOT.burstPause * randRange(G.rng, 0.7, 1.4);
  // strafe while fighting; crouch at range for the accuracy bonus; and if
  // the target is far, keep walking at him between bursts — a bot that
  // strafes in place at 60 m never closes a round out
  b.strafeT -= dt;
  if (b.strafeT <= 0) { b.strafeT = randRange(G.rng, 0.45, 0.95); b.strafeDir = G.rng() < 0.5 ? -1 : 1; }
  bot.crouch = dist > 24 && G.rng() < 0.02;
  const fx = Math.sin(bot.yaw), fz = Math.cos(bot.yaw);
  let mx = -fz * b.strafeDir * 2.1, mz = fx * b.strafeDir * 2.1;
  if (dist > 30) { mx += fx * 2.6; mz += fz * 2.6; }
  moveCircle(G.colliders, bot.pos.x, bot.pos.z, 0.42, mx * dt, mz * dt, 0, 0.3, _mv);
  bot.pos.x = _mv.x; bot.pos.z = _mv.z;
}

// --- the brain tick -------------------------------------------------------------

export function updateBot(G, bot, dt) {
  const b = bot.brain;
  if (!bot.alive) { b.trigger = false; return; }
  b.thinkT -= dt;
  if (b.thinkT <= 0) { b.thinkT = 0.12; perceive(G, bot, 0.12); }
  b.trigger = false;
  bot.crouch = false;
  if ((bot.blindT || 0) > 0) bot.blindT -= dt;

  const bomb = G.bomb;
  // objective override: once the charge is down every warden rotates to it;
  // the first to arrive tries the wires, the rest cover him
  if (bomb.planted && bot.team === 'warden' && b.role !== 'defuse') {
    const siteNode = bomb.site === 'A' ? 7 : 17;
    b.role = 'defuse'; b.state = 'advance';
    b.path = findPath(nearestNode(bot.pos.x, bot.pos.z).id, siteNode);
    b.pathI = 1; b.goalNode = siteNode;
  }
  if (bomb.planted && bot.team === 'breaker') {
    b.role = 'holdsite';
    if (b.state !== 'hold') {
      const near = nearestNode(bot.pos.x, bot.pos.z).id;
      b.path = findPath(near, bomb.site === 'A' ? 7 : 17);
      b.pathI = 1; b.goalNode = bomb.site === 'A' ? 7 : 17;
      b.state = 'advance';
    }
  }

  if (b.enemy && (bot.blindT || 0) <= 0) {
    const dEnemy = Math.hypot(b.enemy.pos.x - bot.pos.x, b.enemy.pos.z - bot.pos.z);
    // the carrier's job is the plant: he only breaks off for a close threat,
    // and once he is on the site he plants through distant contact
    const planting = bot.kit.hasCharge && b.state === 'arrived';
    if (dEnemy <= 46 && !(planting && dEnemy > 18)) { fight(G, bot, dt); return; }
    // beyond effective range there is no cross-map chase: a glimpse of a
    // distant enemy updates intel, but the plan (push the site, hold the
    // angle) still comes first — that is what lets rounds develop into
    // site executes and plants instead of one mid-map brawl
  } else if (b.state === 'hunt') {
    // lost him: fall back to the plan
    b.state = 'advance';
    b.path = findPath(nearestNode(bot.pos.x, bot.pos.z).id, b.goalNode ?? nearestNode(bot.pos.x, bot.pos.z).id);
    b.pathI = 1;
  }

  // the carrier stages one node short of the site: his pushers take first
  // contact at the entry while he stays alive to plant behind them
  if (b.state === 'stage') {
    b.stageT -= dt;
    bot.crouch = true;
    bot.yaw = turnToward(bot.yaw, b.watchYaw + Math.sin(G.time * 0.5 + bot.id) * 0.3, 2 * dt);
    const escortNear = G.actors.some((a) => a !== bot && a.alive && a.team === bot.team &&
      Math.hypot(a.pos.x - bot.pos.x, a.pos.z - bot.pos.z) < 9);
    if (b.stageT <= 0 || escortNear) { b.state = 'advance'; bot.crouch = false; }
  }

  // movement along the plan
  if (b.state === 'advance' || b.state === 'hunt') {
    const node = nodeById.get(b.path[b.pathI]);
    if (!node) { if (b.state === 'advance') b.state = 'hold'; }
    else {
      const far = Math.hypot(node.x - bot.pos.x, node.z - bot.pos.z);
      const sprint = far > 16 && G.time - b.lastSeenT > 4;
      if (steerTo(G, bot, node.x, node.z, sprint ? BOT.sprintSpeed : BOT.speed, dt)) {
        b.pathI++;
        if (bot.kit.hasCharge && !b.staged && b.pathI >= b.path.length - 1 && b.state === 'advance') {
          b.staged = true; b.stageT = 6; b.state = 'stage';
        } else if (b.pathI >= b.path.length && b.state === 'advance') {
          b.state = bot.team === 'warden' && b.role === 'hold' ? 'hold' : 'arrived';
        }
      }
    }
  }

  if (b.state === 'hold') {
    // rotation: fresh team intel of a contact far from this hold sends ONE
    // defender across the map — the first to claim the call rotates, the
    // rest keep holding so the other site is never stripped bare
    const intel = G.intel && G.intel[bot.team];
    let rotated = false;
    if (bot.team === 'warden' && intel && G.time - intel.t < 5 && b.thinkT <= 0.01 &&
        Math.hypot(intel.x - bot.pos.x, intel.z - bot.pos.z) > 16) {
      if (intel.claimT !== intel.t) { intel.claimT = intel.t; intel.claimedBy = 0; }
      if (!intel.claimedBy && G.rng() < 0.6) {
        intel.claimedBy = bot.id;
        b.goalNode = nearestNode(intel.x, intel.z).id;
        b.path = findPath(nearestNode(bot.pos.x, bot.pos.z).id, b.goalNode);
        b.pathI = 1;
        b.state = 'advance';
        rotated = true;
      }
    }
    if (!rotated) {
      bot.yaw = turnToward(bot.yaw, b.watchYaw + Math.sin(G.time * 0.4 + bot.id) * 0.22, 2.2 * dt);
      bot.pitch = 0;
    }
  }
  if (b.state === 'arrived') {
    // on the site with nothing to do: scan the entries, stay a hard target
    bot.yaw = turnToward(bot.yaw, b.watchYaw + Math.sin(G.time * 0.3 + bot.id * 2.1) * 0.7, 1.8 * dt);
    bot.pitch = 0;
  }

  if (b.state === 'arrived' || b.state === 'hold') {
    // the carrier plants when the site is reached and no enemy is near
    if (bot.kit.hasCharge && !bomb.planted && !bomb.planting) {
      const s = SITES[bomb.targetSite];
      if (Math.hypot(bot.pos.x - s.x, bot.pos.z - s.z) < s.r) {
        b.action = 'plant';
        bot.yaw = turnToward(bot.yaw, Math.atan2(s.x - bot.pos.x, s.z - bot.pos.z), 5 * dt);
        return;
      }
      // not there yet: walk to the site centre
      b.state = 'advance';
      b.path = [nearestNode(bot.pos.x, bot.pos.z).id, bomb.targetSite === 'A' ? 7 : 17];
      b.pathI = 1;
    }
    // a warden at the planted charge defuses when the coast looks clear
    if (bomb.planted && bot.team === 'warden' && b.role === 'defuse') {
      const d = Math.hypot(bot.pos.x - bomb.x, bot.pos.z - bomb.z);
      if (d < 2.1) { b.action = 'defuse'; return; }
      b.state = 'advance';
      b.path = [nearestNode(bot.pos.x, bot.pos.z).id, bomb.site === 'A' ? 7 : 17];
      b.pathI = 1;
    }
    b.action = null;
  }
}
