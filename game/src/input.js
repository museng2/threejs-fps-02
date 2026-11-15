// input.js — keyboard and mouse state, pointer lock, and a small queue of
// discrete key events for the one-press actions (buy, reload, switch, plant).
// The simulation reads the held-state every fixed step; the queue is drained
// once per frame by main.js.

export function createInput(element) {
  const keys = new Set();
  const events = [];
  let lookDX = 0, lookDY = 0;
  let firing = false, aiming = false, locked = false;

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    events.push({ type: 'key', code: e.code });
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); firing = false; aiming = false; });

  element.addEventListener('mousedown', (e) => {
    if (!locked) return;
    if (e.button === 0) firing = true;
    if (e.button === 2) aiming = true;
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) firing = false;
    if (e.button === 2) aiming = false;
  });
  element.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => {
    if (!locked) return;
    lookDX += e.movementX || 0;
    lookDY += e.movementY || 0;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === element;
    if (!locked) { firing = false; aiming = false; }
    events.push({ type: 'lock', locked });
  });

  return {
    keys, events,
    get firing() { return firing; },
    get aiming() { return aiming; },
    get locked() { return locked; },
    lock() { element.requestPointerLock(); },
    unlock() { document.exitPointerLock(); },
    consumeLook() {
      const d = { dx: lookDX, dy: lookDY };
      lookDX = 0; lookDY = 0;
      return d;
    },
    held(code) { return keys.has(code); },
  };
}
