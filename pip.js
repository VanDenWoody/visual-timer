// Moves the timer into a Document Picture-in-Picture window, which Chrome keeps
// on top of other windows, and back again when that window closes.

export function setupPip({ button, stage, onMove }) {
  if (!("documentPictureInPicture" in window)) {
    button.hidden = true;
    return;
  }

  button.addEventListener("click", async () => {
    if (documentPictureInPicture.window || button.disabled) return;
    button.disabled = true; // A second click while the window opens would request another.
    try {
      const pip = await documentPictureInPicture.requestWindow({ width: 260, height: 260 });
      pip.document.title = document.title;
      await loadStyles(pip.document);
      if (documentPictureInPicture.window !== pip) return; // Closed while the styles loaded.
      moveTo(pip.document.body);
      pip.addEventListener("pagehide", () => moveTo(document.body));
    } catch {
      // Refused by the browser: the timer simply stays in the main window.
    } finally {
      button.disabled = false;
    }
  });

  // Wait for the stylesheet so the dial never shows unstyled; give up after 500 ms.
  function loadStyles(doc) {
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("./styles.css", location.href).href;
    const loaded = new Promise((resolve) => {
      link.onload = link.onerror = resolve;
      setTimeout(resolve, 500);
    });
    doc.head.append(link);
    return loaded;
  }

  function moveTo(body) {
    body.append(stage);
    document.body.classList.toggle("popped-out", body !== document.body);
    onMove();
  }
}
