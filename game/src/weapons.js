// weapons.js — everything a trigger pull causes: fire rates, spread that
// punishes moving, recoil, reloads, hitscan against heads and bodies with
// range falloff and armour, and thrown frag/flash grenades. Also builds the
// first-person viewmodels. Damage and kills are reported through G.events so
// rounds.js can score them and hud.js can print the killfeed.

import * as THREE from 'three';
import { WEAPONS, GRENADES, ARMOR_ABSORB } from './config.js';
import { eyeHeight, headHeight } from './actors.js';
import { raycastWorld, segmentClear } from './physics.js';

export function makeWeaponState(id) {
  const def = WEAPONS[id];
  return { id, mag: def.mag, reserve: def.reserve, cooldown: 0, reloading: 0, drawT: 0 };
}

export function makeKit() {
  return {
    primary: null,
    sidearm: makeWeaponState('pistol'),
    current: 'sidearm', // 'primary' | 'sidearm' | 'frag' | 'flash'
    grenades: { frag: 0, flash: 0 },
    hasCharge: false,
  };
}

export function currentWeapon(actor) {
  const k = actor.kit;
  if (!k || k.current === 'frag' || k.current === 'flash') return null;
  return k[k.current];
}

export function giveWeapon(kit, id) {
  const slot = WEAPONS[id].slot;
  kit[slot] = makeWeaponState(id);
  kit.current = slot;
}

// Aim direction from yaw/pitch: yaw 0 faces +z, pitch positive looks up.
export function aimDir(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out.x = Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = Math.cos(yaw) * cp;
  return out;
}

const _dir = { x: 0, y: 0, z: 0 };
const _hit = { dist: 0, x: 0, y: 0, z: 0 };

// Ray vs one actor: head sphere first, then the body box. Returns
// {dist, part} or null. Dead actors and teammates (when friendlyFire is off)
// are skipped by the caller.
function rayActor(actor, ox, oy, oz, dx, dy, dz, maxDist) {
  const px = actor.pos.x, pz = actor.pos.z;
  // head sphere
  const hx = px - ox, hy = (actor.pos.y + headHeight(actor)) - oy, hz = pz - oz;
  const th = hx * dx + hy * dy + hz * dz;
  if (th > 0 && th < maxDist) {
    const cx = ox + dx * th - px, cy = oy + dy * th - (actor.pos.y + headHeight(actor)), cz = oz + dz * th - pz;
    if (cx * cx + cy * cy + cz * cz < 0.21 * 0.21) return { dist: th, part: 'head' };
  }
  // body box: x/z half 0.36, y from feet to 1.52 standing / 1.08 crouched
  const top = actor.pos.y + (actor.crouch ? 1.08 : 1.52);
  const x0 = px - 0.36, x1 = px + 0.36, z0 = pz - 0.36, z1 = pz + 0.36;
  let tmin = 0, tmax = maxDist;
  if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return null; }
  else {
    let t1 = (x0 - ox) / dx, t2 = (x1 - ox) / dx;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (Math.abs(dy) < 1e-9) { if (oy < actor.pos.y || oy > top) return null; }
  else {
    let t1 = (actor.pos.y - oy) / dy, t2 = (top - oy) / dy;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) return null; }
  else {
    let t1 = (z0 - oz) / dz, t2 = (z1 - oz) / dz;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return { dist: tmin, part: 'body' };
}

export function falloff(def, dist) {
  if (dist <= def.falloffStart) return 1;
  if (dist >= def.falloffEnd) return def.minFalloff;
  const t = (dist - def.falloffStart) / (def.falloffEnd - def.falloffStart);
  return 1 + (def.minFalloff - 1) * t;
}

// Apply damage, credit the kill, queue events. Returns true if it killed.
export function applyDamage(G, target, amount, attacker, part) {
  if (!target.alive) return false;
  let dmg = amount;
  if (target.armor) dmg *= part === 'head' ? 0.75 : 1 - ARMOR_ABSORB;
  target.health -= dmg;
  target.flashT = 1;
  G.events.push({ type: 'damage', target, attacker, amount: dmg, part });
  if (target.health <= 0) {
    target.health = 0;
    target.alive = false;
    target.deathT = 0;
    if (attacker && attacker !== target) {
      attacker.kills++;
      attacker.money += 300;
    }
    target.deaths++;
    G.events.push({ type: 'kill', target, attacker, part });
    G.audio.kill();
    return true;
  }
  return false;
}

// One hitscan shot. Spread is applied by the caller through G.rng so shot
// scenes stay deterministic.
function fireOne(G, actor, def, wstate) {
  const rng = G.rng;
  const spreadMul = (actor.speed2d > 0.6 ? def.moveSpread : 1) * (actor.crouch ? def.crouchSpread : 1);
  const spread = def.spread * spreadMul;
  aimDir(actor.yaw, actor.pitch, _dir);
  // perturb inside a cone
  let dx = _dir.x + (rng() * 2 - 1) * spread;
  let dy = _dir.y + (rng() * 2 - 1) * spread;
  let dz = _dir.z + (rng() * 2 - 1) * spread;
  const il = 1 / Math.hypot(dx, dy, dz);
  dx *= il; dy *= il; dz *= il;
  const ox = actor.pos.x, oy = actor.pos.y + eyeHeight(actor), oz = actor.pos.z;

  raycastWorld(G.colliders, ox, oy, oz, dx, dy, dz, def.range, _hit);
  let bestActor = null, bestPart = null, bestDist = _hit.dist;
  for (const other of G.actors) {
    if (other === actor || !other.alive || other.team === actor.team) continue;
    const r = rayActor(other, ox, oy, oz, dx, dy, dz, bestDist);
    if (r && r.dist < bestDist) { bestDist = r.dist; bestActor = other; bestPart = r.part; }
  }
  const ex = ox + dx * bestDist, ey = oy + dy * bestDist, ez = oz + dz * bestDist;
  G.effects.tracer(ox, oy - 0.08, oz, ex, ey, ez, def.tracer);
  if (bestActor) {
    const dmg = def.damage * falloff(def, bestDist) * (bestPart === 'head' ? def.headMult : 1);
    G.effects.blood(ex, ey, ez);
    applyDamage(G, bestActor, dmg, actor, bestPart);
    if (actor.isPlayer) G.events.push({ type: 'hitmark', part: bestPart, killed: !bestActor.alive });
  } else {
    G.effects.impact(ex, ey, ez);
  }
  G.effects.muzzle(actor);
  G.audio.shot(def, actor);
  G.noise.push({ x: actor.pos.x, z: actor.pos.z, r: 26, t: G.time });
  // recoil: the view kicks up and the bloom grows; both decay in updateKit
  actor.recoil = Math.min(0.09, (actor.recoil || 0) + def.kick);
  if (actor.isPlayer) actor.pitch += def.kick * 0.55;
}

// The per-frame weapon brain for one actor. triggerHeld is the shooter's
// intent; semi-automatic weapons need a fresh press, tracked on the actor.
export function updateWeapon(G, actor, triggerHeld, dt) {
  const kit = actor.kit;
  if (!kit || !actor.alive) return;
  const w = currentWeapon(actor);
  if (!w) return;
  const def = WEAPONS[w.id];
  w.cooldown -= dt;
  if (w.drawT > 0) { w.drawT -= dt; return; }
  if (w.reloading > 0) {
    w.reloading -= dt;
    if (w.reloading <= 0) {
      const need = def.mag - w.mag;
      const take = Math.min(need, w.reserve);
      w.mag += take; w.reserve -= take;
    }
    return;
  }
  actor.recoil = Math.max(0, (actor.recoil || 0) - dt * 0.16);
  const pressed = triggerHeld && !actor._triggerWas;
  actor._triggerWas = triggerHeld;
  if (w.mag <= 0) {
    if (pressed) { G.audio.dryFire(); startReload(G, actor); }
    return;
  }
  if (triggerHeld && w.cooldown <= 0 && (def.auto || pressed)) {
    w.cooldown = 60 / def.rpm;
    w.mag--;
    for (let p = 0; p < def.pellets; p++) fireOne(G, actor, def, w);
    if (w.mag === 0 && w.reserve > 0) startReload(G, actor);
  }
}

export function startReload(G, actor) {
  const w = currentWeapon(actor);
  if (!w) return;
  const def = WEAPONS[w.id];
  if (w.reloading > 0 || w.mag >= def.mag || w.reserve <= 0) return;
  w.reloading = def.reloadTime;
  G.audio.reload(actor.isPlayer);
}

export function switchTo(G, actor, slot) {
  const kit = actor.kit;
  if (!kit || kit.current === slot) return;
  if ((slot === 'primary' || slot === 'sidearm') && !kit[slot]) return;
  if ((slot === 'frag' || slot === 'flash') && kit.grenades[slot] <= 0) return;
  kit.current = slot;
  const w = currentWeapon(actor);
  if (w) { w.drawT = 0.32; w.reloading = 0; }
  G.audio.draw(actor.isPlayer);
}

// --- grenades ---------------------------------------------------------------

export function throwGrenade(G, actor) {
  const kit = actor.kit;
  const type = kit.current;
  if (type !== 'frag' && type !== 'flash') return;
  if (kit.grenades[type] <= 0) return;
  kit.grenades[type]--;
  aimDir(actor.yaw, actor.pitch + 0.16, _dir);
  const speed = 15.5;
  G.grenades.push({
    type, fuse: GRENADES[type].fuse, owner: actor,
    x: actor.pos.x + _dir.x * 0.5, y: actor.pos.y + eyeHeight(actor) - 0.1, z: actor.pos.z + _dir.z * 0.5,
    vx: _dir.x * speed, vy: _dir.y * speed + 2.2, vz: _dir.z * speed,
    mesh: G.effects.grenadeMesh(type),
  });
  G.audio.throwIt();
  switchTo(G, actor, kit.primary ? 'primary' : 'sidearm');
}

export function updateGrenades(G, dt) {
  for (let i = G.grenades.length - 1; i >= 0; i--) {
    const g = G.grenades[i];
    g.fuse -= dt;
    g.vy -= 19 * dt;
    let nx = g.x + g.vx * dt, ny = g.y + g.vy * dt, nz = g.z + g.vz * dt;
    if (ny < 0.12) { ny = 0.12; g.vy *= -0.42; g.vx *= 0.72; g.vz *= 0.72; }
    // bounce off boxes: if the new point is inside a collider, undo the axis
    for (const c of G.colliders) {
      if (nx > c.x0 && nx < c.x1 && nz > c.z0 && nz < c.z1 && ny < c.y1) {
        if (g.x <= c.x0 || g.x >= c.x1) g.vx *= -0.45; else g.vz *= -0.45;
        nx = g.x + g.vx * dt; nz = g.z + g.vz * dt;
        break;
      }
    }
    g.x = nx; g.y = ny; g.z = nz;
    if (g.mesh) g.mesh.position.set(g.x, g.y, g.z);
    if (g.fuse <= 0) {
      G.grenades.splice(i, 1);
      if (g.mesh) G.effects.removeMesh(g.mesh);
      explode(G, g);
    }
  }
}

function explode(G, g) {
  const def = GRENADES[g.type];
  if (g.type === 'frag') {
    G.effects.explosion(g.x, g.y, g.z);
    G.audio.explosion(g.x, g.z);
    for (const a of G.actors) {
      if (!a.alive) continue;
      const d = Math.hypot(a.pos.x - g.x, a.pos.z - g.z);
      if (d > def.radius) continue;
      const cx = a.pos.x, cy = a.pos.y + 1, cz = a.pos.z;
      if (!segmentClear(G.colliders, g.x, Math.max(g.y, 0.6), g.z, cx, cy, cz)) continue;
      const dmg = def.damage * (1 - d / (def.radius * 1.25));
      if (dmg > 4) applyDamage(G, a, dmg, g.owner, 'body');
    }
  } else { // flash: blinds whoever faces it with line of sight
    G.effects.flashBang(g.x, g.y, g.z);
    G.audio.flash();
    for (const a of G.actors) {
      if (!a.alive) continue;
      const dx = g.x - a.pos.x, dz = g.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > def.radius) continue;
      aimDir(a.yaw, 0, _dir);
      const dot = (_dir.x * dx + _dir.z * dz) / (d || 1);
      const cx = a.pos.x, cy = a.pos.y + eyeHeight(a), cz = a.pos.z;
      if (!segmentClear(G.colliders, cx, cy, cz, g.x, g.y, g.z)) continue;
      const strength = dot > 0.25 ? 1 : dot > -0.4 ? 0.45 : 0.12;
      a.blindT = Math.max(a.blindT || 0, def.blindMax * strength * (1 - d / (def.radius * 1.6)));
    }
  }
}

// --- viewmodels -------------------------------------------------------------
// One small model per weapon, parented to the camera by main.js. Shapes are
// boxes and cylinders only, distinct silhouettes per gun.

export function buildViewmodel(id) {
  const dark = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.5, metalness: 0.45 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x3a3128, roughness: 0.9 });
  const g = new THREE.Group();
  const box = (mat, w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  if (id === 'pistol') {
    box(dark, 0.07, 0.11, 0.24, 0, 0, 0);
    box(dark, 0.06, 0.16, 0.09, 0, -0.12, -0.05);
    box(dark, 0.02, 0.04, 0.02, 0, 0.07, 0.08);
  } else if (id === 'smg') {
    box(dark, 0.08, 0.14, 0.42, 0, 0, 0);
    box(dark, 0.05, 0.05, 0.2, 0, 0.03, 0.3);
    box(dark, 0.06, 0.22, 0.08, 0, -0.16, 0.02);
    box(grip, 0.06, 0.14, 0.08, 0, -0.1, -0.16);
  } else if (id === 'shotgun') {
    box(dark, 0.09, 0.13, 0.58, 0, 0, 0);
    box(dark, 0.07, 0.07, 0.3, 0, -0.02, 0.4);
    box(grip, 0.08, 0.09, 0.18, 0, -0.08, 0.12); // pump
    box(grip, 0.07, 0.15, 0.09, 0, -0.11, -0.2);
  } else if (id === 'dmr') {
    box(dark, 0.07, 0.12, 0.78, 0, 0, 0);
    box(dark, 0.045, 0.045, 0.4, 0, 0.02, 0.55);
    box(dark, 0.06, 0.2, 0.08, 0, -0.15, -0.02);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.17, 10), dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.11, 0.05);
    g.add(scope);
  } else { // rifle
    box(dark, 0.08, 0.15, 0.62, 0, 0, 0);
    box(dark, 0.05, 0.05, 0.26, 0, 0.04, 0.42);
    box(dark, 0.06, 0.24, 0.09, 0, -0.18, 0.0);
    box(grip, 0.06, 0.14, 0.08, 0, -0.1, -0.2);
    box(dark, 0.03, 0.06, 0.03, 0, 0.1, 0.1); // rear sight post
  }
  return g;
}

// The grenade in hand when a throwable is selected.
export function buildGrenadeViewmodel(type) {
  const mat = new THREE.MeshStandardMaterial({
    color: type === 'frag' ? 0x4a5238 : 0x8b8d89, roughness: 0.55, metalness: 0.3,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), mat);
  m.position.set(0.22, -0.2, -0.42);
  return m;
}
