import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MINUTES, MS_PER_MINUTE, clampMinutes, createTimer, overtimeLabel, overtimeMs,
  pause, remainingMs, reset, restart, resume, setMinutes, start, tick,
} from "./timer.js";

const T0 = 1_000_000;
const MIN = MS_PER_MINUTE;

test("createTimer: idle at 40 minutes by default", () => {
  const s = createTimer();
  assert.equal(DEFAULT_MINUTES, 40);
  assert.equal(s.status, "idle");
  assert.equal(s.setMinutes, 40);
  assert.equal(remainingMs(s, T0), 40 * MIN);
  assert.equal(overtimeMs(s, T0), 0);
});

test("clampMinutes: stored values that are missing or malformed", () => {
  assert.equal(clampMinutes(null), 40);
  assert.equal(clampMinutes(undefined), 40);
  assert.equal(clampMinutes(""), 40);
  assert.equal(clampMinutes("abc"), 40);
  assert.equal(clampMinutes("0"), 1);
  assert.equal(clampMinutes("-5"), 1);
  assert.equal(clampMinutes("999"), 60);
  assert.equal(clampMinutes("12.6"), 13);
  assert.equal(clampMinutes(25), 25);
});

test("start: idle → running, ending setMinutes later", () => {
  const s = start(createTimer(10), T0);
  assert.equal(s.status, "running");
  assert.equal(s.endAt, T0 + 10 * MIN);
  assert.equal(remainingMs(s, T0 + 4 * MIN), 6 * MIN);
});

test("tick: stays running before the end, overtime at and after it", () => {
  const s = start(createTimer(10), T0);
  assert.equal(tick(s, T0 + 10 * MIN - 1), s);
  const o = tick(s, T0 + 10 * MIN);
  assert.equal(o.status, "overtime");
  assert.equal(remainingMs(o, T0 + 13 * MIN), 0);
  assert.equal(overtimeMs(o, T0 + 13 * MIN), 3 * MIN);
});

test("pause and resume keep the remaining time", () => {
  const s = start(createTimer(10), T0);
  const p = pause(s, T0 + 4 * MIN);
  assert.equal(p.status, "paused");
  assert.equal(remainingMs(p, T0 + 100 * MIN), 6 * MIN);
  const r = resume(p, T0 + 50 * MIN);
  assert.equal(r.status, "running");
  assert.equal(r.endAt, T0 + 56 * MIN);
  assert.equal(remainingMs(r, T0 + 50 * MIN), 6 * MIN);
});

test("pause after the end time has passed goes to overtime, not paused", () => {
  const s = start(createTimer(10), T0);
  const p = pause(s, T0 + 11 * MIN);
  assert.equal(p.status, "overtime");
  assert.equal(overtimeMs(p, T0 + 11 * MIN), MIN);
});

test("reset: running, paused and overtime return to idle at the same minutes", () => {
  const running = start(createTimer(10), T0);
  const fromRunning = reset(running);
  assert.equal(fromRunning.status, "idle");
  assert.equal(fromRunning.setMinutes, 10);
  const fromPaused = reset(pause(running, T0 + MIN));
  assert.equal(fromPaused.status, "idle");
  assert.equal(fromPaused.setMinutes, 10);
  const fromOvertime = reset(tick(running, T0 + 20 * MIN));
  assert.equal(fromOvertime.status, "idle");
  assert.equal(fromOvertime.setMinutes, 10);
});

test("restart: running and paused start over from the full minutes", () => {
  const running = start(createTimer(10), T0);
  for (const s of [running, pause(running, T0 + MIN)]) {
    const restarted = restart(s, T0 + 3 * MIN);
    assert.equal(restarted.status, "running");
    assert.equal(restarted.setMinutes, 10);
    assert.equal(remainingMs(restarted, T0 + 3 * MIN), 10 * MIN);
  }
});

test("restart: idle and overtime are unchanged", () => {
  const idle = createTimer(10);
  assert.equal(restart(idle, T0), idle);
  const overtime = tick(start(idle, T0), T0 + 20 * MIN);
  assert.equal(restart(overtime, T0), overtime);
});

test("setMinutes: idle, paused and overtime become idle with the new value", () => {
  const idle = createTimer(10);
  const running = start(idle, T0);
  for (const s of [idle, pause(running, T0 + MIN), tick(running, T0 + 20 * MIN)]) {
    const next = setMinutes(s, 25);
    assert.equal(next.status, "idle");
    assert.equal(next.setMinutes, 25);
  }
  assert.equal(setMinutes(idle, 75).setMinutes, 60);
});

test("setMinutes: ignored while running", () => {
  const running = start(createTimer(10), T0);
  assert.equal(setMinutes(running, 25), running);
});

test("illegal transitions return the same state", () => {
  const idle = createTimer();
  assert.equal(pause(idle, T0), idle);
  assert.equal(resume(idle, T0), idle);
  assert.equal(reset(idle), idle);
  assert.equal(tick(idle, T0 + 999 * MIN), idle);
  const running = start(idle, T0);
  assert.equal(start(running, T0 + 1), running);
  assert.equal(resume(running, T0 + 1), running);
  const paused = pause(running, T0 + MIN);
  assert.equal(start(paused, T0), paused);
  assert.equal(pause(paused, T0), paused);
  assert.equal(tick(paused, T0 + 999 * MIN), paused);
  const overtime = tick(running, T0 + 50 * MIN);
  assert.equal(start(overtime, T0), overtime);
  assert.equal(pause(overtime, T0), overtime);
  assert.equal(resume(overtime, T0), overtime);
});

test("overtimeLabel: whole minutes rounded up, never -0", () => {
  assert.equal(overtimeLabel(0), "-1");
  assert.equal(overtimeLabel(1), "-1");
  assert.equal(overtimeLabel(MIN), "-1");
  assert.equal(overtimeLabel(MIN + 1), "-2");
  assert.equal(overtimeLabel(90 * MIN), "-90");
});
