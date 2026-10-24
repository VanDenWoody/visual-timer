// Pure timer state machine. Functions that depend on time take `now` (ms since epoch);
// nothing here reads the clock. An illegal transition returns the same state object.

export const DEFAULT_MINUTES = 40;
export const MS_PER_MINUTE = 60_000;

export function clampMinutes(value) {
  if (value === null || value === undefined || value === "") return DEFAULT_MINUTES;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_MINUTES;
  return Math.min(60, Math.max(1, n));
}

export function createTimer(minutes = DEFAULT_MINUTES) {
  return { status: "idle", setMinutes: clampMinutes(minutes), endAt: null, pausedRemainingMs: null };
}

export function setMinutes(state, minutes) {
  return state.status === "running" ? state : createTimer(minutes);
}

export function start(state, now) {
  if (state.status !== "idle") return state;
  return { ...state, status: "running", endAt: now + state.setMinutes * MS_PER_MINUTE };
}

export function tick(state, now) {
  if (state.status !== "running" || now < state.endAt) return state;
  return { ...state, status: "overtime" };
}

export function pause(state, now) {
  if (state.status !== "running") return state;
  // Time already ran out: there is nothing left to pause.
  if (now >= state.endAt) return tick(state, now);
  return { ...state, status: "paused", endAt: null, pausedRemainingMs: state.endAt - now };
}

export function resume(state, now) {
  if (state.status !== "paused") return state;
  return { ...state, status: "running", endAt: now + state.pausedRemainingMs, pausedRemainingMs: null };
}

export function reset(state) {
  if (state.status === "idle") return state;
  return createTimer(state.setMinutes);
}

// Running, paused or overtime: start over from the full planned minutes.
export function restart(state, now) {
  if (state.status === "idle") return state;
  return start(createTimer(state.setMinutes), now);
}

export function remainingMs(state, now) {
  switch (state.status) {
    case "idle":
      return state.setMinutes * MS_PER_MINUTE;
    case "running":
      return Math.max(0, state.endAt - now);
    case "paused":
      return state.pausedRemainingMs;
    default:
      return 0;
  }
}

export function overtimeMs(state, now) {
  return state.status === "overtime" ? Math.max(0, now - state.endAt) : 0;
}

export function overtimeLabel(ms) {
  return `-${Math.max(1, Math.ceil(ms / MS_PER_MINUTE))}`;
}
