import "./style.css";
import { mountUI, updateUI } from "./ui";
import { STEP, type Vec3 } from "./game/config";
import { RangeAudio } from "./audio/audio";

const { canvas, dialog } = mountUI();
const audio = new RangeAudio();

async function start() {
  const [{ Simulation }, { RangeScene }] = await Promise.all([
    import("./game/simulation"),
    import("./render/scene"),
  ]);
  const sim = await Simulation.create();
  const scene = await RangeScene.create(canvas, sim);
  let paused = true,
    entered = false,
    last = performance.now(),
    accumulator = 0,
    uiTime = 0;
  let pointer = { x: 0, y: 0, inside: false },
    ground: Vec3 = { x: -14, y: 0, z: -7 };
  let middleDrag: { x: number; y: number } | null = null;
  const keys = new Set<string>();
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const toast = (message: string) => {
    const element = document.getElementById("toast")!;
    element.textContent = message;
    element.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove("visible"), 3500);
  };
  function saveSettings() {
    try {
      localStorage.setItem(
        "amortization2.settings.v1",
        JSON.stringify({
          muted: audio.muted,
          volume: audio.volume,
          reducedMotion: scene.reducedMotion,
        }),
      );
    } catch {
      /* Storage is optional in the range. */
    }
  }
  try {
    const settings = JSON.parse(
      localStorage.getItem("amortization2.settings.v1") ?? "{}",
    );
    if (typeof settings.muted === "boolean") audio.setMuted(settings.muted);
    if (typeof settings.volume === "number") audio.setVolume(settings.volume);
    scene.reducedMotion =
      typeof settings.reducedMotion === "boolean"
        ? settings.reducedMotion
        : matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    scene.reducedMotion = matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }
  const volume = document.querySelector<HTMLInputElement>("#volume")!;
  volume.value = String(Math.round(audio.volume * 100));
  const motion = document.querySelector<HTMLInputElement>("#motion")!;
  motion.checked = scene.reducedMotion;
  volume.addEventListener("input", () => {
    audio.setVolume(Number(volume.value) / 100);
    saveSettings();
  });
  motion.addEventListener("change", () => {
    scene.reducedMotion = motion.checked;
    saveSettings();
  });

  function pause(title = "Range paused") {
    paused = true;
    sim.release();
    audio.stop();
    keys.clear();
    middleDrag = null;
    accumulator = 0;
    document.getElementById("menu-title")!.textContent = title;
    document.getElementById("resume")!.innerHTML =
      "RESUME RANGE <span>↗</span>";
    if (!dialog.open) dialog.showModal();
  }
  async function resume() {
    const button = document.querySelector<HTMLButtonElement>("#resume")!;
    button.disabled = true;
    try {
      await audio.unlock();
    } catch (error) {
      console.warn("Audio context unavailable", error);
      audio.failed = true;
    }
    button.disabled = false;
    dialog.close();
    entered = true;
    paused = false;
    last = performance.now();
    accumulator = 0;
    canvas.focus();
  }
  function reset() {
    sim.reset();
    scene.resetDynamic();
    scene.resetCamera();
    scene.updateAim(ground, false);
    audio.stop();
    accumulator = 0;
    toast("Range reset. Targets and supplies restored.");
    updateUI(sim, audio);
  }
  function chooseWeapon(weapon: "gun" | "grenade") {
    sim.weapon = weapon;
    sim.trigger = false;
    audio.stop();
    updateUI(sim, audio);
    canvas.focus();
  }
  document.getElementById("resume")!.addEventListener("click", () => {
    void resume();
  });
  document
    .getElementById("help")!
    .addEventListener("click", () => pause("Controls & settings"));
  document.getElementById("reset")!.addEventListener("click", reset);
  document.getElementById("sound")!.addEventListener("click", async () => {
    try {
      await audio.unlock();
      audio.setMuted(!audio.muted);
      saveSettings();
    } catch {
      audio.failed = true;
      toast("Audio is unavailable in this browser. The range is still playable.");
    }
    updateUI(sim, audio);
  });
  document
    .getElementById("gun")!
    .addEventListener("click", () => chooseWeapon("gun"));
  document
    .getElementById("grenade")!
    .addEventListener("click", () => chooseWeapon("grenade"));
  document.getElementById("all")!.addEventListener("click", () => {
    sim.select(5);
    canvas.focus();
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-unit]",
  ))
    button.addEventListener("click", (event) => {
      sim.select(Number(button.dataset.unit), event.shiftKey);
      canvas.focus();
    });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (entered) void resume();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && entered) pause();
  });
  window.addEventListener("blur", () => {
    if (entered && !paused) pause();
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (!paused) scene.zoomBy(e.deltaY);
    },
    { passive: false },
  );
  const aimAtPointer = () => {
    const result = scene.pick(pointer.x, pointer.y, sim.weapon === "grenade");
    if (result) {
      ground = result.ground;
      sim.aim = result.aim;
    }
    return result;
  };
  canvas.addEventListener("pointermove", (e) => {
    pointer = { x: e.clientX, y: e.clientY, inside: true };
    if (middleDrag) {
      scene.pan(
        (middleDrag.x - e.clientX) * 0.03,
        (middleDrag.y - e.clientY) * 0.04,
      );
      middleDrag = { x: e.clientX, y: e.clientY };
    }
    if (!paused) aimAtPointer();
  });
  canvas.addEventListener("pointerleave", () => {
    pointer.inside = false;
    sim.trigger = false;
    middleDrag = null;
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (paused) return;
    e.preventDefault();
    canvas.focus();
    pointer = { x: e.clientX, y: e.clientY, inside: true };
    const picked = aimAtPointer();
    if (e.button === 2) {
      sim.move(ground, e.shiftKey);
      scene.markDestination(ground);
    } else if (e.button === 1) middleDrag = { x: e.clientX, y: e.clientY };
    else if (e.button === 0) {
      if (sim.weapon === "grenade") {
        if (sim.throwGrenade(ground))
          toast("Grenade away. Keep clear of the blast.");
      } else if (picked?.actor && picked.actor <= 4 && !e.ctrlKey)
        sim.select(picked.actor, e.shiftKey);
      else sim.trigger = true;
    }
  });
  window.addEventListener("pointerup", (e) => {
    if (e.button === 0) sim.trigger = false;
    if (e.button === 1) middleDrag = null;
  });
  const isForm = (target: EventTarget | null) =>
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement;
  window.addEventListener("keydown", (e) => {
    if (isForm(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "Escape" && !dialog.open) {
      e.preventDefault();
      pause();
      return;
    }
    if (paused) return;
    if (
      [
        "Space",
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "KeyG",
        "KeyQ",
        "KeyR",
        "KeyF",
        "Digit1",
        "Digit2",
        "Digit3",
        "Digit4",
        "Digit5",
      ].includes(e.code)
    )
      e.preventDefault();
    keys.add(e.code);
    if (e.repeat) return;
    if (/^Digit[1-5]$/.test(e.code))
      sim.select(Number(e.code.at(-1)), e.shiftKey);
    else if (e.code === "KeyG") chooseWeapon("grenade");
    else if (e.code === "KeyQ") chooseWeapon("gun");
    else if (e.code === "KeyR") {
      if (e.shiftKey) reset();
      else sim.reloadSelected();
    } else if (e.code === "Space") sim.setBrace(true);
    else if (e.code === "KeyF") scene.center();
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
    if (e.code === "Space") sim.setBrace(false);
  });

  // Read-only state plus deliberate development controls, useful for bug reports and authored drills.
  Object.assign(window, {
    amortization2: {
      inspect: () => ({
        ...sim.inspect(),
        paused,
        audio: audio.inspect(),
        render: {
          calls: scene.renderer.info.render.calls,
          triangles: scene.renderer.info.render.triangles,
        },
      }),
      project: (p: Vec3) => scene.project(p),
      reset,
      exportReport: () =>
        JSON.stringify(
          {
            version: "0.1.0",
            range: "proving-ground",
            state: sim.inspect(),
            audio: audio.inspect(),
          },
          null,
          2,
        ),
    },
  });
  console.info(
    "Welcome to Amortization II. window.amortization2: inspect(), project({x,y,z}), reset(), exportReport().",
  );
  document.getElementById("loading")!.classList.add("hidden");
  updateUI(sim, audio);
  dialog.showModal();
  function frame(now: number) {
    const delta = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!paused) {
      const panSpeed = delta * 13;
      if (keys.has("KeyA")) scene.pan(-panSpeed, 0);
      if (keys.has("KeyD")) scene.pan(panSpeed, 0);
      if (keys.has("KeyW")) scene.pan(0, -panSpeed);
      if (keys.has("KeyS")) scene.pan(0, panSpeed);
      if (pointer.inside) aimAtPointer();
      accumulator += delta;
      let steps = 0;
      while (accumulator >= STEP && steps < 6) {
        sim.step();
        accumulator -= STEP;
        steps++;
      }
      if (steps === 6) accumulator = Math.min(accumulator, STEP);
      scene.updateAim(ground, pointer.inside);
    } else scene.updateAim(ground, false);
    for (const event of sim.events.splice(0)) {
      scene.event(event);
      audio.event(event);
      if (event.type === "drill") toast(event.message);
      if (event.type === "explosion")
        toast(
          event.affected
            ? `Blast hit ${event.affected} target${event.affected === 1 ? "" : "s"}.`
            : "Blast contained. Try a different landing point.",
        );
    }
    audio.update(sim, paused);
    scene.render(paused ? 1 : accumulator / STEP, paused ? 0 : delta, sim.time);
    uiTime += delta;
    if (uiTime > 0.08) {
      updateUI(sim, audio);
      uiTime = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

start().catch((error) => {
  console.error(error);
  document.getElementById("loading")!.textContent =
    "The range could not start. This game needs WebGL 2 and WebAssembly. Reload to retry.";
});
