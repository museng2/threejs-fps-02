// config.js — every tunable of Ember Yard in one place: teams, weapons, economy,
// round timings and the look palette. No logic lives here.

// Teams. The player always plays Warden (defence); Breakers attack with the charge.
export const TEAMS = {
  warden: { id: 'warden', name: 'Wardens', short: 'WRD', color: 0x2e7f8f, css: '#57c7d9' },
  breaker: { id: 'breaker', name: 'Breakers', short: 'BRK', color: 0xc25e2e, css: '#f0913c' },
};
export const TEAM_SIZE = 5;

// Match and round timings (seconds).
export const MATCH = {
  roundsToWin: 7,
  maxRounds: 12,
  startMoney: 800,
  buyTime: 12,
  roundTime: 100,
  bombTime: 35,
  plantTime: 3.2,
  defuseTime: 5,
  endTime: 4.5, // pause on the round banner before the next buy phase
};

// Economy: what a round pays, on top of kill and plant bonuses.
export const PAY = {
  winElimination: 3250,
  winObjective: 3500, // charge detonated, or charge stopped by the clock
  winDefuse: 3500,
  loss: 1400,
  lossStreakStep: 500, // extra per consecutive loss beyond the first, capped
  lossStreakCap: 3400,
  kill: 300,
  plant: 300, // to the planter
  moneyCap: 16000,
};

// Weapons. damage is per bullet at point blank; falloffStart/falloffEnd scale it
// down to minFalloff at range. headMult applies to head hits. spread is in
// radians at rest; moveSpread multiplies it while moving, crouchSpread while
// crouched. rpm: rounds per minute. price 0 = issued free.
export const WEAPONS = {
  pistol: {
    name: 'P9 Sidearm', slot: 'sidearm', price: 0, damage: 34, headMult: 3.2,
    rpm: 320, auto: false, mag: 12, reserve: 48, reloadTime: 1.4,
    spread: 0.011, moveSpread: 2.6, crouchSpread: 0.6, pellets: 1,
    falloffStart: 14, falloffEnd: 42, minFalloff: 0.55, range: 120,
    zoom: 0, kick: 0.011, tracer: 0xf5d9a0,
  },
  smg: {
    name: 'Kestrel SMG', slot: 'primary', price: 1400, damage: 24, headMult: 3.0,
    rpm: 780, auto: true, mag: 30, reserve: 90, reloadTime: 2.0,
    spread: 0.02, moveSpread: 2.2, crouchSpread: 0.65, pellets: 1,
    falloffStart: 10, falloffEnd: 34, minFalloff: 0.45, range: 110,
    zoom: 0, kick: 0.008, tracer: 0xf5d9a0,
  },
  shotgun: {
    name: 'Breacher 12', slot: 'primary', price: 1100, damage: 13, headMult: 2.2,
    rpm: 68, auto: false, mag: 6, reserve: 24, reloadTime: 2.8,
    spread: 0.055, moveSpread: 1.8, crouchSpread: 0.8, pellets: 8,
    falloffStart: 5, falloffEnd: 20, minFalloff: 0.25, range: 60,
    zoom: 0, kick: 0.03, tracer: 0xf5c98a,
  },
  rifle: {
    name: 'VK-7 Rifle', slot: 'primary', price: 2700, damage: 36, headMult: 4.0,
    rpm: 600, auto: true, mag: 30, reserve: 90, reloadTime: 2.3,
    spread: 0.013, moveSpread: 2.8, crouchSpread: 0.55, pellets: 1,
    falloffStart: 22, falloffEnd: 70, minFalloff: 0.7, range: 160,
    zoom: 0, kick: 0.014, tracer: 0xffe9b0,
  },
  dmr: {
    name: 'Longshot DMR', slot: 'primary', price: 3200, damage: 82, headMult: 2.6,
    rpm: 150, auto: false, mag: 8, reserve: 32, reloadTime: 2.6,
    spread: 0.0035, moveSpread: 4.5, crouchSpread: 0.5, pellets: 1,
    falloffStart: 40, falloffEnd: 120, minFalloff: 0.85, range: 220,
    zoom: 2.4, kick: 0.026, tracer: 0xfff3c4,
  },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rifle', 'dmr'];

// Grenades. Only one of each per round, bought from the buy menu.
export const GRENADES = {
  frag: { name: 'Frag Grenade', price: 300, damage: 92, radius: 6.5, fuse: 1.5 },
  flash: { name: 'Flash Charge', price: 200, radius: 16, fuse: 1.3, blindMax: 2.8 },
};
export const ARMOR_PRICE = 650; // vest: halves body damage taken, head stays lethal
export const ARMOR_ABSORB = 0.5;

// Player movement (metres, seconds).
export const MOVE = {
  walkSpeed: 4.6,
  sprintSpeed: 6.4,
  crouchSpeed: 2.2,
  accel: 42,
  airAccel: 6,
  friction: 11,
  gravity: 19,
  jumpSpeed: 6.2,
  stepHeight: 0.55,
  radius: 0.42,
  eyeStand: 1.62,
  eyeCrouch: 1.12,
};

// Bot tuning. Reaction and error are what keep the fight fair: bots are quick
// enough to punish a rush and sloppy enough to lose to a held angle.
export const BOT = {
  speed: 4.1,
  sprintSpeed: 5.6,
  reaction: 0.34, // seconds between seeing a target and the first aimed shot
  burstPause: 0.34,
  aimError: 0.021, // radians of aim noise at rest, scaled by target movement
  seeRange: 62,
  seeFovCos: 0.25, // ~75 degrees each side: bots must still turn to check corners
  hearRange: 26, // gunfire heard inside this radius
  plantRange: 2.2,
};

// The look: dusk over a rail yard. Sodium lamps, teal steel, safety orange.
export const PALETTE = {
  sky: 0x46566b,
  fog: 0x4b5a6a,
  sun: 0xffc38a,
  hemiSky: 0xaec6da,
  hemiGround: 0x54493a,
  ground: 0x63666a,
  concrete: 0x8b8d89,
  concreteDark: 0x5d605c,
  steel: 0x46606b,
  steelDark: 0x2f444c,
  containerA: 0x9c4a24,
  containerB: 0x2e6b74,
  containerC: 0x707a52,
  crate: 0x9a7b4f,
  accent: 0xf0a830,
  lampGlow: 0xffc37a,
};
