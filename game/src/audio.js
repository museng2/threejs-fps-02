// audio.js — every sound is synthesized with WebAudio: no audio files, no
// network. Gunshots are filtered noise bursts shaped per weapon; the charge
// beeps, the defuse ticks and the explosions are oscillators and noise.
// Bot shots are attenuated by distance to the listener (the player).

export function createAudio() {
  let ctx = null, master = null, noiseBuf = null;
  let lx = 0, lz = 0;

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  function noise(dur, freq, gain, type = 'lowpass', when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, gain, type = 'square', slide = 0, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function distGain(x, z, base) {
    const d = Math.hypot(x - lx, z - lz);
    return base / (1 + d * 0.055);
  }

  return {
    unlock,
    setListener(x, z) { lx = x; lz = z; },
    shot(def, actor) {
      if (!ctx) return;
      const own = actor.isPlayer;
      const base = own ? 0.5 : distGain(actor.pos.x, actor.pos.z, 0.55);
      if (base < 0.01) return;
      if (def.id === 'shotgun') { noise(0.22, 900, base); tone(120, 0.16, base * 0.7, 'triangle', -60); }
      else if (def.id === 'dmr') { noise(0.2, 2600, base, 'highpass'); noise(0.26, 500, base * 0.8); }
      else if (def.id === 'pistol') { noise(0.1, 1500, base * 0.8); tone(190, 0.06, base * 0.3, 'square', -90); }
      else if (def.id === 'smg') { noise(0.08, 1300, base * 0.65); }
      else { noise(0.13, 1100, base * 0.85); tone(150, 0.09, base * 0.35, 'square', -70); }
    },
    dryFire() { tone(1200, 0.04, 0.12, 'square'); },
    reload(player) { if (player) { tone(500, 0.05, 0.1, 'square'); tone(340, 0.05, 0.12, 'square', 0, 0.14); tone(620, 0.05, 0.1, 'square', 0, 0.3); } },
    draw(player) { if (player) noise(0.07, 2000, 0.08, 'bandpass'); },
    throwIt() { noise(0.12, 700, 0.1, 'bandpass'); },
    hit() { tone(2100, 0.045, 0.16, 'sine'); },
    headshot() { tone(2600, 0.06, 0.2, 'sine'); tone(3100, 0.05, 0.12, 'sine', 0, 0.03); },
    kill() { /* the kill confirm is the victim's own fall; keep quiet */ },
    hurt() { tone(140, 0.12, 0.2, 'sawtooth', -40); },
    explosion(x, z) {
      if (!ctx) return;
      const g = distGain(x, z, 0.9);
      noise(0.7, 220, g);
      tone(70, 0.55, g * 0.8, 'sine', -35);
    },
    flash() { tone(3400, 0.5, 0.14, 'sine', -600); },
    planted() { tone(880, 0.14, 0.2, 'square'); tone(880, 0.14, 0.2, 'square', 0, 0.22); },
    beep(fast) { tone(fast ? 1560 : 1180, 0.06, 0.13, 'square'); },
    defuseTick() { /* too frequent to sound every frame; rounds throttles by progress */ },
    roundWin(win) { tone(win ? 660 : 330, 0.16, 0.16, 'triangle'); tone(win ? 880 : 262, 0.22, 0.16, 'triangle', 0, 0.15); },
    buy() { tone(1320, 0.05, 0.1, 'sine'); },
    denied() { tone(220, 0.09, 0.14, 'square'); },
  };
}
