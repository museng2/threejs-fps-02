// rng.js — a tiny seeded random source (mulberry32). Gameplay randomness that
// matters for screenshots runs off one of these so a shot scene is repeatable;
// live play seeds it from the clock once at boot.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// range helpers built on a rng() function
export function randRange(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function randPick(rng, list) { return list[Math.floor(rng() * list.length) % list.length]; }
