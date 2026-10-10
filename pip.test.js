import { test } from "node:test";
import assert from "node:assert/strict";
import { setupPip } from "./pip.js";

function fixture(t, supported = false) {
  const listeners = {};
  const attributes = {};
  const button = {
    hidden: false,
    disabled: false,
    title: "Pop out: always on top",
    setAttribute: (name, value) => { attributes[name] = value; },
    addEventListener: (name, handler) => { listeners[name] = handler; },
  };
  const unavailableMessage = {
    id: "pip-unavailable",
    textContent: "Picture-in-Picture is unavailable in this browser/device. You can still use the timer here.",
    hidden: true,
  };
  const stage = {};
  const mainBody = { append: (node) => { node.parentNode = mainBody; } };
  mainBody.classList = { toggle: (name, value) => { mainBody[name] = value; } };
  mainBody.append(stage);
  let moves = 0;
  const api = { window: null };
  const globals = {
    window: supported ? { documentPictureInPicture: api } : {},
    document: { title: "Visual Timer", body: mainBody },
    location: { href: "https://example.com/timer/" },
  };
  if (supported) globals.documentPictureInPicture = api;
  for (const [name, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  }
  const options = { button, stage, unavailableMessage, onMove: () => { moves++; } };
  return { options, listeners, attributes, api, mainBody, moves: () => moves };
}

test("unsupported PiP stays visible, explains unavailability and leaves the timer in place", (t) => {
  const f = fixture(t);
  setupPip(f.options);
  assert.equal(f.options.button.hidden, false);
  assert.equal(f.options.button.disabled, true);
  assert.equal(f.options.unavailableMessage.hidden, false);
  assert.equal(f.options.button.title, f.options.unavailableMessage.textContent);
  assert.equal(f.attributes["aria-describedby"], "pip-unavailable");
  assert.equal(f.listeners.click, undefined);
  assert.equal(f.options.stage.parentNode, f.mainBody);
  assert.equal(f.moves(), 0);
});

test("supported PiP opens the same window and restores the timer on close", async (t) => {
  const f = fixture(t, true);
  const pipListeners = {};
  const pipBody = { append: (node) => { node.parentNode = pipBody; } };
  const pip = {
    document: {
      body: pipBody,
      createElement: () => ({}),
      head: { append: (link) => {
        assert.equal(link.rel, "stylesheet");
        assert.equal(link.href, "https://example.com/timer/styles.css");
        link.onload();
      } },
    },
    addEventListener: (name, handler) => { pipListeners[name] = handler; },
  };
  f.api.requestWindow = async (options) => {
    assert.deepEqual(options, { width: 260, height: 260 });
    assert.equal(f.options.button.disabled, true);
    f.api.window = pip;
    return pip;
  };
  setupPip(f.options);
  assert.equal(f.options.button.disabled, false);
  assert.equal(f.options.button.title, "Pop out: always on top");
  assert.equal(f.options.unavailableMessage.hidden, true);
  assert.deepEqual(f.attributes, {});
  await f.listeners.click();
  assert.equal(pip.document.title, "Visual Timer");
  assert.equal(f.options.stage.parentNode, pipBody);
  assert.equal(f.mainBody["popped-out"], true);
  assert.equal(f.options.button.disabled, false);
  assert.equal(f.moves(), 1);
  pipListeners.pagehide();
  assert.equal(f.options.stage.parentNode, f.mainBody);
  assert.equal(f.mainBody["popped-out"], false);
  assert.equal(f.moves(), 2);
});

test("a refused PiP request leaves the main timer in place and allows retry", async (t) => {
  const f = fixture(t, true);
  f.api.requestWindow = async () => { throw new Error("Refused by browser"); };
  setupPip(f.options);
  await f.listeners.click();
  assert.equal(f.options.stage.parentNode, f.mainBody);
  assert.equal(f.options.button.disabled, false);
  assert.equal(f.options.unavailableMessage.hidden, true);
  assert.equal(f.moves(), 0);
});
