import "./style.css";
import { mountUI, updateUI } from "./ui";
import {
  STEP,
  clamp,
  distance2,
  type Vec2,
  type Vec3,
  type Weapon,
  type RobotModel,
} from "./game/config";
import type { RangeId } from "./game/ranges";
import { RangeAudio } from "./audio/audio";

const { canvas, dialog } = mountUI();
const audio = new RangeAudio();

async function start() {
  const [{ Simulation }, { RangeScene }] = await Promise.all([
    import("./game/simulation"),
    import("./render/scene"),
  ]);
  let fourthModel: RobotModel = "sniper";
  try {
    const saved = JSON.parse(localStorage.getItem("amortization2.settings.v1") ?? "{}");
    if (["sniper", "minigunner", "assault"].includes(saved.fourthModel)) fourthModel = saved.fourthModel;
  } catch { /* Optional local preferences. */ }
  const sim = await Simulation.create("proving", fourthModel);
  const scene = await RangeScene.create(canvas, sim);
  let paused = true,
    entered = false,
    last = performance.now(),
    accumulator = 0,
    uiTime = 0;
  let pointer = { x: 0, y: 0, inside: false },
    ground: Vec3 = { x: -14, y: 0, z: -7 };
  let middleDrag: { x: number; y: number } | null = null;
  let sniperPointer: { x: number; y: number } | null = null;
  let capturePending = false,
    sightCaptured = false;
  let selectionDrag: {
    x: number;
    y: number;
    actor?: number;
    dragged: boolean;
  } | null = null;
  let moveDrag: { queued: boolean; lastGoal: Vec2; lastTime: number } | null =
    null;
  const selectionBox = document.getElementById("selection-box")!;
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
          invertX: scene.scope.invertX,
          invertY: scene.scope.invertY,
          fourthModel: sim.fourthModel,
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
    if (typeof settings.invertX === "boolean")
      scene.scope.invertX = settings.invertX;
    if (typeof settings.invertY === "boolean")
      scene.scope.invertY = settings.invertY;
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
  for (const [id, axis] of [
    ["invert-x", "invertX"],
    ["invert-y", "invertY"],
  ] as const) {
    const input = document.getElementById(id) as HTMLInputElement;
    input.checked = scene.scope[axis];
    input.addEventListener("change", () => {
      scene.scope[axis] = input.checked;
      saveSettings();
    });
  }

  function pause(title = "Range paused") {
    paused = true;
    exitSniping();
    sim.release();
    audio.stop();
    keys.clear();
    cancelDrags();
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
    exitSniping();
    cancelDrags();
    keys.clear();
    sim.reset();
    pointer.inside = false;
    scene.resetDynamic();
    scene.resetCamera();
    scene.updateAim(ground, false);
    audio.stop();
    accumulator = 0;
    toast(sim.arena ? "Arena restarted. Squad restored; first wave incoming." : "Range reset. Targets and supplies restored.");
    updateUI(sim, audio);
  }
  function chooseWeapon(weapon: Weapon) {
    if (!sim.chooseWeapon(weapon)) {
      toast(
        weapon === "rifle"
          ? "Select NEEDLE (4) to use the sniper rifle."
          : weapon === "pistol"
            ? "Select NEEDLE (4) to use its pistol."
            : weapon === "grenade"
              ? "Assault robots carry grenades. Specialists do not."
              : weapon === "minigun" ? "Choose the twin-minigun squad, then select ROOK (2) or SPINDLE (4)."
              : "Select an assault robot to use the machine gun.",
      );
      return;
    }
    audio.stop();
    updateUI(sim, audio);
    canvas.focus();
  }
  function switchRange(range: RangeId) {
    exitSniping();
    cancelDrags();
    keys.clear();
    pointer.inside = false;
    audio.stop();
    sim.reset(range);
    scene.resetEnvironment();
    scene.resetDynamic();
    scene.resetCamera();
    accumulator = 0;
    document.getElementById("menu-title")!.textContent =
      range === "arena" ? "Endless arena" : range === "long" ? "Long range" : "Proving ground";
    document.getElementById("menu-intro")!.textContent =
      range === "arena"
        ? "Survive incoming robot squads. Watch the marked entrances, move around cover, and interrupt enemy bursts. Survivors are repaired and rearmed between waves; disabled robots stay down. Shift+R restarts."
        : range === "long"
        ? "NEEDLE trades armour for a powerful rifle. Sight a target and press Space to enter braced first-person sniping. Aim above the raised platforms before firing."
        : "Test sustained fire, move heavy targets, and throw grenades over cover.";
    updateUI(sim, audio);
    if (!paused) canvas.focus();
  }
  for (const id of ["range-select", "menu-range"])
    document
      .getElementById(id)!
      .addEventListener("change", (e) =>
        switchRange((e.target as HTMLSelectElement).value as RangeId),
      );
  for (const id of ["loadout-select", "menu-loadout"])
    document.getElementById(id)!.addEventListener("change", (e) => {
      const model = (e.target as HTMLSelectElement).value as RobotModel;
      if (!["sniper", "minigunner", "assault"].includes(model) || model === sim.fourthModel) return;
      exitSniping();
      cancelDrags();
      keys.clear();
      audio.stop();
      sim.reset(sim.range, model);
      scene.resetDynamic();
      scene.resetCamera();
      pointer.inside = false;
      accumulator = 0;
      updateUI(sim, audio);
      saveSettings();
      toast("Squad changed. Combat floor restarted.");
      if (!paused) canvas.focus();
    });
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-sight]",
  ))
    button.addEventListener("click", () => {
      const target = sim.actors.filter((a) => a.kind === "precision")[
        Number(button.dataset.sight) / 30 - 1
      ];
      if (!target || sim.squad[3].dead || sim.fourthModel !== "sniper") return;
      const wasSniping = sim.sniping;
      sim.select(4);
      sim.chooseWeapon("rifle");
      sim.aim = {
        ...target.body.translation(),
        y: target.body.translation().y + 0.25,
      };
      if (wasSniping) {
        scene.scope.resetSight();
        sim.toggleSniping();
        captureSniping();
      }
      pointer.inside = false;
      if (!wasSniping) scene.center(true);
      updateUI(sim, audio);
      canvas.focus();
    });
  document.getElementById("resume")!.addEventListener("click", () => {
    void resume();
  });
  document
    .getElementById("help")!
    .addEventListener("click", () => pause("Controls & settings"));
  document.getElementById("reset")!.addEventListener("click", reset);
  document.getElementById("arena-restart")!.addEventListener("click", () => { reset(); canvas.focus(); });
  document.getElementById("sound")!.addEventListener("click", async () => {
    try {
      await audio.unlock();
      audio.setMuted(!audio.muted);
      saveSettings();
    } catch {
      audio.failed = true;
      toast(
        "Audio is unavailable in this browser. The range is still playable.",
      );
    }
    updateUI(sim, audio);
  });
  document
    .getElementById("gun")!
    .addEventListener("click", () => chooseWeapon(sim.nextCloseWeapon));
  document
    .getElementById("rifle")!
    .addEventListener("click", () => chooseWeapon("rifle"));
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
  const aimAtPointer = (groundOnly = false) => {
    if (sim.sniping) {
      scene.scope.aim(sim);
      return null;
    }
    const result = scene.pick(
      pointer.x,
      pointer.y,
      sim.weapon === "grenade" || groundOnly,
    );
    if (result) {
      ground = result.ground;
      sim.aim = result.aim;
    }
    return result;
  };
  function cancelDrags() {
    selectionDrag = null;
    moveDrag = null;
    scene.cancelMovePreview();
    middleDrag = null;
    selectionBox.hidden = true;
  }
  function exitSniping() {
    sim.endSniping();
    scene.scope.resetSight();
    pointer.inside = false;
    sniperPointer = null;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  }
  function captureFailed() {
    capturePending = false;
    if (sim.sniping)
      toast("Move the mouse to aim. Hold at an edge to keep turning.");
  }
  function captureSniping() {
    if (
      !sim.sniping ||
      paused ||
      capturePending ||
      document.pointerLockElement === canvas
    )
      return;
    if (typeof canvas.requestPointerLock !== "function") {
      captureFailed();
      return;
    }
    capturePending = true;
    try {
      // Space/click provides user activation. Legacy browsers return void;
      // modern browsers also reject a promise when capture is unavailable.
      void canvas.requestPointerLock()?.catch(() => {
        capturePending = false;
      });
    } catch {
      captureFailed();
    }
  }
  document.addEventListener("pointerlockerror", captureFailed);
  document.addEventListener("pointerlockchange", () => {
    const wasCaptured = sightCaptured;
    sightCaptured = document.pointerLockElement === canvas;
    capturePending = false;
    sniperPointer = null;
    if (sightCaptured && (!sim.sniping || paused)) document.exitPointerLock();
    else if (!sightCaptured && wasCaptured) exitSniping();
  });
  function updatePointer(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer = {
      x: clamp(e.clientX, rect.left, rect.right),
      y: clamp(e.clientY, rect.top, rect.bottom),
      inside:
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom,
    };
  }
  function updateMove(force = false) {
    if (!moveDrag) return;
    // Replan at most 12.5 times per second, preserving momentum between orders.
    if (
      !force &&
      (sim.time - moveDrag.lastTime < 0.08 ||
        distance2(ground, moveDrag.lastGoal) < 0.15)
    )
      return;
    if (force && distance2(ground, moveDrag.lastGoal) < 0.01) return;
    if (moveDrag.queued) scene.previewMove(sim.moveDestinations(ground));
    else {
      sim.move(ground);
      scene.markMove();
    }
    moveDrag.lastGoal = { x: ground.x, z: ground.z };
    moveDrag.lastTime = sim.time;
  }
  // Mouse events retain per-button transitions when firing and steering together.
  window.addEventListener("mousemove", (e) => {
    if (paused) return;
    if (sim.sniping) {
      if (document.pointerLockElement === canvas) {
        scene.scope.look(e.movementX, e.movementY, sim, canvas.clientHeight);
      } else {
        updatePointer(e);
        if (pointer.inside && sniperPointer)
          scene.scope.look(
            e.clientX - sniperPointer.x,
            e.clientY - sniperPointer.y,
            sim,
            canvas.clientHeight,
          );
        sniperPointer = pointer.inside
          ? { x: e.clientX, y: e.clientY }
          : null;
        if (!pointer.inside) sim.trigger = false;
      }
      return;
    }
    updatePointer(e);
    if (!(e.buttons & 1)) {
      sim.trigger = false;
      selectionDrag = null;
      selectionBox.hidden = true;
    }
    if (!(e.buttons & 2)) {
      moveDrag = null;
      scene.cancelMovePreview();
    }
    if (!(e.buttons & 4)) middleDrag = null;
    if (middleDrag) {
      scene.pan(
        (middleDrag.x - e.clientX) * 0.03,
        (middleDrag.y - e.clientY) * 0.04,
      );
      middleDrag = { x: e.clientX, y: e.clientY };
    }
    if (!pointer.inside) sim.trigger = false;
    if (selectionDrag) {
      const rect = canvas.getBoundingClientRect();
      selectionDrag.dragged ||=
        Math.hypot(pointer.x - selectionDrag.x, pointer.y - selectionDrag.y) >=
        4;
      selectionBox.hidden = !selectionDrag.dragged;
      selectionBox.style.left = `${Math.min(selectionDrag.x, pointer.x) - rect.left}px`;
      selectionBox.style.top = `${Math.min(selectionDrag.y, pointer.y) - rect.top}px`;
      selectionBox.style.width = `${Math.abs(pointer.x - selectionDrag.x)}px`;
      selectionBox.style.height = `${Math.abs(pointer.y - selectionDrag.y)}px`;
    }
    aimAtPointer(!!moveDrag || !!selectionDrag);
    if (moveDrag?.queued) updateMove();
  });
  canvas.addEventListener("mousedown", (e) => {
    if (paused) return;
    e.preventDefault();
    canvas.focus();
    if (sim.sniping) {
      if (e.button === 2) exitSniping();
      else if (e.button === 0) {
        captureSniping();
        scene.scope.aim(sim);
        sim.trigger = true;
      }
      return;
    }
    updatePointer(e);
    const picked = aimAtPointer(e.button === 2 || e.shiftKey);
    if (e.button === 2) {
      selectionDrag = null;
      selectionBox.hidden = true;
      moveDrag = {
        queued: e.shiftKey,
        lastGoal: { x: ground.x, z: ground.z },
        lastTime: sim.time,
      };
      if (e.shiftKey) scene.previewMove(sim.moveDestinations(ground));
      else {
        sim.move(ground);
        scene.markMove();
      }
    } else if (e.button === 1) middleDrag = { x: e.clientX, y: e.clientY };
    else if (e.button === 0) {
      if (e.shiftKey) {
        moveDrag = null;
        scene.cancelMovePreview();
        sim.release();
        selectionDrag = {
          x: pointer.x,
          y: pointer.y,
          actor: picked?.actor,
          dragged: false,
        };
      } else if (sim.weapon === "grenade") {
        if (sim.throwGrenade(ground))
          toast("Grenade away. Keep clear of the blast.");
        else if (sim.active.length)
          toast(
            `Grenades rearming. Ready in ${sim.grenadeCooldown.toFixed(1)} s.`,
          );
        updateUI(sim, audio);
      } else if (picked?.actor && picked.actor <= 4 && !e.ctrlKey)
        sim.select(picked.actor, e.shiftKey);
      else sim.trigger = true;
    }
  });
  window.addEventListener("mouseup", (e) => {
    if (paused) return;
    if (sim.sniping) {
      if (e.button === 0) sim.trigger = false;
      if (e.button === 1) middleDrag = null;
      return;
    }
    updatePointer(e);
    if (e.button === 0) {
      sim.trigger = false;
      if (selectionDrag?.dragged) {
        const left = Math.min(selectionDrag.x, pointer.x),
          right = Math.max(selectionDrag.x, pointer.x);
        const top = Math.min(selectionDrag.y, pointer.y),
          bottom = Math.max(selectionDrag.y, pointer.y);
        sim.selectGroup(
          sim.squad
            .filter((a) => {
              const p = scene.project(a.body.translation());
              return p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
            })
            .map((a) => a.id),
        );
      } else if (selectionDrag?.actor && selectionDrag.actor <= 4) {
        sim.select(selectionDrag.actor, true);
      }
      selectionDrag = null;
      selectionBox.hidden = true;
      updateUI(sim, audio);
    }
    if (e.button === 2 && moveDrag) {
      aimAtPointer(true);
      if (moveDrag.queued) {
        sim.move(ground, true);
        scene.markMove();
      } else updateMove(true);
      moveDrag = null;
    }
    if (e.button === 1) middleDrag = null;
  });
  canvas.addEventListener("pointercancel", () => {
    exitSniping();
    cancelDrags();
    sim.release();
  });
  const isForm = (target: EventTarget | null) =>
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement;
  window.addEventListener("keydown", (e) => {
    if (isForm(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "Escape" && !dialog.open) {
      e.preventDefault();
      if (sim.sniping) exitSniping();
      else pause();
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
        "KeyE",
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
    else if (e.code === "KeyQ") chooseWeapon(sim.nextCloseWeapon);
    else if (e.code === "KeyE") chooseWeapon("rifle");
    else if (e.code === "KeyR") {
      if (e.shiftKey) reset();
      else sim.reloadSelected();
    } else if (e.code === "Space") {
      if (sim.weapon === "rifle") {
        cancelDrags();
        if (sim.sniping) exitSniping();
        else if (sim.toggleSniping()) {
          scene.scope.resetSight();
          sniperPointer = null;
          pointer.inside = false;
          scene.scope.aim(sim);
          captureSniping();
        }
        updateUI(sim, audio);
      } else sim.setBrace(true);
    } else if (e.code === "KeyF" && !sim.sniping) scene.center();
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
    if (e.code === "Space" && sim.weapon !== "rifle") sim.setBrace(false);
  });

  // Read-only state plus deliberate development controls, useful for bug reports and authored drills.
  Object.assign(window, {
    amortization2: {
      inspect: () => ({
        ...sim.inspect(),
        paused,
        audio: audio.inspect(),
        scope: scene.scope.inspect(),
        aiming: scene.inspectAim(),
        pointerCaptured: document.pointerLockElement === canvas,
        camera: {
          ...scene.inspectCamera(),
          x: scene.listenerPosition.x,
          y: scene.listenerPosition.y,
          z: scene.listenerPosition.z,
        },
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
            range: sim.range,
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
      if (!sim.sniping) {
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        const panSpeed = delta * 13;
        if (keys.has("KeyA")) scene.pan(-panSpeed, 0);
        if (keys.has("KeyD")) scene.pan(panSpeed, 0);
        if (keys.has("KeyW")) scene.pan(0, -panSpeed);
        if (keys.has("KeyS")) scene.pan(0, panSpeed);
        if (pointer.inside && (sim.weapon !== "rifle" || moveDrag))
          aimAtPointer(!!moveDrag);
        updateMove();
      } else {
        if (
          !capturePending &&
          document.pointerLockElement !== canvas &&
          pointer.inside
        ) {
          const rect = canvas.getBoundingClientRect();
          // Keep turning at the edges if the browser cannot capture the mouse.
          const edge = (position: number, size: number) => {
            const n = (position / size) * 2 - 1;
            return Math.sign(n) * Math.max(0, (Math.abs(n) - 0.8) / 0.2);
          };
          scene.scope.look(
            edge(pointer.x - rect.left, rect.width) * rect.height * delta * 0.8,
            edge(pointer.y - rect.top, rect.height) * rect.height * delta * 0.8,
            sim,
            rect.height,
          );
        }
        scene.scope.aim(sim);
      }
      accumulator += delta;
      let steps = 0;
      while (accumulator >= STEP && steps < 6) {
        sim.step();
        accumulator -= STEP;
        steps++;
      }
      if (steps === 6) accumulator = Math.min(accumulator, STEP);
      scene.updateAim(ground, !sim.sniping && pointer.inside && !selectionDrag);
    } else scene.updateAim(ground, false);
    audio.setListener(scene.listenerPosition, scene.listenerRight);
    for (const event of sim.events.splice(0)) {
      scene.event(event);
      audio.event(event);
      if (event.type === "drill" || event.type === "wave") toast(event.message);
      if (event.type === "throw" && sim.actors.find((a) => a.id === event.actor)?.kind === "enemy")
        toast("Incoming grenade. Move or take cover.");
      if (event.type === "explosion")
        toast(
          event.team === "enemy" ? "Incoming grenade detonated."
          : event.affected
            ? `Blast hit ${event.affected} target${event.affected === 1 ? "" : "s"}.`
            : "Blast contained. Try a different landing point.",
        );
    }
    audio.update(sim, paused);
    scene.render(
      paused ? 1 : accumulator / STEP,
      paused ? 0 : delta,
      sim.time,
      paused,
    );
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
