// In the Tauri desktop app the pop-out button turns the window itself into a small
// always-on-top overlay and back; src-tauri does the window work and reports each
// switch, including those from minimising and the tray menu.

// Outside this radius (in dial units) there are no labels or sectors, only the
// empty corners of the square: they move the overlay instead of setting minutes.
const DIAL_CENTRE = 120;
const GRIP_RADIUS = 116;
// A press on the running dial that moves further than this drags the overlay;
// a press that stays put is still a click that pauses.
const DRAG_THRESHOLD = 5;

export function setupDesktop({ button, titlebar, stage, dial }) {
  const tauri = window.__TAURI__;
  if (!tauri) return null;

  let pending = null; // A press on the running dial that may still become a drag.
  let swallowClick = false;

  function compact() {
    return document.body.classList.contains("compact");
  }

  function startDragging() {
    tauri.window.getCurrentWindow().startDragging().catch(() => {});
  }

  function onGrip(event) {
    if (titlebar.contains(event.target)) return true;
    if (!dial.contains(event.target)) return false;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(dial.getScreenCTM().inverse());
    return Math.hypot(p.x - DIAL_CENTRE, p.y - DIAL_CENTRE) > GRIP_RADIUS;
  }

  // Capture phase, so a press that moves the overlay never reaches the dial's own handlers.
  window.addEventListener("pointerdown", (event) => {
    // A drag can end outside the window, without the click it was waiting to swallow.
    swallowClick = false;
    if (!compact() || event.target.closest("button, dialog")) return;
    // Alt + drag moves the overlay from anywhere. Not the right button: Windows only
    // moves a window while the left button is held.
    if (event.button === 0 && (event.altKey || onGrip(event))) {
      event.stopPropagation();
      event.preventDefault();
      startDragging();
    } else if (event.button === 0 && stage.classList.contains("running") && dial.contains(event.target)) {
      pending = { x: event.clientX, y: event.clientY };
    }
  }, true);

  window.addEventListener("pointermove", (event) => {
    if (!compact()) return;
    document.body.classList.toggle("on-grip", onGrip(event));
    if (pending && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > DRAG_THRESHOLD) {
      pending = null;
      swallowClick = true; // The release after the drag must not pause the timer.
      startDragging();
    }
  }, true);

  window.addEventListener("pointerup", () => {
    pending = null;
  }, true);

  window.addEventListener("click", (event) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.stopPropagation();
  }, true);

  showCompact(false);
  button.addEventListener("click", () => tauri.core.invoke("toggle_compact").catch(() => {}));
  tauri.event.listen("compact", ({ payload }) => showCompact(payload));

  function showCompact(on) {
    document.body.classList.toggle("compact", on);
    document.body.classList.remove("on-grip");
    swallowClick = false;
    button.title = on ? "Back to the full window" : "Overlay: small and always on top";
    button.setAttribute("aria-label", on ? "Full window" : "Overlay");
  }

  return {
    // Time ran out while the window sat in the tray.
    reveal: () => tauri.core.invoke("reveal_window").catch(() => {}),
  };
}
