// Plays the chosen sound once, then flashes until stopped. The sound is one of
// the synthesised SOUNDS or an uploaded audio file. When the file cannot play,
// the beep stands in for it, so the timer never ends silently.

import { CUSTOM_SOUND, DEFAULT_SOUND, DEFAULT_VOLUME, SOUNDS } from "./sounds.js";

// The synthesised sounds at full volume; an uploaded file plays at its own level.
const TONE_GAIN = 0.8;
const ECHO_DELAY = 0.28;
const ECHO_FEEDBACK = 0.35;

function findSound(id) {
  return SOUNDS.find((s) => s.id === id) ?? SOUNDS.find((s) => s.id === DEFAULT_SOUND);
}

export function createAlarm({ flashTarget }) {
  let audioContext = null;
  let phase = "off"; // off | playing | flashing
  let choice = DEFAULT_SOUND;
  let fileUrl = null;
  let volume = DEFAULT_VOLUME;
  let playing = null; // what the alarm plays now: { stop(), setVolume(v) }
  let previewing = null; // what a preview plays now: { stop(), setVolume(v) }

  // Plays a synthesised sound once through its own output, so stopping it is a
  // disconnect. onEnd runs when its notes (and echo) have died away.
  function playTone(id, onEnd) {
    if (!audioContext) {
      onEnd();
      return { stop() {}, setVolume() {} };
    }
    const sound = findSound(id);
    const ctx = audioContext;
    const dest = ctx.createGain();
    dest.gain.value = TONE_GAIN * volume;
    dest.connect(ctx.destination);
    const echo = ctx.createDelay(1);
    echo.delayTime.value = ECHO_DELAY;
    const feedback = ctx.createGain();
    feedback.gain.value = ECHO_FEEDBACK;
    echo.connect(feedback).connect(echo);
    echo.connect(dest);
    ctx.resume().catch(() => {});
    sound.play({ ctx, dest, echo }, ctx.currentTime + 0.05);
    const timer = setTimeout(onEnd, (sound.duration + 0.05) * 1000);
    return {
      stop() {
        clearTimeout(timer);
        dest.disconnect();
        echo.disconnect();
      },
      // A short glide, so changing the volume mid-sound does not click.
      setVolume(v) {
        dest.gain.setTargetAtTime(TONE_GAIN * v, ctx.currentTime, 0.02);
      },
    };
  }

  // Plays the uploaded file once; onFail when the browser cannot play it.
  function playFile(url, onEnd, onFail) {
    const audio = new Audio(url);
    audio.volume = volume;
    let done = false;
    const finish = (callback) => () => {
      if (done) return;
      done = true;
      callback();
    };
    audio.addEventListener("ended", finish(onEnd));
    audio.addEventListener("error", finish(onFail));
    audio.play().catch(finish(onFail));
    return {
      stop() {
        done = true;
        audio.pause();
        audio.removeAttribute("src");
      },
      setVolume(v) {
        audio.volume = v;
      },
    };
  }

  function play(id, onEnd) {
    if (id !== CUSTOM_SOUND || !fileUrl) return playTone(id, onEnd);
    // onFail always runs asynchronously, after `current` is assigned.
    let current = playFile(fileUrl, onEnd, () => {
      current = playTone(DEFAULT_SOUND, onEnd);
    });
    return { stop: () => current.stop(), setVolume: (v) => current.setVolume(v) };
  }

  function flash() {
    if (phase !== "playing") return;
    phase = "flashing";
    playing = null;
    flashTarget.classList.add("flashing");
  }

  function stopPreview() {
    previewing?.stop();
    previewing = null;
  }

  return {
    // Browsers only allow audio after a user gesture: call this from a click.
    unlock() {
      if (!audioContext && "AudioContext" in window) audioContext = new AudioContext();
      audioContext?.resume().catch(() => {});
    },
    // id: one of SOUNDS, or CUSTOM_SOUND with the uploaded file's blob.
    setSound(id, blob = null) {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      fileUrl = blob ? URL.createObjectURL(blob) : null;
      choice = id === CUSTOM_SOUND && !fileUrl ? DEFAULT_SOUND : id;
    },
    // 0 to 1; also changes a sound that is playing now.
    setVolume(v) {
      volume = v;
      playing?.setVolume(v);
      previewing?.setVolume(v);
    },
    // Plays a sound once for the picker, without starting the alarm.
    preview(id, blob = null) {
      stopPreview();
      this.unlock();
      if (id === CUSTOM_SOUND && blob) {
        const url = URL.createObjectURL(blob);
        const release = () => URL.revokeObjectURL(url);
        const handle = playFile(url, release, release);
        previewing = {
          stop() {
            handle.stop();
            release();
          },
          setVolume: handle.setVolume,
        };
      } else {
        previewing = playTone(id, () => {});
      }
    },
    stopPreview,
    // Resolves to whether this browser can play the file, judged by its metadata.
    canPlay(blob) {
      return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio();
        const done = (ok) => () => {
          URL.revokeObjectURL(url);
          resolve(ok);
        };
        audio.addEventListener("loadedmetadata", done(true), { once: true });
        audio.addEventListener("error", done(false), { once: true });
        audio.src = url;
      });
    },
    start() {
      if (phase !== "off") return;
      phase = "playing";
      stopPreview();
      playing = play(choice, flash);
    },
    stop() {
      if (phase === "off") return;
      phase = "off";
      playing?.stop();
      playing = null;
      flashTarget.classList.remove("flashing");
    },
  };
}
