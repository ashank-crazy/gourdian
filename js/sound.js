// Tiny Web Audio synth, so there are no sound files to ship.

let ac = null;
let muted = false;

export const setMuted = m => { muted = m; };

function ctx() {
  if (!ac) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ac = new C();
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

// Browsers only allow audio after a user gesture; call this from click handlers.
export const unlock = () => { ctx(); };

function note(freq, at, dur, { type = 'sine', gain = 0.14, to = null, vibrato = 0 } = {}) {
  const a = ctx();
  if (!a || muted) return;
  const t0 = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  if (vibrato) {
    const lfo = a.createOscillator();
    const depth = a.createGain();
    lfo.frequency.value = 6;
    depth.gain.value = vibrato;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let out = o.connect(g);
  if (type === 'sawtooth') {
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1300;
    out = out.connect(lp);
  }
  out.connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export const sfx = {
  start: () => { note(392, 0, 0.18, { type: 'triangle' }); note(587.33, 0.1, 0.28, { type: 'triangle' }); },
  chime: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, i * 0.13, 0.9, { gain: 0.12 })),
  poke: () => note(320, 0, 0.16, { type: 'triangle', to: 90, gain: 0.2 }),
  uhoh: () => { note(330, 0, 0.22, { type: 'square', gain: 0.04 }); note(247, 0.2, 0.36, { type: 'square', gain: 0.04 }); },
  pass: () => note(660, 0, 0.22, { to: 990 }),
  trombone: () => {
    [[311, 0], [294, 0.45], [277, 0.9]].forEach(([f, at]) => note(f, at, 0.42, { type: 'sawtooth', gain: 0.08 }));
    note(262, 1.35, 1.3, { type: 'sawtooth', gain: 0.08, vibrato: 6 });
  },
};
