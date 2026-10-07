// The ♪ panel: choose one of the synthesised sounds or upload your own file.
// Choosing a sound plays it once, so you hear what the alarm will sound like.

import { CUSTOM_SOUND, SOUNDS, clampVolume, resolveSound } from "./sounds.js";
import {
  loadChoice, loadCustom, loadVolume, removeCustom, saveChoice, saveCustom, saveVolume,
} from "./sound-store.js";

export async function setupSoundPicker({ button, dialog, alarm }) {
  const list = dialog.querySelector("#sound-list");
  const customRadio = dialog.querySelector("#custom-radio");
  const customRow = dialog.querySelector("#custom-row");
  const customName = dialog.querySelector("#custom-name");
  const customNone = dialog.querySelector("#custom-none");
  const fileInput = dialog.querySelector("#file-input");
  const uploadButton = dialog.querySelector("#upload");
  const removeButton = dialog.querySelector("#remove-custom");
  const message = dialog.querySelector("#custom-message");
  const volumeSlider = dialog.querySelector("#volume");
  const volumeValue = dialog.querySelector("#volume-value");

  // Set before the await below, so an alarm in the first moments has the right volume.
  const volume = clampVolume(loadVolume());
  alarm.setVolume(volume);
  volumeSlider.value = String(Math.round(volume * 100));
  volumeValue.textContent = `${volumeSlider.value}%`;

  let custom = await loadCustom(); // { name, blob } or null
  let choice = resolveSound(loadChoice(), custom !== null);
  alarm.setSound(choice, choice === CUSTOM_SOUND ? custom.blob : null);

  buildList();
  render();

  function buildList() {
    let group = null;
    for (const sound of SOUNDS) {
      if (sound.group !== group) {
        group = sound.group;
        const heading = document.createElement("h3");
        heading.textContent = group;
        list.append(heading);
      }
      list.append(row(sound.id, sound.name));
    }
  }

  function row(id, name) {
    const div = document.createElement("div");
    div.className = "sound-row";
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "sound";
    radio.value = id;
    label.append(radio, " ", name);
    const play = document.createElement("button");
    play.type = "button";
    play.className = "play";
    play.textContent = "▶";
    play.title = `Play ${name}`;
    play.setAttribute("aria-label", `Play ${name}`);
    play.addEventListener("click", () => preview(id));
    div.append(label, play);
    return div;
  }

  function render() {
    customRow.hidden = custom === null;
    customNone.hidden = custom !== null;
    removeButton.hidden = custom === null;
    uploadButton.textContent = custom ? "Replace file…" : "Choose file…";
    if (custom) customName.textContent = custom.name;
    for (const radio of dialog.querySelectorAll('input[name="sound"]')) radio.checked = radio.value === choice;
  }

  function preview(id) {
    alarm.preview(id, id === CUSTOM_SOUND ? custom?.blob : null);
  }

  function choose(id) {
    choice = id;
    saveChoice(id);
    alarm.setSound(id, id === CUSTOM_SOUND ? custom.blob : null);
    render();
  }

  function say(text) {
    message.textContent = text;
    message.hidden = !text;
  }

  dialog.addEventListener("change", (event) => {
    if (event.target.name !== "sound") return;
    choose(event.target.value);
    preview(event.target.value);
  });
  dialog.querySelector("#custom-play").addEventListener("click", () => preview(CUSTOM_SOUND));

  // Dragging changes a sound that is playing; letting go stores the volume and plays the chosen sound.
  volumeSlider.addEventListener("input", () => {
    volumeValue.textContent = `${volumeSlider.value}%`;
    alarm.setVolume(clampVolume(volumeSlider.value / 100));
  });
  volumeSlider.addEventListener("change", () => {
    const v = clampVolume(volumeSlider.value / 100);
    saveVolume(v);
    preview(choice);
  });

  uploadButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = ""; // Choosing the same file again still fires change.
    if (!file) return;
    say("");
    if (!(await alarm.canPlay(file))) {
      say(`This browser cannot play "${file.name}". Choose an mp3, ogg, wav or m4a file.`);
      return;
    }
    custom = { name: file.name, blob: file };
    try {
      await saveCustom(file);
    } catch {
      say("The file could not be stored in this browser, so it is used until you reload the page.");
    }
    choose(CUSTOM_SOUND);
    preview(CUSTOM_SOUND);
  });

  removeButton.addEventListener("click", async () => {
    say("");
    await removeCustom().catch(() => {});
    custom = null;
    if (choice === CUSTOM_SOUND) choose(resolveSound(null, false));
    else render();
  });

  button.addEventListener("click", () => {
    say("");
    dialog.showModal();
  });
  dialog.querySelector("#sound-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => alarm.stopPreview());
  // A click on the backdrop (outside the panel) closes it.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}
