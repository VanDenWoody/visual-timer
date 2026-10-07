import { test } from "node:test";
import assert from "node:assert/strict";
import { CUSTOM_SOUND, DEFAULT_SOUND, DEFAULT_VOLUME, SOUNDS, clampVolume, resolveSound } from "./sounds.js";

// A minimal stand-in for AudioContext that records when each source stops and
// enforces the Web Audio rules that throw in a real browser.
function fakeContext() {
  const stops = [];
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime(value) {
      if (!(value > 0)) throw new RangeError("exponential ramp to a value <= 0");
    },
  });
  const node = (extra = {}) => ({ connect: (target) => target, ...extra });
  const source = () => node({
    frequency: param(),
    start(t) { this.started = t; },
    stop(t) {
      if (this.started === undefined) throw new Error("stop before start");
      stops.push(t);
    },
  });
  const ctx = {
    createOscillator: source,
    createGain: () => node({ gain: param() }),
    createBiquadFilter: () => node({ frequency: param(), Q: param() }),
  };
  return { ctx, stops };
}

test("SOUNDS: unique ids, a name, a group and a duration each", () => {
  const ids = SOUNDS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes(CUSTOM_SOUND));
  for (const s of SOUNDS) {
    assert.ok(s.name && s.group, s.id);
    assert.ok(s.duration > 0, s.id);
  }
});

test("SOUNDS: every sound plays without error and is silent by its duration", () => {
  const T = 10;
  for (const s of SOUNDS) {
    const { ctx, stops } = fakeContext();
    s.play({ ctx, dest: {}, echo: {} }, T);
    assert.ok(stops.length > 0, `${s.id} schedules no notes`);
    const last = Math.max(...stops);
    assert.ok(last <= T + s.duration + 0.1, `${s.id} ends at +${(last - T).toFixed(2)} s, duration ${s.duration}`);
    // A duration far beyond the last note would delay the flashing for nothing.
    assert.ok(last >= T + s.duration - 1.5, `${s.id} duration ${s.duration} is much longer than its notes`);
  }
});

test("resolveSound: known ids pass, unknown or orphaned choices fall back", () => {
  assert.equal(resolveSound("bell", false), "bell");
  assert.equal(resolveSound(CUSTOM_SOUND, true), CUSTOM_SOUND);
  assert.equal(resolveSound(CUSTOM_SOUND, false), DEFAULT_SOUND);
  assert.equal(resolveSound("removed-sound", true), DEFAULT_SOUND);
  assert.equal(resolveSound(null, false), DEFAULT_SOUND);
  assert.ok(SOUNDS.some((s) => s.id === DEFAULT_SOUND));
});

test("clampVolume: stored values that are missing, malformed or out of range", () => {
  assert.equal(DEFAULT_VOLUME, 1);
  assert.equal(clampVolume(null), 1);
  assert.equal(clampVolume(""), 1);
  assert.equal(clampVolume("loud"), 1);
  assert.equal(clampVolume("0"), 0);
  assert.equal(clampVolume("0.5"), 0.5);
  assert.equal(clampVolume("0.62"), 0.6);
  assert.equal(clampVolume("-1"), 0);
  assert.equal(clampVolume("7"), 1);
  assert.equal(clampVolume(0.35), 0.35);
});
