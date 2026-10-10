/** This small module loads before the engine, so failures and slow downloads stay visible. */
const panel = document.getElementById("loading") as HTMLDialogElement;
const title = document.getElementById("loading-title")!;
const status = document.getElementById("loading-status")!;
const progress = document.getElementById("loading-progress") as HTMLProgressElement;
const retry = document.getElementById("loading-retry") as HTMLButtonElement;
// Preparation owns this modal's lifetime; Escape must not expose an unfinished game.
panel.addEventListener("cancel", event => event.preventDefault());
retry.addEventListener("click", () => location.reload());

export const loading = {
  async show(message: string) {
    title.textContent = "Preparing district";
    status.textContent = message;
    progress.hidden = false;
    retry.hidden = true;
    if (panel.open && !panel.matches(":modal")) panel.close();
    if (!panel.open) panel.showModal();
    // Give the browser a paint before synchronous physics/geometry construction.
    await new Promise<void>(resolve => {
      // Background tabs can suspend animation frames; do not stall preparation there.
      const fallback = setTimeout(resolve, 100);
      requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(fallback); resolve(); }));
    });
  },
  hide() { panel.close(); },
  fail() {
    title.textContent = "Unable to start";
    status.textContent = "Check your connection and reload. The game needs WebGL 2 and WebAssembly.";
    progress.hidden = true;
    retry.hidden = false;
    if (!panel.open) panel.showModal();
    retry.focus();
  },
};
