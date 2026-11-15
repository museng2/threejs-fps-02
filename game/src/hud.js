// hud.js — everything drawn over the 3D view: health, armour, ammo, money,
// the round clock and score, a radar, the killfeed, banners, the buy menu,
// the scoreboard, the plant/defuse channel bar, and the flash/damage
// overlays. It reads game state once a frame and touches the DOM only when a
// value actually changed.

import { WEAPONS, GRENADES, ARMOR_PRICE, WEAPON_ORDER, TEAMS, MATCH } from './config.js';
import { BOXES, SITES, BOUNDS } from './mapdata.js';
import { currentWeapon } from './weapons.js';

const $ = (id) => document.getElementById(id);
const REASONS = {
  elimination: 'Elimination', detonation: 'Charge detonated',
  defuse: 'Charge defused', time: 'Time expired',
};
const BUY_ITEMS = [
  { key: '1', item: 'armor', label: 'Kevlar Vest', price: ARMOR_PRICE },
  { key: '2', item: 'rifle', label: WEAPONS.rifle.name, price: WEAPONS.rifle.price },
  { key: '3', item: 'smg', label: WEAPONS.smg.name, price: WEAPONS.smg.price },
  { key: '4', item: 'shotgun', label: WEAPONS.shotgun.name, price: WEAPONS.shotgun.price },
  { key: '5', item: 'dmr', label: WEAPONS.dmr.name, price: WEAPONS.dmr.price },
  { key: '6', item: 'frag', label: GRENADES.frag.name, price: GRENADES.frag.price },
  { key: '7', item: 'flash', label: GRENADES.flash.name, price: GRENADES.flash.price },
];

export function createHud(G) {
  const el = {
    health: $('health'), armorTag: $('armor-tag'), ammoMag: $('ammo-mag'),
    ammoRes: $('ammo-res'), ammoBox: $('ammo'), money: $('money'),
    weaponName: $('weapon-name'), timer: $('timer'), roundLabel: $('round-label'),
    scoreW: $('score-w'), scoreB: $('score-b'), aliveW: $('alive-w'), aliveB: $('alive-b'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'), killfeed: $('killfeed'),
    banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    progress: $('progress'), progressLabel: $('progress-label'), progressFill: $('progress-fill'),
    prompt: $('prompt'), flash: $('flash'), vignette: $('vignette'),
    dmgDir: $('dmg-dir'), buyMenu: $('buymenu'), buyRows: $('buy-rows'), buyMoney: $('buy-money'),
    scoreboard: $('scoreboard'), sbBody: $('sb-body'), sbHead: $('sb-head'),
    bombStatus: $('bomb-status'), radar: $('radar'), spectate: $('spectate'),
  };
  const radarCtx = el.radar.getContext('2d');
  const cache = new Map();
  const setText = (node, key, text) => {
    if (cache.get(key) !== text) { cache.set(key, text); node.textContent = text; }
  };
  let bannerT = 0, hitmarkT = 0, dmgDirT = 0, hurtT = 0;
  let buyOpen = false, sbOpen = false;

  // build the buy rows once
  for (const row of BUY_ITEMS) {
    const div = document.createElement('button');
    div.className = 'buy-row';
    div.dataset.item = row.item;
    div.innerHTML = `<span class="buy-key">${row.key}</span><span class="buy-label">${row.label}</span>` +
      `<span class="buy-state"></span><span class="buy-price">$${row.price}</span>`;
    div.addEventListener('click', () => G.onBuy(row.item));
    el.buyRows.appendChild(div);
  }

  function banner(title, sub, seconds) {
    el.bannerTitle.textContent = title;
    el.bannerSub.textContent = sub || '';
    el.banner.hidden = false;
    bannerT = seconds;
  }

  function killfeed(html) {
    const div = document.createElement('div');
    div.className = 'kf-row';
    div.innerHTML = html;
    el.killfeed.appendChild(div);
    setTimeout(() => div.classList.add('old'), 3600);
    setTimeout(() => div.remove(), 4300);
    while (el.killfeed.children.length > 6) el.killfeed.firstChild.remove();
  }

  const teamSpan = (a) => `<span style="color:${TEAMS[a.team].css}">${a.name}</span>`;

  function handleEvent(ev) {
    const player = G.player;
    if (ev.type === 'kill') {
      const weapon = ev.attacker && ev.attacker.kit ? '' : '';
      killfeed(`${ev.attacker ? teamSpan(ev.attacker) : ''} <span class="kf-x">${ev.part === 'head' ? '⌖ headshot' : '▸'}</span> ${teamSpan(ev.target)}${weapon}`);
      if (ev.target === player) banner('YOU DIED', ev.attacker ? `Killed by ${ev.attacker.name}` : '', 2.6);
    } else if (ev.type === 'hitmark' && ev.target === undefined) {
      hitmarkT = 0.22;
      el.hitmarker.classList.toggle('head', ev.part === 'head');
      if (ev.part === 'head') G.audio.headshot(); else G.audio.hit();
    } else if (ev.type === 'damage' && ev.target === player && ev.attacker) {
      hurtT = 0.5;
      const a = ev.attacker;
      const ang = Math.atan2(a.pos.x - player.pos.x, a.pos.z - player.pos.z) - player.yaw;
      el.dmgDir.style.transform = `translate(-50%,-50%) rotate(${ang}rad)`;
      dmgDirT = 0.9;
      G.audio.hurt();
    } else if (ev.type === 'roundstart') {
      banner(`ROUND ${ev.round}`, 'Buy phase — press B to open the buy menu', 2.4);
      buyOpen = true;
    } else if (ev.type === 'live') {
      banner('ROUND LIVE', '', 1.1);
      buyOpen = false;
    } else if (ev.type === 'planted') {
      banner('CHARGE PLANTED', `Site ${ev.site} — defuse it before it blows`, 2.6);
    } else if (ev.type === 'roundend') {
      const mine = ev.winner === player.team;
      banner(`${TEAMS[ev.winner].name.toUpperCase()} WIN`, REASONS[ev.reason] || ev.reason, 3.4);
      G.audio.roundWin(mine);
      buyOpen = false;
    } else if (ev.type === 'matchend') {
      banner(ev.winner ? `${TEAMS[ev.winner].name.toUpperCase()} WIN THE MATCH` : 'MATCH DRAWN',
        `Final score ${G.match.score.warden} — ${G.match.score.breaker} · press R for a rematch`, 9999);
    } else if (ev.type === 'chargedropped') {
      if (player.team === 'breaker') banner('CHARGE DROPPED', 'A breaker must pick it up', 2);
    }
  }

  function drawRadar() {
    const ctx = radarCtx, W = el.radar.width, H = el.radar.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(16,20,24,0.72)';
    ctx.fillRect(0, 0, W, H);
    const sx = (x) => (x - BOUNDS.x0) / (BOUNDS.x1 - BOUNDS.x0) * W;
    const sz = (z) => (z - BOUNDS.z0) / (BOUNDS.z1 - BOUNDS.z0) * H;
    ctx.fillStyle = 'rgba(233,230,223,0.13)';
    for (const b of BOXES) {
      if (b.h < 1.5) continue;
      ctx.fillRect(sx(b.x - b.w / 2), sz(b.z - b.d / 2), Math.max(2, b.w / (BOUNDS.x1 - BOUNDS.x0) * W), Math.max(2, b.d / (BOUNDS.z1 - BOUNDS.z0) * H));
    }
    ctx.fillStyle = '#f0a830';
    ctx.font = '700 11px system-ui';
    ctx.fillText('A', sx(SITES.A.x) - 3, sz(SITES.A.z) + 4);
    ctx.fillText('B', sx(SITES.B.x) - 3, sz(SITES.B.z) + 4);
    if (G.bomb.planted || G.bomb.dropped) {
      ctx.fillStyle = '#ff4a3a';
      ctx.beginPath(); ctx.arc(sx(G.bomb.x), sz(G.bomb.z), 3.4, 0, 7); ctx.fill();
    }
    for (const a of G.actors) {
      if (!a.alive || a.isPlayer) continue;
      if (a.team !== G.player.team) continue; // radar shows your own team
      ctx.fillStyle = TEAMS[a.team].css;
      ctx.beginPath(); ctx.arc(sx(a.pos.x), sz(a.pos.z), 3, 0, 7); ctx.fill();
    }
    const p = G.player;
    ctx.save();
    ctx.translate(sx(p.pos.x), sz(p.pos.z));
    ctx.rotate(Math.PI - p.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -5.5); ctx.lineTo(3.6, 4); ctx.lineTo(-3.6, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function refreshBuy() {
    const p = G.player;
    setText(el.buyMoney, 'buymoney', `$${p.money}`);
    for (const row of el.buyRows.children) {
      const item = row.dataset.item;
      const spec = BUY_ITEMS.find((r) => r.item === item);
      let state = '';
      if (item === 'armor' && p.armor) state = 'owned';
      else if ((item === 'frag' || item === 'flash') && p.kit.grenades[item] > 0) state = 'owned';
      else if (WEAPONS[item] && p.kit[WEAPONS[item].slot] && p.kit[WEAPONS[item].slot].id === item) state = 'owned';
      else if (p.money < spec.price) state = 'cannot afford';
      row.querySelector('.buy-state').textContent = state;
      row.classList.toggle('disabled', state !== '');
    }
  }

  function refreshScoreboard() {
    const M = G.match;
    el.sbHead.textContent = `EMBER YARD — Round ${M.round} · Wardens ${M.score.warden} : ${M.score.breaker} Breakers`;
    const rows = [...G.actors].sort((a, b2) => (a.team === b2.team ? b2.kills - a.kills : a.team === 'warden' ? -1 : 1));
    el.sbBody.innerHTML = rows.map((a) =>
      `<tr class="${a.alive ? '' : 'dead'}"><td style="color:${TEAMS[a.team].css}">${a.name}${a.isPlayer ? ' (you)' : ''}</td>` +
      `<td>${a.kit && a.kit.primary ? WEAPONS[a.kit.primary.id].name : 'P9 Sidearm'}</td>` +
      `<td>${a.kills}</td><td>${a.deaths}</td><td>$${a.money}</td><td>${a.alive ? 'alive' : 'dead'}</td></tr>`).join('');
  }

  return {
    event: handleEvent,
    get buyOpen() { return buyOpen; },
    set buyOpen(v) { buyOpen = v; },
    get sbOpen() { return sbOpen; },
    set sbOpen(v) { sbOpen = v; if (v) refreshScoreboard(); },
    banner,
    update(dt) {
      const p = G.player, M = G.match, b = G.bomb;
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) el.banner.hidden = true; }
      if (hitmarkT > 0) { hitmarkT -= dt; el.hitmarker.style.opacity = hitmarkT > 0 ? '1' : '0'; }
      if (dmgDirT > 0) { dmgDirT -= dt; el.dmgDir.style.opacity = Math.min(1, dmgDirT).toFixed(2); }
      if (hurtT > 0) hurtT -= dt;

      setText(el.health, 'hp', String(Math.max(0, Math.ceil(p.health))));
      el.armorTag.style.visibility = p.armor ? 'visible' : 'hidden';
      const w = currentWeapon(p);
      if (p.kit && (p.kit.current === 'frag' || p.kit.current === 'flash')) {
        setText(el.weaponName, 'wn', p.kit.current === 'frag' ? 'Frag Grenade' : 'Flash Charge');
        setText(el.ammoMag, 'am', '1');
        setText(el.ammoRes, 'ar', '');
      } else if (w) {
        setText(el.weaponName, 'wn', WEAPONS[w.id].name + (w.reloading > 0 ? ' — reloading' : ''));
        setText(el.ammoMag, 'am', String(w.mag));
        setText(el.ammoRes, 'ar', `/ ${w.reserve}`);
      }
      el.ammoBox.classList.toggle('empty', !!w && w.mag === 0);
      setText(el.money, 'money', `$${p.money}`);
      const t = b.planted ? b.timer : Math.max(0, M.phaseT);
      const label = M.phase === 'buy' ? `BUY ${Math.ceil(M.phaseT)}` :
        b.planted ? `CHARGE ${Math.ceil(b.timer)}` : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
      setText(el.timer, 'timer', label);
      setText(el.roundLabel, 'round', `ROUND ${M.round} · FIRST TO ${MATCH.roundsToWin}`);
      setText(el.scoreW, 'sw', String(M.score.warden));
      setText(el.scoreB, 'sb', String(M.score.breaker));
      let aw = 0, ab = 0;
      for (const a of G.actors) if (a.alive) { if (a.team === 'warden') aw++; else ab++; }
      setText(el.aliveW, 'aw', `${aw} alive`);
      setText(el.aliveB, 'ab', `${ab} alive`);
      setText(el.bombStatus, 'bs', b.planted ? `⚠ CHARGE PLANTED — SITE ${b.site}` :
        b.dropped ? 'CHARGE DROPPED' : '');
      // crosshair bloom follows the weapon's real spread state
      const spreadPx = 6 + (p.recoil || 0) * 160 + (p.speed2d > 0.6 ? 7 : 0);
      el.crosshair.style.setProperty('--sp', `${spreadPx.toFixed(0)}px`);
      el.crosshair.style.opacity = p.alive ? '1' : '0';
      // flash + damage overlays
      el.flash.style.opacity = Math.min(1, (p.blindT || 0) / 1.6).toFixed(2);
      const lowHp = p.health < 35 && p.alive ? 0.25 + 0.15 * Math.sin(performance.now() * 0.006) : 0;
      el.vignette.style.opacity = Math.max(hurtT * 0.8, lowHp).toFixed(2);
      // channel bar (the player defusing)
      if (b.progressActor === p && b.progress > 0) {
        el.progress.hidden = false;
        setText(el.progressLabel, 'pl', b.progressKind === 'defuse' ? 'DEFUSING…' : 'PLANTING…');
        el.progressFill.style.width = `${Math.floor(b.progress * 100)}%`;
      } else el.progress.hidden = true;
      // context prompt
      let prompt = '';
      if (p.alive && M.phase === 'live') {
        if (b.planted && p.team === 'warden' && Math.hypot(p.pos.x - b.x, p.pos.z - b.z) < 2.4) {
          prompt = 'Hold E to defuse the charge';
        }
      }
      if (p.alive && M.phase === 'buy') prompt = 'B — buy menu · the round starts soon';
      if (!p.alive && M.phase === 'live') prompt = '';
      setText(el.prompt, 'prompt', prompt);
      el.spectate.style.visibility = !p.alive && M.phase === 'live' ? 'visible' : 'hidden';
      el.buyMenu.hidden = !(buyOpen && M.phase === 'buy' && p.alive);
      if (!el.buyMenu.hidden) refreshBuy();
      el.scoreboard.hidden = !sbOpen;
      if (sbOpen) refreshScoreboard();
      drawRadar();
    },
  };
}
