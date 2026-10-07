# Visual Timer

A minimal visual countdown timer for the desktop. Drag the dial to set 1–60
minutes (default 40), click the centre to start. A red sector shrinks as time
passes. At zero the alarm plays once, a dark red sector counts the overtime and
the window flashes until you click the centre.

A single-page PWA with no build step and no dependencies. Use it online at
<https://vandenwoody.github.io/visual-timer/>, or run it locally. It works
offline once installed.

## Alarm sound

Click **♪** in the top-left corner to choose the alarm sound. The default is
three beeps.

- **Volume:** the slider at the top of the panel sets the volume for every
  sound, including your own file. Letting go of the slider plays the chosen
  sound at the new volume. At 0% the alarm is silent and only flashes.
- **Your own sound:** below the volume slider, click **Choose file…** and pick
  an audio file (mp3, ogg, wav or m4a). The file is stored in this browser
  (IndexedDB) and is not uploaded anywhere. It survives a reload and works
  offline, but it is not shared with other browsers or devices, and clearing the
  site data removes it. **Replace file…** swaps it, **Remove** deletes it and
  switches back to the beeps.
- **Built-in sounds:** 25 tones in five groups (simple tones, bells, imitated
  instruments, melodies, electronic). The browser synthesises them live with the
  Web Audio API, so there are no audio files and no licences involved, and they
  work offline. Choosing a sound plays it once; **▶** plays it again.

The alarm plays the sound once, then the window flashes until you click the
centre. A long file plays to the end before the flashing starts; clicking the
centre stops it at any moment. If the stored file cannot be played, the beeps
play instead, so the timer never ends silently.

## Run locally

    git clone https://github.com/VanDenWoody/visual-timer.git
    cd visual-timer
    python -m http.server 8000

Then open <http://localhost:8000>. Do **not** open `index.html` from the
filesystem: ES module imports and service workers both require a real origin.

## Install as a desktop app

In Chrome or Edge, open the online address or <http://localhost:8000> and
choose **Install app** (address bar icon, or ⋮ → Cast, save, and share →
Install page as app). The installed window works offline, so an app installed
from localhost also works without the local server. If it still shows a title bar, click
the chevron in the title bar to switch to the compact overlay.

## Always on top (Picture-in-Picture)

Click **⧉** in the top-left corner to move the dial into a Picture-in-Picture
window. Chrome keeps that window on top of everything else and lets you shrink
it to 256 × 94 px. The dark bar at its top is drawn by Chrome (it shows the
site's address) and cannot be styled. Close the Picture-in-Picture window to
bring the dial back.

The timer itself runs in the main window: minimise it, but do not close it,
because closing it also closes the Picture-in-Picture window. The ⧉ button only
appears in browsers that support Document Picture-in-Picture (Chrome and Edge).

## Controls

| State    | Drag the face           | Click the centre                                                                    |
| -------- | ----------------------- | ----------------------------------------------------------------------------------- |
| Idle     | Set minutes             | Start                                                                               |
| Running  | —                       | The centre is hidden: click anywhere on the dial, or press Space or Enter, to pause |
| Paused   | Set new minutes (reset) | Resume                                                                              |
| Overtime | Set new minutes         | Stop and reset                                                                      |

While the timer runs or is paused, the ↺ button in the top-right corner
restarts it from the full planned minutes.

## Test

    npm test

Runs `node --test` over the pure modules `dial.js`, `timer.js` and
`sounds.js`. No `npm install` required. The sound tests use a stand-in for the
Web Audio API: they check that every sound plays without error and falls silent
within its stated duration, not how it sounds.

## Updating

After changing any cached file, bump `CACHE_NAME` in `sw.js` so the installed
app picks up the change. A new file must also be added to `ASSETS` in `sw.js`,
or the installed app cannot load it offline. A push to `main` publishes
the online version through GitHub Pages within about a minute.

- An app installed from localhost needs the local server running when the installed app is next opened, so the new service worker can fetch the files.
- The first launch after a bump still shows the old version while the new service worker installs in the background. The new version appears on the next launch.
