// The built-in alarm sounds, synthesised live with Web Audio: no audio files.
// Each sound schedules its notes from time t on `out.dest` and is silent after
// `duration` seconds, so the alarm knows when to switch to flashing.

export const DEFAULT_SOUND = "beep";
export const CUSTOM_SOUND = "custom";
export const DEFAULT_VOLUME = 1;

// A stored volume (0 to 1, in steps of 0.05), or full volume when it is missing or malformed.
export function clampVolume(stored) {
  if (stored === null || stored === undefined || stored === "") return DEFAULT_VOLUME;
  const n = Number(stored);
  if (!Number.isFinite(n)) return DEFAULT_VOLUME;
  return Math.round(Math.min(1, Math.max(0, n)) * 20) / 20;
}

// The stored choice, or the default when it is unknown or the uploaded file is gone.
export function resolveSound(stored, hasCustom) {
  if (stored === CUSTOM_SOUND) return hasCustom ? CUSTOM_SOUND : DEFAULT_SOUND;
  return SOUNDS.some((s) => s.id === stored) ? stored : DEFAULT_SOUND;
}

// One note with an attack/decay envelope. Optional: glide to another pitch,
// vibrato, low-pass filter, and a send to the shared echo.
function note(out, { type = "sine", freq, t, attack = 0.01, decay = 0.5, peak = 0.3, glide, vibrato, lowpass, wet = 0 }) {
  const { ctx } = out;
  const end = t + attack + decay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (glide) osc.frequency.exponentialRampToValueAtTime(glide, end);
  if (vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = vibrato.rate;
    depth.gain.value = vibrato.depth;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(end + 0.05);
  }
  // Exponential ramps cannot reach 0, so they start and end just above it.
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  let src = osc;
  if (lowpass) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lowpass;
    src = src.connect(f);
  }
  src.connect(g).connect(out.dest);
  if (wet) {
    const send = ctx.createGain();
    send.gain.value = wet;
    g.connect(send).connect(out.echo);
  }
  osc.start(t);
  osc.stop(end + 0.05);
}

// FM synthesis: a modulator bends the carrier's pitch. The modulation depth
// decays faster than the volume, which gives the metallic attack.
function fm(out, { freq, ratio, index, t, decay = 1.2, peak = 0.25, wet = 0 }) {
  const { ctx } = out;
  const car = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const modGain = ctx.createGain();
  const g = ctx.createGain();
  car.frequency.value = freq;
  mod.frequency.value = freq * ratio;
  modGain.gain.setValueAtTime(freq * index, t);
  modGain.gain.exponentialRampToValueAtTime(1, t + decay * 0.6);
  mod.connect(modGain).connect(car.frequency);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  car.connect(g).connect(out.dest);
  if (wet) {
    const send = ctx.createGain();
    send.gain.value = wet;
    g.connect(send).connect(out.echo);
  }
  for (const osc of [car, mod]) {
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }
}

// A bell: a fundamental plus inharmonic overtones that fade faster.
function bell(out, freq, t, partials) {
  for (const [ratio, peak, decay] of partials) note(out, { freq: freq * ratio, t, peak, decay });
}

const N = {
  C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880,
  C6: 1046.5, D6: 1174.7, E6: 1318.5, G6: 1568, A6: 1760, C7: 2093,
};

export const SOUNDS = [
  // Simple tones
  { id: "beep", name: "Beep", group: "Simple", duration: 1.2, play(out, t) {
    for (let i = 0; i < 3; i++) note(out, { freq: 880, t: t + i * 0.4, attack: 0.005, decay: 0.2, peak: 0.2 });
  } },
  { id: "chime", name: "Chime", group: "Simple", duration: 1.9, play(out, t) {
    note(out, { freq: N.C6, t, decay: 1.8 });
  } },
  { id: "doorbell", name: "Doorbell", group: "Simple", duration: 2.1, play(out, t) {
    note(out, { freq: N.E6, t, decay: 1.0 });
    note(out, { freq: N.C6, t: t + 0.45, decay: 1.6 });
  } },
  { id: "soft-pulse", name: "Soft pulse", group: "Simple", duration: 2.6, play(out, t) {
    for (let i = 0; i < 3; i++) note(out, { freq: 330, t: t + i * 0.9, attack: 0.3, decay: 0.5, peak: 0.35 });
  } },
  { id: "sonar", name: "Sonar ping", group: "Simple", duration: 2.5, play(out, t) {
    note(out, { freq: 1500, t, attack: 0.005, decay: 1.2, peak: 0.25, wet: 0.6 });
  } },
  { id: "gentle-wake", name: "Gentle wake", group: "Simple", duration: 3.4, play(out, t) {
    for (let i = 0; i < 5; i++) note(out, { freq: N.G5, t: t + i * 0.7, attack: 0.05, decay: 0.5, peak: 0.05 + i * 0.07 });
  } },

  // Bells and metal
  { id: "bell", name: "Bell", group: "Bells", duration: 2.6, play(out, t) {
    bell(out, 440, t, [[1, 0.3, 2.5], [2.76, 0.12, 1.4], [5.4, 0.06, 0.8], [8.9, 0.03, 0.4]]);
  } },
  { id: "gong", name: "Gong", group: "Bells", duration: 4.1, play(out, t) {
    for (const [freq, peak] of [[110, 0.25], [163, 0.12], [227, 0.1], [331, 0.06], [467, 0.04]]) {
      note(out, { freq, t, attack: 0.02, decay: 4, peak });
    }
  } },
  { id: "singing-bowl", name: "Singing bowl", group: "Bells", duration: 5.1, play(out, t) {
    // Two sines 3 Hz apart beat slowly against each other.
    note(out, { freq: 528, t, attack: 0.05, decay: 5, peak: 0.2 });
    note(out, { freq: 531, t, attack: 0.05, decay: 5, peak: 0.2 });
    note(out, { freq: 528 * 2.71, t, attack: 0.05, decay: 2.5, peak: 0.04 });
  } },
  { id: "glass", name: "Glass ping", group: "Bells", duration: 2.5, play(out, t) {
    fm(out, { freq: N.E6, ratio: 3.5, index: 2, t, decay: 1.6, peak: 0.2, wet: 0.3 });
  } },
  { id: "kitchen-timer", name: "Kitchen timer", group: "Bells", duration: 1.6, play(out, t) {
    // A clapper hitting a bell 18 times per second.
    for (let i = 0; i < 27; i++) {
      for (const [ratio, peak] of [[1, 0.12], [2.76, 0.05], [5.4, 0.03]]) {
        note(out, { freq: (2100 * ratio) / 2.76, t: t + i / 18, attack: 0.002, decay: 0.07, peak });
      }
    }
  } },
  { id: "wind-chimes", name: "Wind chimes", group: "Bells", duration: 3.4, play(out, t) {
    // Random notes from a pentatonic scale: different every time.
    const scale = [N.C6, N.D6, N.E6, N.G6, N.A6, N.C7];
    for (let i = 0; i < 9; i++) {
      const freq = scale[Math.floor(Math.random() * scale.length)];
      bell(out, freq, t + i * 0.17 + Math.random() * 0.1, [[1, 0.1, 1.8], [2.76, 0.03, 0.6]]);
    }
  } },

  // Instruments (imitated)
  { id: "marimba", name: "Marimba", group: "Instruments", duration: 0.9, play(out, t) {
    [N.G5, N.E5, N.C5].forEach((freq, i) => note(out, { type: "triangle", freq, t: t + i * 0.22, attack: 0.003, decay: 0.35, peak: 0.4 }));
  } },
  { id: "electric-piano", name: "Electric piano", group: "Instruments", duration: 2.2, play(out, t) {
    [N.C4, N.E4, N.G4, N.C5].forEach((freq, i) => fm(out, { freq, ratio: 1, index: 1.5, t: t + i * 0.03, decay: 2, peak: 0.12 }));
  } },
  { id: "music-box", name: "Music box", group: "Instruments", duration: 3.1, play(out, t) {
    // The opening of "Twinkle Twinkle Little Star".
    [N.C6, N.C6, N.G6, N.G6, N.A6, N.A6, N.G6].forEach((freq, i) => {
      const last = i === 6;
      note(out, { type: "triangle", freq, t: t + i * 0.28 + (last ? 0.1 : 0), attack: 0.002, decay: last ? 1.2 : 0.5, peak: 0.25 });
    });
  } },
  { id: "harp", name: "Harp glissando", group: "Instruments", duration: 1.9, play(out, t) {
    const run = [N.C4, N.D4, N.E4, N.G4, N.A4, N.C5, N.D5, N.E5, N.G5, N.A5, N.C6];
    run.forEach((freq, i) => note(out, { type: "triangle", freq, t: t + i * 0.06, attack: 0.003, decay: 1.2, peak: 0.15 }));
  } },
  { id: "steel-drum", name: "Steel drum", group: "Instruments", duration: 1.1, play(out, t) {
    // The pitch dips slightly at each hit.
    [N.E5, N.G5, N.C6].forEach((freq, i) => {
      for (const [ratio, peak] of [[1, 0.25], [2, 0.1], [3, 0.05]]) {
        note(out, { freq: freq * ratio * 1.02, glide: freq * ratio, t: t + i * 0.2, attack: 0.003, decay: 0.6, peak });
      }
    });
  } },
  { id: "cuckoo", name: "Cuckoo clock", group: "Instruments", duration: 1.6, play(out, t) {
    for (let i = 0; i < 2; i++) {
      note(out, { type: "triangle", freq: N.E5, t: t + i * 0.8, attack: 0.02, decay: 0.25, peak: 0.35, lowpass: 2000 });
      note(out, { type: "triangle", freq: N.C5, t: t + i * 0.8 + 0.3, attack: 0.02, decay: 0.35, peak: 0.35, lowpass: 2000 });
    }
  } },
  { id: "whistle", name: "Whistle", group: "Instruments", duration: 1.2, play(out, t) {
    const vibrato = { rate: 6, depth: 15 };
    note(out, { freq: 1200, glide: 1800, t, attack: 0.08, decay: 0.4, peak: 0.2, vibrato });
    note(out, { freq: 1800, glide: 1100, t: t + 0.6, attack: 0.05, decay: 0.5, peak: 0.2, vibrato });
  } },

  // Melodies
  { id: "arpeggio", name: "Rising arpeggio", group: "Melodies", duration: 1.1, play(out, t) {
    [N.C5, N.E5, N.G5, N.C6].forEach((freq, i) => note(out, { type: "triangle", freq, t: t + i * 0.15, decay: 0.6 }));
  } },
  { id: "westminster", name: "Westminster quarter", group: "Melodies", duration: 4.4, play(out, t) {
    // The four-note phrase of Big Ben; the last note rings longer.
    [N.E5, N.C5, N.D5, N.G4].forEach((freq, i) => {
      const stretch = i === 3 ? 1.6 : 1;
      bell(out, freq, t + i * 0.6, [[1, 0.25, 1.6 * stretch], [2.76, 0.06, 0.6 * stretch]]);
    });
  } },
  { id: "task-complete", name: "Task complete", group: "Melodies", duration: 2.2, play(out, t) {
    note(out, { freq: N.G5, t, decay: 0.3, peak: 0.25, wet: 0.3 });
    note(out, { freq: N.E6, t: t + 0.13, decay: 1.0, peak: 0.25, wet: 0.3 });
  } },

  // Electronic / retro
  { id: "digital-watch", name: "Digital watch", group: "Electronic", duration: 1.2, play(out, t) {
    for (let burst = 0; burst < 2; burst++) {
      for (let i = 0; i < 4; i++) {
        note(out, { type: "square", freq: 4000, t: t + burst * 0.8 + i * 0.09, attack: 0.002, decay: 0.05, peak: 0.08 });
      }
    }
  } },
  { id: "level-up", name: "8-bit level up", group: "Electronic", duration: 0.8, play(out, t) {
    [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6].forEach((freq, i) => {
      note(out, { type: "square", freq, t: t + i * 0.07, attack: 0.002, decay: i === 5 ? 0.4 : 0.07, peak: 0.07 });
    });
  } },
  { id: "sci-fi", name: "Sci-fi sweep", group: "Electronic", duration: 1.3, play(out, t) {
    note(out, { freq: 300, glide: 1200, t, attack: 0.05, decay: 1.2, peak: 0.2, vibrato: { rate: 8, depth: 20 } });
  } },
];
