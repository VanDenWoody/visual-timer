import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_MINUTES, minutesToAngle, polar, pointToMinutes, snapWithSeam, sectorPath } from "./dial.js";

const near = (a, b) => Math.abs(a - b) < 1e-9;

test("minutesToAngle: 6 degrees per minute from 12 o'clock", () => {
  assert.equal(MAX_MINUTES, 60);
  assert.equal(minutesToAngle(0), 0);
  assert.equal(minutesToAngle(15), 90);
  assert.equal(minutesToAngle(40), 240);
  assert.equal(minutesToAngle(60), 360);
});

test("polar: 0 degrees is straight up, 90 is to the right", () => {
  const up = polar(100, 100, 50, 0);
  assert.ok(near(up.x, 100) && near(up.y, 50));
  const right = polar(100, 100, 50, 90);
  assert.ok(near(right.x, 150) && near(right.y, 100));
});

test("pointToMinutes: compass points", () => {
  assert.equal(pointToMinutes(150, 100, 100, 100), 15);
  assert.equal(pointToMinutes(100, 150, 100, 100), 30);
  assert.equal(pointToMinutes(50, 100, 100, 100), 45);
});

test("pointToMinutes: pointing at 0 counts as 60, never 0", () => {
  assert.equal(pointToMinutes(100, 50, 100, 100), 60);
  assert.equal(pointToMinutes(99.9, 50, 100, 100), 60);
  const justRight = polar(100, 100, 50, minutesToAngle(0.4));
  assert.equal(pointToMinutes(justRight.x, justRight.y, 100, 100), 60);
});

test("pointToMinutes: snaps to the nearest whole minute", () => {
  const below = polar(100, 100, 50, minutesToAngle(40.4));
  assert.equal(pointToMinutes(below.x, below.y, 100, 100), 40);
  const above = polar(100, 100, 50, minutesToAngle(40.6));
  assert.equal(pointToMinutes(above.x, above.y, 100, 100), 41);
});

test("pointToMinutes: every direction gives a value from 1 to 60", () => {
  for (let deg = 0; deg < 360; deg += 0.5) {
    const p = polar(100, 100, 50, deg);
    const m = pointToMinutes(p.x, p.y, 100, 100);
    assert.ok(Number.isInteger(m) && m >= 1 && m <= 60, `deg ${deg} gave ${m}`);
  }
});

test("snapWithSeam: ordinary moves pass through", () => {
  assert.equal(snapWithSeam(40, 41), 41);
  assert.equal(snapWithSeam(40, 39), 39);
  assert.equal(snapWithSeam(2, 1), 1);
  assert.equal(snapWithSeam(59, 60), 60);
});

test("snapWithSeam: dragging clockwise past 60 stays at 60", () => {
  assert.equal(snapWithSeam(60, 1), 60);
  assert.equal(snapWithSeam(58, 3), 60);
  assert.equal(snapWithSeam(60, 15), 60);
});

test("snapWithSeam: dragging anticlockwise past 1 stays at 1", () => {
  assert.equal(snapWithSeam(1, 60), 1);
  assert.equal(snapWithSeam(2, 57), 1);
  assert.equal(snapWithSeam(1, 45), 1);
});

test("snapWithSeam: coming back from the clamp works", () => {
  assert.equal(snapWithSeam(60, 55), 55);
  assert.equal(snapWithSeam(1, 5), 5);
});

test("sectorPath: empty for zero, negative and NaN", () => {
  assert.equal(sectorPath(100, 100, 50, 0), "");
  assert.equal(sectorPath(100, 100, 50, -0.1), "");
  assert.equal(sectorPath(100, 100, 50, NaN), "");
});

test("sectorPath: quarter, half and three quarters", () => {
  assert.equal(sectorPath(100, 100, 50, 0.25), "M 100 100 L 100 50 A 50 50 0 0 1 150 100 Z");
  assert.equal(sectorPath(100, 100, 50, 0.5), "M 100 100 L 100 50 A 50 50 0 0 1 100 150 Z");
  assert.equal(sectorPath(100, 100, 50, 0.75), "M 100 100 L 100 50 A 50 50 0 1 1 50 100 Z");
});

test("sectorPath: full circle at 1 and at any fraction above 1", () => {
  const full = "M 100 50 A 50 50 0 1 1 100 150 A 50 50 0 1 1 100 50 Z";
  assert.equal(sectorPath(100, 100, 50, 1), full);
  assert.equal(sectorPath(100, 100, 50, 1.5), full);
});
