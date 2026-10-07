import { minutesToAngle, polar, pointToMinutes, sectorPath, snapWithSeam } from "./dial.js";
import {
  DEFAULT_MINUTES, MS_PER_MINUTE, clampMinutes, createTimer, overtimeLabel, overtimeMs,
  pause, remainingMs, reset, restart, resume, setMinutes, start, tick,
} from "./timer.js";
import { createAlarm } from "./alarm.js";
import { setupPip } from "./pip.js";
import { setupSoundPicker } from "./sound-picker.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const CENTRE = 120;
const SECTOR_RADIUS = 80;
const HOUR_MS = 60 * MS_PER_MINUTE;
const STORAGE_KEY = "visual-timer.minutes";
const CENTRE_ACTIONS = { idle: "Start", running: "Pause", paused: "Resume", overtime: "Stop" };

const stage = document.getElementById("stage");
const dial = document.getElementById("dial");
const face = document.getElementById("face");
const plannedPath = document.getElementById("planned");
const timeLeftPath = document.getElementById("time-left");
const overtimePath = document.getElementById("overtime");
const centre = document.getElementById("centre");
const iconPlay = document.getElementById("icon-play");
const iconPause = document.getElementById("icon-pause");
const centreLabel = document.getElementById("centre-label");
const restartButton = document.getElementById("restart");

const alarm = createAlarm({ flashTarget: stage });

let state = createTimer(loadMinutes());
let endTimer = null;
let dragging = false;
let frameWindow = window;
let frameId = 0;

function loadMinutes() {
  try {
    return clampMinutes(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_MINUTES;
  }
}

function saveMinutes(minutes) {
  try {
    localStorage.setItem(STORAGE_KEY, String(minutes));
  } catch {
    // Storage blocked: the value is simply not remembered.
  }
}

function svg(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

function buildFace() {
  for (let m = 0; m < 60; m++) {
    const major = m % 5 === 0;
    const angle = minutesToAngle(m);
    const inner = polar(CENTRE, CENTRE, 84, angle);
    const outer = polar(CENTRE, CENTRE, major ? 94 : 89, angle);
    face.append(svg("line", {
      class: major ? "tick major" : "tick",
      x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y,
    }));
    if (major) {
      const at = polar(CENTRE, CENTRE, 106, angle);
      const label = svg("text", { class: "label", x: at.x, y: at.y });
      label.textContent = String(m);
      face.append(label);
    }
  }
}

function setAttr(el, name, value) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function render(now = Date.now()) {
  const { status } = state;
  // In idle the outline would only trace the edge of the full sector.
  const plannedFraction = status === "idle" ? 0 : (state.setMinutes * MS_PER_MINUTE) / HOUR_MS;
  setAttr(plannedPath, "d", sectorPath(CENTRE, CENTRE, SECTOR_RADIUS, plannedFraction));
  setAttr(timeLeftPath, "d", sectorPath(CENTRE, CENTRE, SECTOR_RADIUS, remainingMs(state, now) / HOUR_MS));
  setAttr(overtimePath, "d", sectorPath(CENTRE, CENTRE, SECTOR_RADIUS, overtimeMs(state, now) / HOUR_MS));
  // SVG elements have no `hidden` property, so toggle the attribute.
  // While running only the dial shows; a click anywhere on it pauses.
  centre.toggleAttribute("hidden", status === "running");
  iconPlay.toggleAttribute("hidden", status === "running" || status === "overtime");
  iconPause.toggleAttribute("hidden", status !== "running");
  centreLabel.toggleAttribute("hidden", status !== "overtime");
  // Overtime already resets through the centre.
  restartButton.hidden = status !== "running" && status !== "paused";
  if (status === "overtime") {
    const text = overtimeLabel(overtimeMs(state, now));
    if (centreLabel.textContent !== text) centreLabel.textContent = text;
  }
  setAttr(centre, "aria-label", CENTRE_ACTIONS[status]);
}

// Hidden windows get no animation frames, so a timeout also aims at the end time.
function scheduleEnd() {
  clearTimeout(endTimer);
  endTimer = null;
  if (state.status !== "running") return;
  endTimer = setTimeout(() => apply(tick(state, Date.now())), Math.max(0, state.endAt - Date.now()));
}

// Every state change goes through here, so the alarm starts exactly once:
// on the edge into overtime. Leaving overtime silences it.
function apply(next) {
  const wasOvertime = state.status === "overtime";
  state = next;
  if (!wasOvertime && state.status === "overtime") alarm.start();
  if (state.status !== "overtime") alarm.stop();
  stage.classList.toggle("running", state.status === "running");
  scheduleEnd();
  render();
}

function onCentre() {
  const now = Date.now();
  const ticked = tick(state, now);
  // Time ran out just before the click (or while asleep): the click only reveals it.
  if (ticked !== state) {
    apply(ticked);
    return;
  }
  switch (state.status) {
    case "idle":
      alarm.unlock();
      apply(start(state, now));
      break;
    case "running":
      apply(pause(state, now));
      break;
    case "paused":
      apply(resume(state, now));
      break;
    case "overtime":
      apply(reset(state));
      break;
  }
}

function onRestart() {
  apply(restart(state, Date.now()));
}

function minutesAt(event) {
  const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(dial.getScreenCTM().inverse());
  return pointToMinutes(p.x, p.y, CENTRE, CENTRE);
}

function endDrag() {
  if (!dragging) return;
  dragging = false;
  saveMinutes(state.setMinutes);
}

centre.addEventListener("click", onCentre);
restartButton.addEventListener("click", onRestart);
centre.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onCentre();
  }
});

// The centre is hidden while running, so the whole dial pauses.
dial.addEventListener("click", (event) => {
  if (state.status === "running" && !centre.contains(event.target)) onCentre();
});

// The hidden centre cannot take focus, so Space or Enter anywhere in the window pauses.
const keyDocuments = new WeakSet();
function watchKeys() {
  const doc = stage.ownerDocument;
  if (keyDocuments.has(doc)) return;
  keyDocuments.add(doc);
  doc.addEventListener("keydown", (event) => {
    // defaultPrevented: the centre already handled this key (it bubbles up here).
    if (event.repeat || event.defaultPrevented || state.status !== "running") return;
    // A focused button or radio handles Space and Enter itself, as does the open sound panel.
    if (event.target.closest?.("button, input, dialog")) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onCentre();
    }
  });
}

dial.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || centre.contains(event.target) || state.status === "running") return;
  dragging = true;
  dial.setPointerCapture(event.pointerId);
  apply(setMinutes(state, minutesAt(event)));
});

dial.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const next = snapWithSeam(state.setMinutes, minutesAt(event));
  if (next !== state.setMinutes) apply(setMinutes(state, next));
});

dial.addEventListener("pointerup", endDrag);
dial.addEventListener("pointercancel", endDrag);
// Moving the stage between windows releases the capture without a pointerup.
dial.addEventListener("lostpointercapture", endDrag);

function frame() {
  const now = Date.now();
  const next = tick(state, now);
  if (next !== state) apply(next);
  else render(now);
  frameId = frameWindow.requestAnimationFrame(frame);
}

// Animation frames come from the window that shows the dial: a minimised main
// window gets none, and a closed Picture-in-Picture window never fires its pending one.
function startFrames() {
  frameWindow.cancelAnimationFrame(frameId);
  frameWindow = stage.ownerDocument.defaultView;
  frameId = frameWindow.requestAnimationFrame(frame);
}

buildFace();
apply(state);
startFrames();
watchKeys();
// Moving the stage between windows can drop the pointer capture without any event on the dial.
setupPip({
  button: document.getElementById("pop-out"),
  stage,
  onMove: () => {
    endDrag();
    startFrames();
    watchKeys();
  },
});

setupSoundPicker({
  button: document.getElementById("sound-button"),
  dialog: document.getElementById("sound-dialog"),
  alarm,
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Not a secure context, or the browser refused. The app works regardless.
    });
  });
}
