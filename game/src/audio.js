// audio.js — every sound is synthesised with WebAudio: no audio files, no network.
// One AudioContext, one reusable noise buffer; each effect is a short envelope.
let ctx = null;
let noiseBuf = null;
let master = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.4;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}

function noise(dur, filterFreq, gainVal, type = 'lowpass') {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gainVal, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur);
}

function tone(freq, dur, gainVal, type = 'sine', slideTo = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gainVal, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur);
}

export const sfx = {
  shot(weapon) {
    if (!ctx) return;
    if (weapon === 'longbow' || weapon === 'breacher') { noise(0.22, 900, 0.9); tone(120, 0.18, 0.5, 'sine', 45); }
    else if (weapon === 'vk47' || weapon === 'hornet') { noise(0.09, 1800, 0.55); tone(180, 0.07, 0.3, 'square', 70); }
    else { noise(0.08, 2400, 0.4); }
  },
  enemyShot(dist) {
    if (!ctx) return;
    const v = Math.max(0.06, 0.4 - dist * 0.012);
    noise(0.1, 1200, v);
  },
  dryFire() { tone(1200, 0.03, 0.15, 'square'); },
  reload() { tone(500, 0.05, 0.2, 'square'); setTimeout(() => tone(700, 0.05, 0.2, 'square'), 160); },
  hit() { tone(1800, 0.05, 0.25, 'sine'); },
  kill() { tone(880, 0.08, 0.25, 'sine'); setTimeout(() => tone(1320, 0.12, 0.25, 'sine'), 90); },
  hurt() { noise(0.12, 500, 0.4); tone(90, 0.12, 0.3, 'sawtooth', 60); },
  step(run) { noise(0.05, 700, run ? 0.12 : 0.07); },
  plantBeep() { tone(1200, 0.07, 0.25, 'square'); },
  defuseBeep() { tone(900, 0.07, 0.25, 'square'); },
  explosion() {
    noise(1.1, 300, 1.0); tone(60, 0.9, 0.8, 'sine', 28);
    setTimeout(() => noise(0.5, 500, 0.4), 120);
  },
  grenadeThrow() { noise(0.08, 900, 0.15); },
  bounce() { tone(300, 0.05, 0.15, 'sine', 180); },
  roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.25, 'triangle'), i * 130)); },
  roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.22, 'triangle'), i * 140)); },
  buy() { tone(660, 0.06, 0.2, 'sine'); setTimeout(() => tone(990, 0.08, 0.2, 'sine'), 70); },
  denied() { tone(160, 0.12, 0.25, 'square'); },
  flash() { tone(2400, 0.4, 0.12, 'sine', 1200); },
};
