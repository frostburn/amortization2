import {
  GRENADE_COOLDOWN,
  GRENADE_FUSE,
  SQUAD_NAMES,
  RIFLE,
} from "./game/config";
import type { Simulation } from "./game/simulation";
import type { RangeAudio } from "./audio/audio";

const robotIcon =
  '<svg viewBox="0 0 32 44" aria-hidden="true"><path d="M12 2h8v8h-8zM8 12h16v15H8zM3 13h4v16H3zm22 0h4v16h-4zM9 29h6v13H8zm8 0h6l1 13h-7z" fill="currentColor"/><path d="M14 5h4M12 17h8" stroke="#152023" stroke-width="2"/></svg>';
const gunIcon =
  '<svg viewBox="0 0 100 36" aria-hidden="true"><path d="M5 12h39l5-4h19v5h28v5H65v8H48v-6H29l-5 12h-8l2-14H5z" fill="currentColor"/><path d="M54 25v8h9l-1-8M67 9h11v3" fill="currentColor"/></svg>';
const grenadeIcon =
  '<svg viewBox="0 0 36 44" aria-hidden="true"><path d="M15 5h8v7c7 3 9 9 8 17-1 8-6 12-13 12S6 37 5 29s2-14 9-17z" fill="currentColor"/><path d="M23 5h6l3 18M12 18v18m7-20v22m6-19v16M7 23h22M7 30h22" fill="none" stroke="#152023" stroke-width="1.5"/></svg>';
const rifleIcon =
  '<svg viewBox="0 0 100 36" aria-hidden="true"><path d="M4 15h19l8-5h27v4h39v3H59v6H39l-6 10h-7l3-14H4zM43 6h19v5H43zM46 24h9v9h-9z" fill="currentColor"/></svg>';
const rangeOptions =
  '<option value="proving">PROVING GROUND</option><option value="long">LONG RANGE</option>';

export function mountUI() {
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <header class="topbar">
      <div class="brand"><h1>AMORTIZATION <span>II</span></h1><p>FUTURES CONTRACT</p></div>
      <div class="range-title"><select id="range-select" aria-label="Choose firing range">${rangeOptions}</select></div>
      <nav aria-label="Range controls"><button id="reset" title="Reset the range (Shift+R)">RESET RANGE</button><button id="sound" aria-pressed="false" title="Toggle sound">SOUND ON</button><button id="help" aria-label="Help and settings">?</button></nav>
    </header>
    <main id="field">
      <canvas id="range" tabindex="0" aria-label="3D target practice range. Hold left mouse to fire, shift-drag to select a group, right-drag to steer, G for grenade, E for sniper rifle, Space to brace. Select robots with 1 to 4, or the squad with 5."></canvas><div id="selection-box" aria-hidden="true" hidden></div><div id="scope-label" aria-label="First-person rifle view" hidden></div>
      <aside class="drills panel" aria-label="Range drills">
        <div class="panel-heading">RANGE DRILLS <span id="drill-count">0 / 3</span></div>
        <div class="drill" id="drill-gun"><span class="check"></span><div>Machine gun<span class="detail" id="gun-progress">Clear six orange plates · 0 / 6</span></div></div>
        <div class="drill" id="drill-impulse"><span class="check"></span><div>Displacement<span class="detail" id="impulse-progress">Push a heavy target 2 m · 0.0 m</span></div></div>
        <div class="drill" id="drill-grenade"><span class="check"></span><div>Thrown grenade<span class="detail" id="grenade-progress">Clear the covered bay · 0 / 3</span></div></div>
        <div class="drill" id="drill-rifle" hidden><span class="check"></span><div>Precision rifle<span class="detail" id="rifle-progress">Clear 30, 60 and 90 m targets · 0 / 3</span></div></div>
        <div id="sight-controls" hidden><span class="detail">SIGHT TARGET</span><div>${[30, 60, 90].map((m) => `<button data-sight="${m}" aria-label="Sight the ${m} metre target">${m} m</button>`).join("")}</div></div>
        <p class="range-note" id="range-note">Unlimited range supplies. Reset to go again.</p>
      </aside>
      <aside class="stats panel" aria-label="Shooting statistics"><div><span>HITS</span><strong id="hits">0</strong></div><div><span>SHOTS</span><strong id="shots">0</strong></div><div><span>ACCURACY</span><strong id="accuracy">—</strong></div></aside>
      <div id="toast" role="status" aria-live="polite"></div>
      <div id="mode-hint">MACHINE GUN · HOLD LMB TO FIRE</div>
      <div id="loading">Preparing range…</div>
    </main>
    <footer class="bottom-bar">
      <div class="squad" aria-label="Select robots">${SQUAD_NAMES.map((name, i) => `<button class="unit ${i === 0 ? "selected" : ""} ${i === 3 ? "sniper-unit" : ""}" data-unit="${i + 1}" aria-label="Select ${name}, robot ${i + 1}${i === 3 ? ", light sniper, 64 integrity" : ""}" aria-pressed="${i === 0}"><span class="unit-key">${i + 1}</span>${robotIcon}${i === 3 ? '<span class="unit-role">SNIPER</span>' : ""}<span class="unit-name">${name}</span><span class="integrity"><i></i></span></button>`).join("")}<button id="all" title="Select all robots (5)" aria-label="Select whole squad">ALL<span>5</span></button></div>
      <div class="weapons" aria-label="Choose weapon"><button class="weapon selected" id="gun" aria-pressed="true"><span class="weapon-icon">${gunIcon}</span><span class="weapon-name">MACHINE GUN<small>Q · 14 ROUNDS / SEC</small></span><span class="ammo"><b id="ammo">90</b><span> / 90</span></span><i id="reload-progress" class="reload-progress"></i></button><button class="weapon rifle" id="rifle" aria-pressed="false"><span class="weapon-icon">${rifleIcon}</span><span class="weapon-name">SNIPER RIFLE<small id="rifle-status">E · SPACE TO BRACE</small></span><span class="ammo"><b id="rifle-ammo">${RIFLE.magazine}</b><span> / ${RIFLE.magazine}</span></span><i id="rifle-reload-progress" class="reload-progress"></i></button><button class="weapon grenade" id="grenade" aria-pressed="false"><span class="weapon-icon">${grenadeIcon}</span><span class="weapon-name">GRENADE<small id="grenade-status">G · 2.4 SEC FUSE</small></span></button></div>
      <div class="quick-controls"><span><kbd>LMB</kbd> FIRE</span><span><kbd>RMB</kbd> MOVE</span><span><kbd>SPACE</kbd> BRACE</span><span><kbd>R</kbd> RELOAD</span></div>
    </footer>
    <dialog id="menu"><div class="dialog-inner"><div class="dialog-rule"></div><p class="dialog-location">AMORTIZATION II</p><h2 id="menu-title">Proving ground</h2><p id="menu-intro">Test sustained fire, displacement, and grenades. Or take NEEDLE, a fragile sniper, to the horizontal long range.</p><label class="range-choice">FIRING RANGE <select id="menu-range" aria-label="Choose range before entering">${rangeOptions}</select></label><div class="brief-controls"><p><kbd>LMB</kbd><span>Hold to fire. Grenade clicks rotate through ready robots (${GRENADE_COOLDOWN} s each).</span></p><p><kbd>RMB</kbd><span>Drag to steer selected robots. Shift-click queues a move.</span></p><p><kbd>⇧ + LMB</kbd><span>Drag a box to select a group. Shift-click toggles a robot.</span></p><p><kbd>1–4</kbd><span>Select a robot. <kbd>4</kbd> is NEEDLE. <kbd>5</kbd> selects the squad.</span></p><p><kbd>Q / E / G</kbd><span>Machine gun / sniper rifle / grenade. <kbd>R</kbd> reloads.</span></p><p><kbd>SPACE</kbd><span>Hold to brace; the rifle settles in ${RIFLE.settle} s. Unbraced shots kick hard.</span></p><p><kbd>WASD</kbd><span>Pan. Wheel zooms. <kbd>F</kbd> centres the robot. At close zoom, aim inside the rifle-view bubble.</span></p></div><div class="settings"><label>Volume <input id="volume" type="range" min="0" max="100" value="60" aria-label="Master volume" /></label><label class="motion"><input id="motion" type="checkbox" /> Reduce motion</label></div><p class="audio-credit">Sound recordings: qubodup / Freesound · CC0<br/><a href="https://github.com/frostburn/amortization2" target="_blank" rel="noreferrer">Source, credits &amp; issue reports ↗</a></p><button id="resume" class="primary">ENTER RANGE <span>↗</span></button><p class="desktop-note">Keyboard and mouse recommended. Headphones welcome.</p></div></dialog>`;
  return {
    canvas: document.querySelector<HTMLCanvasElement>("#range")!,
    dialog: document.querySelector<HTMLDialogElement>("#menu")!,
  };
}

const text = (id: string, value: string | number) => {
  const el = document.getElementById(id)!;
  const s = String(value);
  if (el.textContent !== s) el.textContent = s;
};
export function updateUI(sim: Simulation, audio: RangeAudio) {
  text("hits", sim.hits);
  text("shots", sim.shots);
  text(
    "accuracy",
    sim.shots ? `${Math.round((sim.hits / sim.shots) * 100)}%` : "—",
  );
  const gunner = sim.active.find((a) => a.model === "assault") ?? sim.squad[0],
    rifle = sim.rifleOperator ?? sim.squad[3],
    current = sim.weapon === "rifle" ? rifle : gunner,
    reloading = current.reload > 0;
  text("ammo", gunner.ammo);
  text("rifle-ammo", rifle.ammo);
  for (const [key, a, progress] of [
    ["gun", gunner, "reload-progress"],
    ["rifle", rifle, "rifle-reload-progress"],
  ] as const) {
    document.getElementById(key)!.classList.toggle("reloading", a.reload > 0);
    document.getElementById(progress)!.style.width =
      a.reload > 0 ? `${(1 - a.reload / sim.reloadDuration(a)) * 100}%` : "0";
  }
  const long = sim.range === "long";
  text(
    "drill-count",
    long
      ? `${Number(sim.drill.rifle)} / 1`
      : `${[sim.drill.gun, sim.drill.impulse, sim.drill.grenade].filter(Boolean).length} / 3`,
  );
  for (const key of ["gun", "impulse", "grenade"])
    document.getElementById(`drill-${key}`)!.hidden = long;
  document.getElementById("drill-rifle")!.hidden = !long;
  document.getElementById("sight-controls")!.hidden = !long;
  text(
    "rifle-progress",
    sim.actors.some(
      (a) => a.kind === "precision" && a.dead && a.killedBy !== "rifle",
    )
      ? "Reset to restore rifle targets"
      : `Clear 30, 60 and 90 m targets · ${sim.actors.filter((a) => a.kind === "precision" && a.dead && a.killedBy === "rifle").length} / 3`,
  );
  text(
    "range-note",
    long
      ? "Sight a target, zoom to NEEDLE, and hold Space. Aim inside the bubble; LMB fires."
      : "Unlimited range supplies. Reset to go again.",
  );
  for (const id of ["range-select", "menu-range"])
    (document.getElementById(id) as HTMLSelectElement).value = sim.range;
  text(
    "gun-progress",
    sim.actors.some((a) => a.kind === "plate" && a.dead && a.killedBy !== "gun")
      ? "Reset to restore gun targets"
      : `Clear six orange plates · ${sim.actors.filter((a) => a.kind === "plate" && a.dead && a.killedBy === "gun").length} / 6`,
  );
  text(
    "impulse-progress",
    `Push a heavy target 2 m · ${sim.maxDisplacement.toFixed(1)} m`,
  );
  text(
    "grenade-progress",
    sim.actors.some(
      (a) => a.kind === "blast" && a.dead && a.killedBy !== "grenade",
    )
      ? "Reset to restore grenade targets"
      : `Clear the covered bay · ${sim.actors.filter((a) => a.kind === "blast" && a.dead && a.killedBy === "grenade").length} / 3`,
  );
  for (const key of ["gun", "impulse", "grenade", "rifle"] as const)
    document
      .getElementById(`drill-${key}`)!
      .classList.toggle("complete", sim.drill[key]);
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-unit]",
  )) {
    const id = Number(button.dataset.unit),
      selected = sim.selected.has(id),
      actor = sim.squad.find((a) => a.id === id)!;
    button.classList.toggle("selected", selected);
    button.classList.toggle("disabled-unit", actor.dead);
    button.setAttribute("aria-pressed", String(selected));
    button.querySelector<HTMLElement>(".integrity i")!.style.width =
      `${(actor.hp / actor.maxHp) * 100}%`;
    button.classList.toggle("braced", actor.braced);
    button.title = `${SQUAD_NAMES[id - 1]} · ${actor.model === "sniper" ? "LIGHT SNIPER" : "ASSAULT"} · ${Math.ceil(actor.hp)} / ${actor.maxHp} INTEGRITY`;
  }
  document
    .getElementById("all")!
    .classList.toggle("selected", sim.selected.size === sim.squad.length);
  for (const key of ["gun", "rifle", "grenade"] as const) {
    const selected = sim.weapon === key;
    const el = document.getElementById(key)!;
    el.classList.toggle("selected", selected);
    el.setAttribute("aria-pressed", String(selected));
    (el as HTMLButtonElement).disabled = !sim.canUse(key);
  }
  text(
    "rifle-status",
    !sim.rifleOperator
      ? "E · SELECT NEEDLE (4)"
      : reloading && sim.weapon === "rifle"
        ? `RELOAD · ${rifle.reload.toFixed(1)} s`
        : rifle.shotWait > 0
          ? `CYCLING · ${rifle.shotWait.toFixed(1)} s`
          : rifle.braced
            ? rifle.braceTime >= RIFLE.settle
              ? "SPACE · STEADY"
              : `SETTLING · ${Math.round((rifle.braceTime / RIFLE.settle) * 100)}%`
            : "E · SPACE TO BRACE",
  );
  const thrower = sim.grenadeThrower;
  const grenadeWait = sim.grenadeCooldown.toFixed(1);
  text(
    "grenade-status",
    thrower
      ? `G · ${SQUAD_NAMES[thrower.id - 1]} READY`
      : sim.active.length
        ? `G · READY IN ${grenadeWait} s`
        : "NO THROWER",
  );
  text(
    "sound",
    audio.failed ? "AUDIO UNAVAILABLE" : audio.muted ? "SOUND OFF" : "SOUND ON",
  );
  document
    .getElementById("sound")!
    .setAttribute("aria-pressed", String(audio.muted));
  const dead = !sim.active.length;
  text(
    "mode-hint",
    dead
      ? "UNIT DISABLED · SELECT ANOTHER ROBOT OR RESET"
      : sim.weapon === "grenade"
        ? thrower
          ? `GRENADE · ${SQUAD_NAMES[thrower.id - 1]} NEXT · ${GRENADE_FUSE} s FUSE · ${GRENADE_COOLDOWN} s COOLDOWN`
          : `GRENADES REARMING · READY IN ${grenadeWait} s`
        : sim.weapon === "rifle"
          ? !sim.rifleOperator
            ? "SELECT NEEDLE (4) TO USE THE SNIPER RIFLE"
            : reloading
              ? "RIFLE RELOADING · 3 s"
              : rifle.braced
                ? rifle.braceTime >= RIFLE.settle
                  ? "RIFLE STEADY · LMB TO FIRE"
                  : "BRACING · LET THE RIFLE SETTLE"
                : "UNBRACED · WIDE SWAY / HEAVY RECOIL · HOLD SPACE"
          : reloading
            ? "RELOADING · KEEP MOVING"
            : sim.active.some((a) => a.braced)
              ? "BRACED · RELEASE SPACE TO MOVE"
              : "MACHINE GUN · HOLD LMB TO FIRE",
  );
}
