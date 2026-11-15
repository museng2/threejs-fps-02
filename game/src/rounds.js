// rounds.js — the match: round phases (buy, live, end), the score, the money,
// and the breach charge (carried, dropped, planted, defused, detonated).
// Everything about *when* a round is won lives here; bots.js decides how the
// bots play it and weapons.js how shots land.

import { MATCH, PAY, WEAPONS, GRENADES, ARMOR_PRICE } from './config.js';
import { SPAWNS, SITES } from './mapdata.js';
import { makeKit, giveWeapon } from './weapons.js';
import { makeBrain, assignPlans, botBuy, nearestNode, findPath } from './bots.js';

export function initMatch(G) {
  G.match = {
    round: 0, score: { warden: 0, breaker: 0 },
    phase: 'buy', phaseT: 0, winner: null, winReason: '',
    streak: { warden: 0, breaker: 0 }, history: [],
    over: false,
  };
  for (const a of G.actors) {
    a.money = MATCH.startMoney;
    a.kit = makeKit();
    a.armor = false;
    a.kills = 0; a.deaths = 0;
    if (!a.isPlayer) a.brain = makeBrain('hold');
  }
  startRound(G);
}

function resetActor(G, a, spawn) {
  a.pos.x = spawn.x; a.pos.y = 0; a.pos.z = spawn.z;
  a.vel.x = 0; a.vel.y = 0; a.vel.z = 0;
  a.yaw = spawn.yaw; a.pitch = 0;
  a.crouch = false; a.alive = true; a.health = 100;
  a.deathT = 0; a.flashT = 0; a.blindT = 0; a.recoil = 0;
  a.speed2d = 0;
  if (a.mesh) a.mesh.visible = true;
}

export function startRound(G) {
  const M = G.match;
  M.round++;
  M.winner = null; M.winReason = '';
  // the dead start over with a pistol; survivors keep their kit and armour
  for (const a of G.actors) {
    if (!a.alive || M.round === 1) { a.kit = makeKit(); a.armor = false; }
    const spawn = SPAWNS[a.team][a.index];
    resetActor(G, a, spawn);
  }
  // the charge: a random breaker carries it; the team picks a site
  const breakers = G.actors.filter((a) => a.team === 'breaker');
  const carrier = breakers[Math.floor(G.rng() * breakers.length)];
  carrier.kit.hasCharge = true;
  const targetSite = G.rng() < 0.55 ? 'A' : 'B';
  G.bomb = {
    targetSite, planted: false, site: null, x: 0, z: 0, timer: 0,
    dropped: false, carrier, progress: 0, progressKind: null, progressActor: null,
    beepT: 0, mesh: null,
  };
  if (G.effects.makeChargeMesh) G.bomb.mesh = G.effects.makeChargeMesh();
  assignPlans(G, targetSite);
  for (const a of G.actors) if (a.brain) botBuy(a, G.rng);
  M.phase = 'buy';
  M.phaseT = MATCH.buyTime;
  G.events.push({ type: 'roundstart', round: M.round });
}

function payRound(G, winner, reason) {
  const M = G.match;
  const loser = winner === 'warden' ? 'breaker' : 'warden';
  const winPay = reason === 'elimination' ? PAY.winElimination
    : reason === 'defuse' ? PAY.winDefuse : PAY.winObjective;
  for (const a of G.actors) {
    if (a.team === winner) a.money = Math.min(PAY.moneyCap, a.money + winPay);
  }
  M.streak[loser]++;
  M.streak[winner] = 0;
  const lossPay = Math.min(PAY.lossStreakCap, PAY.loss + (M.streak[loser] - 1) * PAY.lossStreakStep);
  for (const a of G.actors) {
    if (a.team === loser) a.money = Math.min(PAY.moneyCap, a.money + lossPay);
  }
}

export function endRound(G, winner, reason) {
  const M = G.match;
  if (M.phase === 'end' || M.phase === 'matchover') return;
  M.score[winner]++;
  M.winner = winner; M.winReason = reason;
  M.history.push({ round: M.round, winner, reason });
  payRound(G, winner, reason);
  G.events.push({ type: 'roundend', winner, reason });
  if (M.score[winner] >= MATCH.roundsToWin || M.round >= MATCH.maxRounds) {
    M.phase = 'matchover'; M.over = true; M.phaseT = 9999;
    G.events.push({ type: 'matchend', winner: M.score.warden === M.score.breaker ? null : (M.score.warden > M.score.breaker ? 'warden' : 'breaker') });
  } else {
    M.phase = 'end'; M.phaseT = MATCH.endTime;
  }
}

// The buy menu's one entry point. Returns a refusal reason or null.
export function buyItem(G, actor, item) {
  if (G.match.phase !== 'buy') return 'Buy phase over';
  const kit = actor.kit;
  if (item === 'armor') {
    if (actor.armor) return 'Already owned';
    if (actor.money < ARMOR_PRICE) return 'Not enough money';
    actor.money -= ARMOR_PRICE; actor.armor = true;
    return null;
  }
  if (item === 'frag' || item === 'flash') {
    const price = GRENADES[item].price;
    if (kit.grenades[item] > 0) return 'Already owned';
    if (actor.money < price) return 'Not enough money';
    actor.money -= price; kit.grenades[item] = 1;
    return null;
  }
  const def = WEAPONS[item];
  if (!def) return 'Unknown item';
  if (kit[def.slot] && kit[def.slot].id === item) return 'Already owned';
  if (actor.money < def.price) return 'Not enough money';
  actor.money -= def.price;
  giveWeapon(kit, item);
  return null;
}

function aliveCount(G, team) {
  let n = 0;
  for (const a of G.actors) if (a.team === team && a.alive) n++;
  return n;
}

// Progress helper for plant/defuse: one actor channels at a time; letting go
// (or dying, or an enemy walking up) bleeds the progress back to zero.
function channel(G, actor, kind, seconds, dt) {
  const b = G.bomb;
  if (!actor || !actor.alive || b.progressActor !== actor || b.progressKind !== kind) {
    b.progressActor = actor; b.progressKind = kind; b.progress = 0;
  }
  if (!actor) return false;
  b.progress += dt / seconds;
  if (b.progress >= 1) { b.progress = 0; b.progressActor = null; b.progressKind = null; return true; }
  return false;
}

export function updateRounds(G, dt) {
  const M = G.match, b = G.bomb;
  if (M.phase === 'buy') {
    M.phaseT -= dt;
    if (M.phaseT <= 0) { M.phase = 'live'; M.phaseT = MATCH.roundTime; G.events.push({ type: 'live' }); }
    return;
  }
  if (M.phase === 'end') {
    M.phaseT -= dt;
    if (M.phaseT <= 0) startRound(G);
    return;
  }
  if (M.phase !== 'live') return;

  // a dead carrier drops the charge; the nearest breaker goes to fetch it
  if (!b.planted && !b.dropped && b.carrier && !b.carrier.alive) {
    b.dropped = true;
    b.x = b.carrier.pos.x; b.z = b.carrier.pos.z;
    if (b.mesh) { b.mesh.visible = true; b.mesh.position.set(b.x, 0.12, b.z); }
    let best = null, bd = Infinity;
    for (const a of G.actors) {
      if (a.team !== 'breaker' || !a.alive || !a.brain) continue;
      const d = Math.hypot(a.pos.x - b.x, a.pos.z - b.z);
      if (d < bd) { bd = d; best = a; }
    }
    if (best) {
      best.brain.role = 'fetch';
      best.brain.state = 'advance';
      best.brain.path = findPath(nearestNode(best.pos.x, best.pos.z).id, nearestNode(b.x, b.z).id);
      best.brain.pathI = 1;
    }
    G.events.push({ type: 'chargedropped' });
  }
  if (b.dropped) {
    for (const a of G.actors) {
      if (a.team === 'breaker' && a.alive && Math.hypot(a.pos.x - b.x, a.pos.z - b.z) < 1.3) {
        b.dropped = false;
        b.carrier = a;
        a.kit.hasCharge = true;
        if (b.mesh) b.mesh.visible = false;
        if (a.brain) { a.brain.role = 'carrier'; a.brain.state = 'arrived'; }
        G.events.push({ type: 'chargepickup', actor: a });
        break;
      }
    }
  }

  // planting: the carrier channels inside the target site
  if (!b.planted) {
    const c = b.carrier;
    let planter = null;
    if (c && c.alive && !b.dropped) {
      const s = SITES[b.targetSite];
      const inSite = Math.hypot(c.pos.x - s.x, c.pos.z - s.z) < s.r;
      const wants = c.isPlayer ? G.playerAction : (c.brain && c.brain.action === 'plant');
      if (inSite && wants) planter = c;
    }
    if (planter) {
      if (channel(G, planter, 'plant', MATCH.plantTime, dt)) {
        b.planted = true; b.site = b.targetSite;
        b.x = planter.pos.x; b.z = planter.pos.z;
        b.timer = MATCH.bombTime;
        planter.kit.hasCharge = false;
        planter.money += PAY.plant;
        if (b.mesh) { b.mesh.visible = true; b.mesh.position.set(b.x, 0.12, b.z); }
        G.events.push({ type: 'planted', site: b.site });
        G.audio.planted();
      }
    } else if (b.progressKind === 'plant') { b.progress = 0; b.progressActor = null; b.progressKind = null; }
  }

  // defusing: a warden channels at the planted charge
  if (b.planted) {
    let defuser = null;
    for (const a of G.actors) {
      if (a.team !== 'warden' || !a.alive) continue;
      const near = Math.hypot(a.pos.x - b.x, a.pos.z - b.z) < 2.2;
      const wants = a.isPlayer ? G.playerAction : (a.brain && a.brain.action === 'defuse');
      if (near && wants) { defuser = a; break; }
    }
    if (defuser) {
      G.audio.defuseTick();
      if (channel(G, defuser, 'defuse', MATCH.defuseTime, dt)) {
        G.events.push({ type: 'defused' });
        endRound(G, 'warden', 'defuse');
        return;
      }
    } else if (b.progressKind === 'defuse') { b.progress = 0; b.progressActor = null; b.progressKind = null; }

    b.timer -= dt;
    b.beepT -= dt;
    if (b.beepT <= 0) {
      b.beepT = Math.max(0.12, b.timer / MATCH.bombTime * 0.9);
      G.audio.beep(b.timer < 8);
    }
    if (b.mesh) b.mesh.visible = Math.sin(G.time * (b.timer < 8 ? 14 : 5)) > -0.4;
    if (b.timer <= 0) {
      G.effects.bigExplosion(b.x, 1, b.z);
      G.audio.explosion(b.x, b.z);
      endRound(G, 'breaker', 'detonation');
      return;
    }
  } else {
    M.phaseT -= dt;
    if (M.phaseT <= 0) { endRound(G, 'warden', 'time'); return; }
  }

  // eliminations
  const wb = aliveCount(G, 'breaker');
  const ww = aliveCount(G, 'warden');
  if (wb === 0 && !b.planted) { endRound(G, 'warden', 'elimination'); return; }
  if (ww === 0) { endRound(G, 'breaker', 'elimination'); return; }
  if (wb === 0 && b.planted) {
    // breakers are dead but the charge is live: wardens still must defuse or
    // beat the clock — handled by the bomb timer above; if it is defused the
    // round ends there, if it blows the breakers take it.
  }
}
