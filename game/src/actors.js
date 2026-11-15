// actors.js — the ten combatants: their state (position, health, kit, brain)
// and their low-poly character models. Movement and decisions live elsewhere;
// this file owns what an actor *is* and how it *looks* while moving, aiming,
// crouching, hit and dead.

import * as THREE from 'three';
import { TEAMS } from './config.js';

export const NAMES = {
  warden: ['YOU', 'Vex', 'Ondo', 'Pell', 'Sable'],
  breaker: ['Karg', 'Moss', 'Ilya', 'Fen', 'Drogan'],
};

let nextActorId = 0;

export function createActor(team, index, isPlayer) {
  return {
    id: nextActorId++,
    team, index, isPlayer,
    name: NAMES[team][index],
    // kinematics: pos is the feet; yaw/pitch the facing
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0,
    crouch: false, grounded: true, sprinting: false,
    // life
    alive: true, health: 100, armor: false,
    // kit (managed by weapons.js / rounds.js)
    kit: null, money: 0,
    // per-round record
    kills: 0, deaths: 0, assists: 0,
    // presentation
    mesh: null, parts: null, walkPhase: 0, flashT: 0, deathT: 0,
    speed2d: 0,
    // bot brain (bots.js); null for the player
    brain: null,
  };
}

// Eye height above the feet, standing or crouched.
export function eyeHeight(actor) { return actor.crouch ? 1.12 : 1.62; }
// Centre of the head hit-sphere above the feet.
export function headHeight(actor) { return actor.crouch ? 1.22 : 1.66; }

// Build the character model facing +z (so group.rotation.y = yaw aims it).
// Parts are boxes on a shared skeleton of pivots so the pose can swing the
// limbs; materials are cloned per actor so a hit flash lights only one.
export function buildCharacterMesh(teamId) {
  const team = TEAMS[teamId];
  const kit = new THREE.MeshStandardMaterial({ color: 0x33383d, roughness: 0.9 });
  const vest = new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.75 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xb08968, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.6, metalness: 0.3 });

  const group = new THREE.Group();
  const inner = new THREE.Group(); // pitches over on death
  group.add(inner);
  const parts = { inner, mats: [kit, vest, skin, dark] };

  const box = (mat, w, h, d, x, y, z, parent) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    (parent || inner).add(m);
    return m;
  };
  const limb = (mat, w, h, d, x, y, z) => { // a pivot at the top of the limb
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.y = -h / 2;
    m.castShadow = true;
    pivot.add(m);
    inner.add(pivot);
    return pivot;
  };

  parts.legL = limb(kit, 0.17, 0.82, 0.19, -0.13, 0.84, 0);
  parts.legR = limb(kit, 0.17, 0.82, 0.19, 0.13, 0.84, 0);
  parts.torso = box(vest, 0.46, 0.62, 0.26, 0, 1.14, 0);
  box(kit, 0.4, 0.16, 0.22, 0, 0.88, 0); // belt line
  parts.head = box(skin, 0.27, 0.3, 0.28, 0, 1.66, 0);
  box(vest, 0.31, 0.12, 0.32, 0, 1.86, 0); // helmet cap in team colour
  box(dark, 0.24, 0.07, 0.05, 0, 1.68, 0.15); // visor
  parts.armL = limb(kit, 0.13, 0.6, 0.15, -0.31, 1.42, 0);
  parts.armR = limb(kit, 0.13, 0.6, 0.15, 0.31, 1.42, 0);
  // arms angle forward to hold the gun
  parts.armL.rotation.x = -1.15; parts.armL.rotation.z = 0.35;
  parts.armR.rotation.x = -1.25;
  // the gun: receiver, barrel, magazine, stock — one dark shape that reads
  const gun = new THREE.Group();
  const g1 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.62), dark);
  g1.castShadow = true;
  gun.add(g1);
  const g2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34), dark);
  g2.position.set(0, 0.05, 0.44);
  gun.add(g2);
  const g3 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.1), dark);
  g3.position.set(0, -0.15, 0.05);
  gun.add(g3);
  gun.position.set(0.16, 1.32, 0.34);
  inner.add(gun);
  parts.gun = gun;

  group.traverse((o) => { o.matrixAutoUpdate = true; });
  return { group, parts };
}

// Pose the mesh from the actor's state. Called once per render frame.
export function poseCharacter(actor, dt) {
  const { mesh, parts } = actor;
  if (!mesh) return;
  mesh.position.set(actor.pos.x, actor.pos.y, actor.pos.z);
  mesh.rotation.y = actor.yaw;
  const speed = actor.speed2d;
  actor.walkPhase += dt * (2.2 + speed * 1.55);
  const swing = actor.grounded && actor.alive ? Math.min(0.62, speed * 0.14) : 0;
  const s = Math.sin(actor.walkPhase) * swing;
  parts.legL.rotation.x = s;
  parts.legR.rotation.x = -s;
  parts.armL.rotation.x = -1.15 + s * 0.4;
  // right arm and gun track the aim pitch
  const aim = actor.alive ? -actor.pitch : 0;
  parts.gun.rotation.x = aim;
  parts.gun.position.y = 1.32 + (actor.crouch ? -0.38 : 0);
  parts.inner.position.y = actor.crouch ? -0.42 : 0;
  parts.inner.rotation.x = 0;
  if (!actor.alive) {
    actor.deathT = Math.min(1, actor.deathT + dt * 3.2);
    const fall = actor.deathT * actor.deathT;
    parts.inner.rotation.x = -fall * 1.5;
    parts.inner.position.y = -fall * 0.25;
    parts.legL.rotation.x = 0.15; parts.legR.rotation.x = -0.1;
  }
  if (actor.flashT > 0) {
    actor.flashT = Math.max(0, actor.flashT - dt * 6);
    const e = actor.flashT * 0.5;
    for (const m of parts.mats) { m.emissive.setRGB(e, e * 0.22, e * 0.12); }
  }
}
