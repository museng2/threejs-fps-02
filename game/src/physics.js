// physics.js — collision and ray tests against the yard's boxes. Every solid
// is a ground-based AABB {x0, z0, x1, z1, y1} (top height y1, base at y=0),
// built once from mapdata. All functions are allocation-free in their hot
// paths: results go into caller-owned objects.

import { BOXES, TANKS, BOUNDS } from './mapdata.js';

export function makeColliders() {
  const list = [];
  for (const b of BOXES) {
    list.push({ x0: b.x - b.w / 2, z0: b.z - b.d / 2, x1: b.x + b.w / 2, z1: b.z + b.d / 2, y1: b.h });
  }
  for (const t of TANKS) {
    list.push({ x0: t.x - t.r, z0: t.z - t.r, x1: t.x + t.r, z1: t.z + t.r, y1: t.h });
  }
  return list;
}

// Ray vs one AABB (slab test). Returns t along dir or Infinity.
function rayBox(ox, oy, oz, dx, dy, dz, c) {
  let tmin = 0, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) { if (ox < c.x0 || ox > c.x1) return Infinity; }
  else {
    let t1 = (c.x0 - ox) / dx, t2 = (c.x1 - ox) / dx;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dy) < 1e-9) { if (oy < 0 || oy > c.y1) return Infinity; }
  else {
    let t1 = (0 - oy) / dy, t2 = (c.y1 - oy) / dy;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < c.z0 || oz > c.z1) return Infinity; }
  else {
    let t1 = (c.z0 - oz) / dz, t2 = (c.z1 - oz) / dz;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

// Nearest hit of a ray against all colliders and the ground plane.
// out: {dist, x, y, z} — dist is Infinity when nothing was hit.
export function raycastWorld(colliders, ox, oy, oz, dx, dy, dz, maxDist, out) {
  let best = maxDist;
  for (let i = 0; i < colliders.length; i++) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, colliders[i]);
    if (t < best) best = t;
  }
  if (dy < -1e-9) { // ground plane y = 0
    const t = -oy / dy;
    if (t >= 0 && t < best) best = t;
  }
  out.dist = best;
  out.x = ox + dx * best; out.y = oy + dy * best; out.z = oz + dz * best;
  return out;
}

// Is the straight 3D segment a->b free of colliders? Used for line of sight
// (eye to eye) and for validating bot waypoint edges in dev.
export function segmentClear(colliders, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const inv = 1 / len;
  for (let i = 0; i < colliders.length; i++) {
    const t = rayBox(ax, ay, az, dx * inv, dy * inv, dz * inv, colliders[i]);
    if (t < len - 0.05) return false;
  }
  return true;
}

// The floor height under a point: the highest collider top the feet can step
// onto (at most stepHeight above the current feet), else the ground, 0.
export function groundHeight(colliders, x, z, feetY, stepHeight) {
  let g = 0;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) {
      if (c.y1 <= feetY + stepHeight && c.y1 > g) g = c.y1;
    }
  }
  return g;
}

// Move a circle (x, z, radius) by (dx, dz), sliding along colliders whose top
// is more than stepHeight above the feet. Writes the result into out {x, z}.
export function moveCircle(colliders, x, z, radius, dx, dz, feetY, stepHeight, out) {
  let nx = x + dx, nz = z + dz;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.y1 <= feetY + stepHeight) continue; // low enough to step onto
      const cx = Math.max(c.x0, Math.min(nx, c.x1));
      const cz = Math.max(c.z0, Math.min(nz, c.z1));
      const px = nx - cx, pz = nz - cz;
      const d2 = px * px + pz * pz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        nx = cx + (px / d) * radius;
        nz = cz + (pz / d) * radius;
      } else {
        // centre inside the box: push out along the smaller penetration axis
        const left = nx - c.x0, right = c.x1 - nx, top = nz - c.z0, bot = c.z1 - nz;
        const m = Math.min(left, right, top, bot);
        if (m === left) nx = c.x0 - radius;
        else if (m === right) nx = c.x1 + radius;
        else if (m === top) nz = c.z0 - radius;
        else nz = c.z1 + radius;
      }
    }
  }
  out.x = Math.max(BOUNDS.x0 + radius, Math.min(BOUNDS.x1 - radius, nx));
  out.z = Math.max(BOUNDS.z0 + radius, Math.min(BOUNDS.z1 - radius, nz));
  return out;
}
