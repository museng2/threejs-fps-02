// effects.js — the moment-to-moment visuals: tracers, impact sparks, blood,
// muzzle flashes, grenade and charge props, explosions. Everything is pooled
// (fixed particle buffer, a ring of tracer lines, two reusable lights), so a
// firefight allocates nothing per frame.

import * as THREE from 'three';
import { eyeHeight } from './actors.js';

const MAX_PARTICLES = 900;
const MAX_TRACERS = 40;

export function createEffects(scene) {
  // particle pool
  const pPos = new Float32Array(MAX_PARTICLES * 3);
  const pCol = new Float32Array(MAX_PARTICLES * 3);
  const pVel = new Float32Array(MAX_PARTICLES * 3);
  const pLife = new Float32Array(MAX_PARTICLES);
  const pGrav = new Float32Array(MAX_PARTICLES);
  for (let i = 0; i < MAX_PARTICLES; i++) pPos[i * 3 + 1] = -999;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.09, vertexColors: true, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  points.frustumCulled = false;
  scene.add(points);
  let pNext = 0;

  function spawn(x, y, z, vx, vy, vz, life, r, g, b, grav) {
    const i = pNext; pNext = (pNext + 1) % MAX_PARTICLES;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
    pCol[i * 3] = r; pCol[i * 3 + 1] = g; pCol[i * 3 + 2] = b;
    pLife[i] = life; pGrav[i] = grav;
  }

  function burst(x, y, z, n, color, speed, life, grav, up) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      spawn(x, y, z,
        Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + up, Math.sin(a) * Math.cos(e) * s,
        life * (0.5 + Math.random() * 0.8), c.r, c.g, c.b, grav);
    }
  }

  // tracer pool
  const tracers = [];
  const tracerMat = () => new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (let i = 0; i < MAX_TRACERS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tNext = 0;

  // reusable lights: one for muzzle flashes, one for explosions
  const muzzleLight = new THREE.PointLight(0xffc37a, 0, 13, 1.8);
  scene.add(muzzleLight);
  const boomLight = new THREE.PointLight(0xff8a3a, 0, 30, 1.6);
  scene.add(boomLight);

  // muzzle flash billboard
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd9a0, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), flashMat);
  flash.visible = false;
  scene.add(flash);
  let flashLife = 0;

  const grenadeGeoFrag = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMatFrag = new THREE.MeshStandardMaterial({ color: 0x4a5238, roughness: 0.5, metalness: 0.3 });
  const grenadeMatFlash = new THREE.MeshStandardMaterial({ color: 0xb9bdc0, roughness: 0.35, metalness: 0.6 });

  const api = {
    tracer(x0, y0, z0, x1, y1, z1, color) {
      const t = tracers[tNext]; tNext = (tNext + 1) % MAX_TRACERS;
      const a = t.line.geometry.attributes.position.array;
      a[0] = x0; a[1] = y0; a[2] = z0; a[3] = x1; a[4] = y1; a[5] = z1;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.material.color.set(color);
      t.line.visible = true;
      t.life = 0.07;
    },
    impact(x, y, z) { burst(x, y, z, 7, 0xd8c9a3, 2.6, 0.32, 6, 0.6); },
    blood(x, y, z) { burst(x, y, z, 9, 0xa8232a, 1.9, 0.4, 5, 0.2); },
    muzzle(actor) {
      const fx = Math.sin(actor.yaw), fz = Math.cos(actor.yaw);
      const x = actor.pos.x + fx * 0.75, y = actor.pos.y + eyeHeight(actor) - 0.12, z = actor.pos.z + fz * 0.75;
      muzzleLight.position.set(x, y, z);
      muzzleLight.intensity = 14;
      if (!actor.isPlayer) {
        flash.position.set(x, y, z);
        flash.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        flash.visible = true;
        flashLife = 0.045;
      }
    },
    grenadeMesh(type) {
      const m = new THREE.Mesh(grenadeGeoFrag, type === 'frag' ? grenadeMatFrag : grenadeMatFlash);
      scene.add(m);
      return m;
    },
    removeMesh(m) { scene.remove(m); },
    explosion(x, y, z) {
      burst(x, y + 0.3, z, 46, 0xff8a3a, 6.5, 0.7, 3, 2.5);
      burst(x, y + 0.3, z, 22, 0xffd9a0, 3.5, 0.4, 1, 1.5);
      boomLight.position.set(x, y + 1.2, z);
      boomLight.intensity = 160;
    },
    bigExplosion(x, y, z) {
      burst(x, y, z, 130, 0xff7a2a, 11, 1.2, 4, 4);
      burst(x, y, z, 60, 0xffe9b0, 6, 0.7, 2, 3);
      burst(x, y, z, 40, 0x555049, 4, 1.8, -0.4, 3.5); // smoke rises (negative gravity)
      boomLight.position.set(x, y + 2, z);
      boomLight.intensity = 420;
    },
    flashBang(x, y, z) {
      burst(x, y, z, 26, 0xffffff, 4.5, 0.3, 0, 0);
      boomLight.position.set(x, y + 0.5, z);
      boomLight.intensity = 200;
    },
    makeChargeMesh() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.16, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.5, metalness: 0.4 }));
      body.position.y = 0.08;
      g.add(body);
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.05, 0.07),
        new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 3 }));
      lamp.position.set(0.1, 0.19, 0);
      g.add(lamp);
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.03, 0.16),
        new THREE.MeshStandardMaterial({ color: 0x111114, emissive: 0x36f28a, emissiveIntensity: 0.7 }));
      pad.position.set(-0.08, 0.17, 0);
      g.add(pad);
      g.visible = false;
      scene.add(g);
      return g;
    },
    update(dt) {
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (pLife[i] <= 0) continue;
        pLife[i] -= dt;
        if (pLife[i] <= 0) { pPos[i * 3 + 1] = -999; continue; }
        pVel[i * 3 + 1] -= pGrav[i] * dt;
        pPos[i * 3] += pVel[i * 3] * dt;
        pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
        pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
        if (pPos[i * 3 + 1] < 0.03) pPos[i * 3 + 1] = 0.03;
      }
      pGeo.attributes.position.needsUpdate = true;
      for (const t of tracers) {
        if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.line.visible = false; }
      }
      muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 260);
      boomLight.intensity = Math.max(0, boomLight.intensity - dt * 900);
      if (flashLife > 0) {
        flashLife -= dt;
        flashMat.opacity = Math.max(0, flashLife / 0.045) * 0.9;
        if (flashLife <= 0) flash.visible = false;
      }
    },
  };
  return api;
}
