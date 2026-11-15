// world.js — turns mapdata into the three.js scene: ground with painted lane
// markings, every box and tank, lamp posts, site decals and the dusk light.
// All textures are painted on canvases at boot — the game ships no image
// assets and asks the network for nothing.

import * as THREE from 'three';
import { BOXES, TANKS, LAMPS, SITES, BOUNDS } from './mapdata.js';
import { PALETTE } from './config.js';
import { makeColliders } from './physics.js';

function canvasTexture(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
  return tex;
}

function speckle(ctx, w, h, n, alpha) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() * 255 | 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

function concreteTex(base, panel) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 2600, 0.05);
    ctx.strokeStyle = panel; ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    ctx.fillRect(0, h - 26, w, 26); // grime at the foot of the wall
  }, [2, 1]);
}

function containerTex(color, label) {
  return canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) { // corrugation
      ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x, 0, 7, h);
      ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(x + 16, 0, 9, h);
    }
    speckle(ctx, w, h, 1500, 0.05);
    ctx.fillStyle = 'rgba(0,0,0,0.20)'; ctx.fillRect(0, h - 30, w, 30);
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(label, 26, 66);
    ctx.font = '700 25px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('EMBER YARD FREIGHT', 26, h - 44);
  });
}

function crateTex() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#9a7b4f'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < h; y += 52) ctx.fillRect(0, y, w, 4);
    ctx.strokeStyle = 'rgba(60,40,18,0.55)'; ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(w - 8, h - 8);
    ctx.moveTo(w - 8, 8); ctx.lineTo(8, h - 8); ctx.stroke();
    speckle(ctx, w, h, 900, 0.05);
  });
}

function groundTexture() {
  const W = 1024, H = 768;
  const px = (x) => (x - BOUNDS.x0) / (BOUNDS.x1 - BOUNDS.x0) * W;
  const pz = (z) => (z - BOUNDS.z0) / (BOUNDS.z1 - BOUNDS.z0) * H;
  return canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = '#63666a'; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 15000, 0.045);
    // worn darker patches
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    for (let i = 0; i < 26; i++) {
      ctx.beginPath();
      ctx.ellipse(Math.random() * W, Math.random() * H, 30 + Math.random() * 90, 16 + Math.random() * 44, Math.random() * 3, 0, 7);
      ctx.fill();
    }
    // expansion joints
    ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 2;
    for (let x = 0; x <= W; x += 128) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 128) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // lane paint: a yellow spine down the south lane and the north yard
    ctx.strokeStyle = 'rgba(240,168,48,0.5)'; ctx.lineWidth = 5; ctx.setLineDash([26, 20]);
    ctx.beginPath(); ctx.moveTo(px(-46), pz(25)); ctx.lineTo(px(15), pz(21)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px(-46), pz(-26)); ctx.lineTo(px(17), pz(-24)); ctx.stroke();
    ctx.setLineDash([]);
    // white box around mid
    ctx.strokeStyle = 'rgba(233,230,223,0.28)'; ctx.lineWidth = 4;
    ctx.strokeRect(px(-17), pz(-12), px(17) - px(-17), pz(12) - pz(-12));
  });
}

function siteDecal(site, colorCss) {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = colorCss; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 104, 0, Math.PI * 2); ctx.stroke();
    ctx.font = '700 130px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = colorCss;
    ctx.fillText(site.id, w / 2, h / 2 + 6);
  });
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(site.r, 40),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(site.x, 0.02, site.z);
  mesh.renderOrder = 1;
  return mesh;
}

function signTexture(lines, bg, fg) {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg; ctx.lineWidth = 5; ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = fg; ctx.textAlign = 'center';
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.fillText(lines[0], w / 2, 56);
    ctx.font = '500 27px system-ui, sans-serif';
    ctx.fillText(lines[1], w / 2, 96);
  });
}

export function buildWorld(scene) {
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 60, 200);

  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.75);
  sun.position.set(-38, 42, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -58; sun.shadow.camera.right = 58;
  sun.shadow.camera.top = 46; sun.shadow.camera.bottom = -46;
  sun.shadow.camera.far = 140;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  const mats = {
    concrete: new THREE.MeshStandardMaterial({ map: concreteTex('#8b8d89', 'rgba(40,42,40,0.5)'), roughness: 0.95 }),
    concreteDark: new THREE.MeshStandardMaterial({ map: concreteTex('#5d605c', 'rgba(24,26,24,0.55)'), roughness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ map: concreteTex('#46606b', 'rgba(18,30,36,0.5)'), roughness: 0.7, metalness: 0.35 }),
    steelDark: new THREE.MeshStandardMaterial({ map: concreteTex('#2f444c', 'rgba(10,18,22,0.55)'), roughness: 0.7, metalness: 0.35 }),
    containerA: new THREE.MeshStandardMaterial({ map: containerTex('#9c4a24', 'EY-104'), roughness: 0.62, metalness: 0.3 }),
    containerB: new THREE.MeshStandardMaterial({ map: containerTex('#2e6b74', 'EY-217'), roughness: 0.62, metalness: 0.3 }),
    containerC: new THREE.MeshStandardMaterial({ map: containerTex('#707a52', 'EY-330'), roughness: 0.62, metalness: 0.3 }),
    crate: new THREE.MeshStandardMaterial({ map: crateTex(), roughness: 0.9 }),
    sandbag: new THREE.MeshStandardMaterial({ color: 0x77744f, roughness: 1 }),
    tank: new THREE.MeshStandardMaterial({ color: 0xb9bdc0, roughness: 0.38, metalness: 0.65 }),
    furnace: new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.6, metalness: 0.5 }),
  };

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(BOUNDS.x1 - BOUNDS.x0, BOUNDS.z1 - BOUNDS.z0),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const b of BOXES) {
    const m = new THREE.Mesh(boxGeo, mats[b.mat]);
    m.scale.set(b.w, b.h, b.d);
    m.position.set(b.x, b.h / 2, b.z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }
  const tankGeo = new THREE.CylinderGeometry(1, 1, 1, 22);
  for (const t of TANKS) {
    const m = new THREE.Mesh(tankGeo, mats.tank);
    m.scale.set(t.r, t.h, t.r);
    m.position.set(t.x, t.h / 2, t.z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    const cap = new THREE.Mesh(new THREE.TorusGeometry(t.r * 0.99, 0.09, 8, 26), mats.steelDark);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(t.x, t.h - 0.4, t.z);
    scene.add(cap);
  }

  // the furnace mouth: a glowing grate on the hall's north wall
  const grate = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 2.4),
    new THREE.MeshStandardMaterial({ color: 0x1a0d06, emissive: 0xff6a1f, emissiveIntensity: 1.6 }),
  );
  grate.position.set(36, 1.5, -31.35);
  scene.add(grate);
  const furnaceLight = new THREE.PointLight(0xff7a2a, 38, 22, 1.8);
  furnaceLight.position.set(36, 2.2, -29);
  scene.add(furnaceLight);

  // lamp posts: pole, emissive head, real light on a few
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 4.6, 8);
  const headGeo = new THREE.BoxGeometry(0.46, 0.12, 0.26);
  const headMat = new THREE.MeshStandardMaterial({ color: 0x554433, emissive: PALETTE.lampGlow, emissiveIntensity: 1.5 });
  LAMPS.forEach((l, i) => {
    const pole = new THREE.Mesh(poleGeo, mats.steelDark);
    pole.position.set(l.x, 2.3, l.z);
    pole.castShadow = true;
    scene.add(pole);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(l.x, 4.65, l.z);
    scene.add(head);
    if (i % 2 === 0) {
      const p = new THREE.PointLight(PALETTE.lampGlow, 26, 21, 1.9);
      p.position.set(l.x, 4.4, l.z);
      scene.add(p);
    }
  });

  // site decals and hanging signs
  scene.add(siteDecal(SITES.A, 'rgba(240,168,48,0.85)'));
  scene.add(siteDecal(SITES.B, 'rgba(240,168,48,0.85)'));
  // signs are two planes back to back, so the text reads correctly from both
  // approaches and never mirrored
  const signPair = (lines, x, y, z, rotY) => {
    const tex = signTexture(lines, '#22201c', '#f0a830');
    const geo = new THREE.PlaneGeometry(7.5, 1.9);
    for (const flip of [0, Math.PI]) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
      m.position.set(x, y, z);
      m.rotation.y = rotY + flip;
      m.translateZ(flip === 0 ? 0.03 : -0.03);
      scene.add(m);
    }
  };
  signPair(['SITE A', 'FURNACE HALL'], 25.5, 4.4, -12.4, 0);
  signPair(['SITE B', 'FUEL DEPOT'], 16.4, 3.4, 21, -Math.PI / 2);

  // distant skyline silhouettes and a crane, outside the walls
  const silMat = new THREE.MeshBasicMaterial({ color: 0x232a33 });
  const silGeo = new THREE.BoxGeometry(1, 1, 1);
  const silhouettes = [
    [-70, -20, 16, 22, 10], [-64, 14, 12, 15, 12], [66, -26, 18, 26, 12],
    [70, 18, 14, 18, 10], [-20, -58, 22, 17, 12], [26, -56, 16, 24, 10],
    [8, 58, 26, 14, 12], [-38, 56, 15, 19, 10],
  ];
  for (const [x, z, w, h, d] of silhouettes) {
    const m = new THREE.Mesh(silGeo, silMat);
    m.scale.set(w, h, d);
    m.position.set(x, h / 2 - 0.5, z);
    scene.add(m);
  }
  const craneMat = new THREE.MeshBasicMaterial({ color: 0x1d232b });
  const craneMast = new THREE.Mesh(silGeo, craneMat);
  craneMast.scale.set(1.2, 30, 1.2); craneMast.position.set(-58, 15, -44);
  scene.add(craneMast);
  const craneJib = new THREE.Mesh(silGeo, craneMat);
  craneJib.scale.set(34, 1, 1); craneJib.position.set(-44, 29.4, -44);
  scene.add(craneJib);

  return { colliders: makeColliders(), sun };
}
