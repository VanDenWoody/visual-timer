// Remembers the chosen sound and volume (localStorage) and the uploaded audio file
// (IndexedDB: localStorage only holds strings and about 5 MB). Both stay in this
// browser profile only. When storage is blocked, the choice lasts until reload.

const CHOICE_KEY = "visual-timer.sound";
const VOLUME_KEY = "visual-timer.volume";
const DB_NAME = "visual-timer";
const STORE = "files";
const CUSTOM_KEY = "custom";

export function loadChoice() {
  try {
    return localStorage.getItem(CHOICE_KEY);
  } catch {
    return null;
  }
}

export function saveChoice(id) {
  try {
    localStorage.setItem(CHOICE_KEY, id);
  } catch {
    // Storage blocked: the choice is simply not remembered.
  }
}

export function loadVolume() {
  try {
    return localStorage.getItem(VOLUME_KEY);
  } catch {
    return null;
  }
}

export function saveVolume(volume) {
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // Storage blocked: the volume is simply not remembered.
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, action) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// Resolves to { name, blob } or null.
export async function loadCustom() {
  try {
    return (await run("readonly", (store) => store.get(CUSTOM_KEY))) ?? null;
  } catch {
    return null;
  }
}

// A File is a Blob, but storing a plain Blob avoids keeping a file path around.
export function saveCustom(file) {
  const blob = new Blob([file], { type: file.type });
  return run("readwrite", (store) => store.put({ name: file.name, blob }, CUSTOM_KEY));
}

export function removeCustom() {
  return run("readwrite", (store) => store.delete(CUSTOM_KEY));
}
