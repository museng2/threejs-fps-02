// player.js — the human's body: mouse look, acceleration movement with
// friction, crouching, jumping, sprinting, and collision with the yard. The
// numbers are tuned so stopping to shoot is rewarded: spread keys off
// speed2d, which weapons.js reads, and sprinting is loud (bots hear it).

import { MOVE } from './config.js';
import { moveCircle, groundHeight } from './physics.js';

const _mv = { x: 0, z: 0 };

export function applyLook(player, dx, dy, sensitivity) {
  player.yaw -= dx * sensitivity;
  player.pitch -= dy * sensitivity;
  const lim = Math.PI / 2 - 0.02;
  player.pitch = Math.max(-lim, Math.min(lim, player.pitch));
}

// One fixed step of movement. input is the input.js state; G carries the
// colliders and the noise list footsteps are published to.
export function movePlayer(G, input, dt) {
  const p = G.player;
  if (!p.alive) return;
  const k = input.keys;
  p.crouch = k.has('ControlLeft') || k.has('KeyC');
  const fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
  const side = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
  const wantSprint = k.has('ShiftLeft') && fwd > 0 && !p.crouch && !input.aiming;
  p.sprinting = wantSprint;
  const speed = p.crouch ? MOVE.crouchSpeed : wantSprint ? MOVE.sprintSpeed : MOVE.walkSpeed;

  // wish direction in world space (yaw 0 faces +z)
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  let wx = sy * fwd + cy * side;
  let wz = cy * fwd - sy * side;
  const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx /= wl; wz /= wl; }

  const accel = p.grounded ? MOVE.accel : MOVE.airAccel;
  p.vel.x += wx * accel * dt;
  p.vel.z += wz * accel * dt;
  // ground friction: exponential damp toward the wish velocity's cap
  if (p.grounded) {
    const damp = Math.exp(-MOVE.friction * dt);
    if (wl === 0) { p.vel.x *= damp; p.vel.z *= damp; }
    else {
      const cur = Math.hypot(p.vel.x, p.vel.z);
      if (cur > speed) {
        const target = Math.max(speed, cur * damp);
        p.vel.x *= target / cur; p.vel.z *= target / cur;
      }
    }
  } else {
    const cur = Math.hypot(p.vel.x, p.vel.z);
    const cap = Math.max(cur, MOVE.sprintSpeed);
    if (cur > cap) { p.vel.x *= cap / cur; p.vel.z *= cap / cur; }
  }

  // vertical: gravity, jumping, landing on the ground or a box top
  const ground = groundHeight(G.colliders, p.pos.x, p.pos.z, p.pos.y, MOVE.stepHeight);
  p.vel.y -= MOVE.gravity * dt;
  if (p.grounded && k.has('Space')) { p.vel.y = MOVE.jumpSpeed; p.grounded = false; }
  let ny = p.pos.y + p.vel.y * dt;
  if (ny <= ground) { ny = ground; p.vel.y = 0; p.grounded = true; }
  else if (ny > ground + 0.02) p.grounded = false;
  p.pos.y = ny;

  moveCircle(G.colliders, p.pos.x, p.pos.z, MOVE.radius,
    p.vel.x * dt, p.vel.z * dt, p.pos.y, MOVE.stepHeight, _mv);
  p.pos.x = _mv.x; p.pos.z = _mv.z;

  // footsteps: sprinting carries across the yard, walking is quiet
  p._stepT = (p._stepT || 0) - dt;
  if (p.grounded && p.speed2d > 1.2 && p._stepT <= 0) {
    p._stepT = wantSprint ? 0.34 : 0.42;
    G.noise.push({ x: p.pos.x, z: p.pos.z, r: wantSprint ? 15 : 6, t: G.time });
  }
}
