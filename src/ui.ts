import {
  GRENADE_COOLDOWN,
  GRENADE_FUSE,
  SQUAD_NAMES,
  RIFLE,
  PISTOL,
  MINIGUN,
  ROBOT_MODELS,
  squadName,
} from "./game/config";
import type { Simulation } from "./game/simulation";
import type { RangeAudio } from "./audio/audio";
import { ARENA_ENTRIES } from "./game/ranges";

const robotIcon =
  '<svg viewBox="0 0 32 44" aria-hidden="true"><path d="M12 2h8v8h-8zM8 12h16v15H8zM3 13h4v16H3zm22 0h4v16h-4zM9 29h6v13H8zm8 0h6l1 13h-7z" fill="currentColor"/><path d="M14 5h4M12 17h8" stroke="#152023" stroke-width="2"/></svg>';
const gunIcon =
  '<svg viewBox="0 0 100 36" aria-hidden="true"><path d="M5 12h39l5-4h19v5h28v5H65v8H48v-6H29l-5 12h-8l2-14H5z" fill="currentColor"/><path d="M54 25v8h9l-1-8M67 9h11v3" fill="currentColor"/></svg>';
const pistolIcon =
  '<svg viewBox="0 0 100 36" aria-hidden="true"><path d="M18 9h62v10H49l-3 15H30l4-15H18zM48 19h14v10H45v-4h12v-6z" fill="currentColor"/></svg>';
const grenadeIcon =
  '<svg viewBox="0 0 36 44" aria-hidden="true"><path d="M15 5h8v7c7 3 9 9 8 17-1 8-6 12-13 12S6 37 5 29s2-14 9-17z" fill="currentColor"/><path d="M23 5h6l3 18M12 18v18m7-20v22m6-19v16M7 23h22M7 30h22" fill="none" stroke="#152023" stroke-width="1.5"/></svg>';
const rifleIcon =
  '<svg viewBox="0 0 100 36" aria-hidden="true"><path d="M4 15h19l8-5h27v4h39v3H59v6H39l-6 10h-7l3-14H4zM43 6h19v5H43zM46 24h9v9h-9z" fill="currentColor"/></svg>';
const minigunIcon =
  '<svg viewBox="0 0 100 36" aria-hidden="true"><path d="M9 11h35v17H9zM23 3h16v8H23zM43 9h10v22H43zM53 11h44v4H53zm0 7h44v4H53zm0 7h44v4H53zM67 8h5v25h-5zM85 8h5v25h-5z" fill="currentColor"/></svg>';
const rangeOptions =
  '<option value="proving">PROVING GROUND</option><option value="long">LONG RANGE</option><option value="arena">ENDLESS ARENA</option><option value="city">CITY DISTRICT</option>';
const loadoutOptions =
  '<option value="sniper">NEEDLE · SNIPER</option><option value="minigunner">TWIN MINIGUNS</option><option value="assault">BOLT · MACHINE GUNNER</option>';

export function mountUI() {
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <header class="topbar">
      <div class="brand"><h1>AMORTIZATION <span>II</span></h1><p>FUTURES CONTRACT</p></div>
      <div class="range-title"><select id="range-select" aria-label="Choose combat floor">${rangeOptions}</select><label class="header-loadout">SQUAD <select id="loadout-select" aria-label="Choose squad configuration; restarts combat floor" title="Changing the squad restarts the combat floor">${loadoutOptions}</select></label></div>
      <nav aria-label="Range controls"><button id="reset" title="Reset the range (Shift+R)">RESET RANGE</button><button id="sound" aria-pressed="false" title="Toggle sound">SOUND ON</button><button id="help" aria-label="Help and settings">?</button></nav>
    </header>
    <main id="field">
      <canvas id="range" tabindex="0" aria-label="3D target practice range. Hold left mouse to fire, shift-drag to select a group, right-drag to steer, Q for automatic weapons or NEEDLE pistol, G for assault grenades, E for sniper rifle. Space toggles braced first-person sniping with the rifle; move the mouse to aim horizontally and vertically. Select robots with 1 to 4, or the squad with 5."></canvas><div id="selection-box" aria-hidden="true" hidden></div><div id="scope-label" class="aux-label" aria-label="First-person rifle status" hidden></div>
      <aside id="drills" class="drills panel" aria-label="Range drills">
        <div class="panel-heading">RANGE DRILLS <span id="drill-count">0 / 3</span></div>
        <div class="drill" id="drill-gun"><span class="check"></span><div>Automatic fire<span class="detail" id="gun-progress">Clear six orange plates · 0 / 6</span></div></div>
        <div class="drill" id="drill-impulse"><span class="check"></span><div>Displacement<span class="detail" id="impulse-progress">Push a heavy target 2 m · 0.0 m</span></div></div>
        <div class="drill" id="drill-grenade"><span class="check"></span><div>Thrown grenade<span class="detail" id="grenade-progress">Clear the covered bay · 0 / 3</span></div></div>
        <div class="drill" id="drill-rifle" hidden><span class="check"></span><div>Precision rifle<span class="detail" id="rifle-progress">Clear 30, 60 and 90 m targets · 0 / 3</span></div></div>
        <div id="sight-controls" hidden><span class="detail">SIGHT TARGET</span><div>${[30, 60, 90].map((m) => `<button data-sight="${m}" aria-label="Sight the ${m} metre target">${m} m</button>`).join("")}</div></div>
        <p class="range-note" id="range-note">Unlimited range supplies. Reset to go again.</p>
      </aside>
      <aside id="arena-panel" class="arena-panel panel" aria-label="Arena wave status" hidden><div class="panel-heading">LIVE FIRE <span id="arena-wave">WAVE 1</span></div><div class="arena-tally"><div><strong id="arena-enemies">0</strong><span>HOSTILES</span></div><div><strong id="arena-kills">0</strong><span>DISABLED</span></div><div><strong id="arena-alive">4</strong><span>SQUAD</span></div></div><p id="arena-phase">First wave incoming</p><div id="wave-timer"><i></i></div><p class="range-note" id="arena-note">Clear the wave. Survivors repair and rearm.</p></aside>
      <div id="arena-defeat" hidden><p>SQUAD LOST</p><h2 id="arena-result">Wave 1</h2><p id="arena-score">0 hostile robots disabled</p><button id="arena-restart">RESTART ARENA <span>Shift + R</span></button></div>
      <aside class="stats panel aux-label" aria-label="Shooting statistics"><div><span>HITS</span><strong id="hits">0</strong></div><div><span>SHOTS</span><strong id="shots">0</strong></div><div><span>ACCURACY</span><strong id="accuracy">—</strong></div></aside>
      <div id="toast" role="status" aria-live="polite"></div>
      <div id="mode-hint" class="aux-label">MACHINE GUN · HOLD LMB TO FIRE</div>
      <div id="loading">Preparing range…</div>
    </main>
    <footer class="bottom-bar">
      <div class="squad" aria-label="Select robots">${SQUAD_NAMES.map((name, i) => `<button class="unit ${i === 0 ? "selected" : ""} ${i === 3 ? "sniper-unit" : ""}" data-unit="${i + 1}" aria-label="Select ${name}, robot ${i + 1}${i === 3 ? ", light sniper, 64 integrity" : ""}" aria-pressed="${i === 0}"><span class="unit-key">${i + 1}</span>${robotIcon}<span class="unit-role aux-label"${i === 3 ? "" : " hidden"}>${i === 3 ? "SNIPER" : ""}</span><span class="unit-name">${name}</span><span class="integrity"><i></i></span></button>`).join("")}<button id="all" title="Select all robots (5)" aria-label="Select whole squad">ALL<span>5</span></button></div>
      <div class="weapons" aria-label="Choose weapon"><button class="weapon selected" id="gun" aria-describedby="close-status" aria-pressed="true"><span class="weapon-icon" id="close-icon">${gunIcon}</span><span class="weapon-name aux-label"><span id="close-name">MACHINE GUN</span><small id="close-status">Q · 14 ROUNDS / SEC</small></span><span class="ammo"><b id="ammo">90</b><span id="ammo-limit"> / 90</span></span><i id="reload-progress" class="reload-progress"></i></button><button class="weapon rifle" id="rifle" aria-label="Sniper rifle (E)" aria-describedby="rifle-status" aria-pressed="false"><span class="weapon-icon">${rifleIcon}</span><span class="weapon-name aux-label">SNIPER RIFLE<small id="rifle-status">E · SPACE TO BRACE</small></span><span class="ammo"><b id="rifle-ammo">${RIFLE.magazine}</b><span> / ${RIFLE.magazine}</span></span><i id="rifle-reload-progress" class="reload-progress"></i></button><button class="weapon grenade" id="grenade" aria-label="Grenade (G)" aria-describedby="grenade-status" aria-pressed="false"><span class="weapon-icon">${grenadeIcon}</span><span class="weapon-name aux-label">GRENADE<small id="grenade-status">G · 2.4 SEC FUSE</small></span><i id="grenade-reload-progress" class="reload-progress"></i></button></div>
      <div class="quick-controls aux-label"><span><kbd>LMB</kbd> FIRE</span><span><kbd>RMB</kbd> <i id="move-action">MOVE</i></span><span><kbd>SPACE</kbd> <i id="brace-action">BRACE</i></span><span><kbd>R</kbd> RELOAD</span></div>
    </footer>
    <dialog id="menu"><div class="dialog-inner"><div class="dialog-rule"></div><p class="dialog-location">AMORTIZATION II</p><h2 id="menu-title">Proving ground</h2><p id="menu-intro">Choose a sniper, twin-minigun or machine-gun squad. Test sustained fire, displacement and grenades, or fight endless squads in the arena. Grenades and sniper shots can hit allies. Automatic weapons and pistol fire cannot.</p><label class="range-choice">COMBAT FLOOR <select id="menu-range" aria-label="Choose range before entering">${rangeOptions}</select></label><label class="range-choice loadout-choice">SQUAD <select id="menu-loadout" aria-label="Choose squad configuration">${loadoutOptions}</select></label><p id="loadout-description" class="loadout-description"></p><p class="loadout-note">Changing the squad restarts the combat floor.</p><div class="settings"><label>Master <input id="volume" type="range" min="0" max="100" value="60" aria-label="Master volume" /></label><label>Civilian motors <input id="civilian-volume" type="range" min="0" max="100" value="40" aria-label="Civilian motor volume" /></label><label class="motion"><input id="motion" type="checkbox" /> Reduce motion</label><label title="Show world signage and optional HUD hints"><input id="aux-labels" type="checkbox" checked /> Aux labels</label></div><div class="brief-controls"><p><kbd>LMB</kbd><span>Hold to fire. Grenade clicks rotate through ready assault robots (${GRENADE_COOLDOWN} s each).</span></p><p><kbd>RMB</kbd><span>Drag to steer selected robots. Shift-click queues a move. In sniping, return to the overhead view.</span></p><p><kbd>⇧ + LMB</kbd><span>Drag a box to select a group. Shift-click toggles a robot.</span></p><p><kbd>1–4</kbd><span>Select a robot. <kbd>4</kbd> is your chosen fourth member. <kbd>5</kbd> selects the squad.</span></p><p><kbd>Q / E / G</kbd><span>Automatic weapons or NEEDLE pistol / sniper rifle / assault grenades. Machine guns and miniguns fire together when selected. Hold LMB through the minigun wind-up. <kbd>R</kbd> reloads.</span></p><p><kbd>SPACE</kbd><span>Rifle: toggle braced first-person sniping; move the mouse to turn and aim in both axes; wheel adjusts the scope. The rest of the squad follows its movement orders and provides automatic cover fire. Space or Esc returns the cursor and releases automatic cover. Aim settles in ${RIFLE.settle} s. Automatic weapons and pistol: hold to brace.</span></p><p><kbd>WASD</kbd><span>Pan the overhead view. Wheel zooms. <kbd>F</kbd> centres the robot. <kbd>Esc</kbd> leaves sniping; press again to pause.</span></p></div><fieldset class="aim-settings"><legend>SNIPER AIM</legend><label><input id="invert-x" type="checkbox" /> Invert X axis</label><label><input id="invert-y" type="checkbox" /> Invert Y axis</label><p>Reverse horizontal and vertical mouse aiming independently.</p></fieldset><p class="audio-credit">Sound recordings: qubodup / Freesound · CC0<br/><a href="https://github.com/frostburn/amortization2" target="_blank" rel="noreferrer">Source, credits &amp; issue reports ↗</a></p><button id="resume" class="primary">ENTER RANGE <span>↗</span></button><p class="desktop-note">Keyboard and mouse recommended. Headphones welcome.</p></div></dialog>`;
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
  const close = sim.closeWeapon;
  const gunner = sim.active.find((a) => sim.supports(a, close)) ?? sim.squad.find((a) => sim.supports(a, close)) ?? sim.squad[0],
    rifle = sim.rifleOperator ?? sim.squad.find((a) => a.model === "sniper") ?? sim.squad[3],
    current = sim.weapon === "rifle" ? rifle : gunner,
    currentState = sim.ammunition(current, sim.weapon === "rifle" ? "rifle" : close),
    reloading = currentState.reload > 0;
  const closeState = sim.ammunition(gunner, close);
  const closeButton = document.getElementById("gun") as HTMLButtonElement;
  if (closeButton.dataset.weapon !== close) {
    closeButton.dataset.weapon = close;
    document.getElementById("close-icon")!.innerHTML = close === "pistol" ? pistolIcon : close === "minigun" ? minigunIcon : gunIcon;
  }
  const mixedArms = sim.closeWeapons.length > 1;
  const closeName = close === "pistol" ? "PISTOL" : close === "minigun" ? "MINIGUN" : "MACHINE GUN";
  const automaticGroup = sim.canUse("gun") && sim.canUse("minigun");
  closeButton.setAttribute("aria-label", mixedArms ? `Cycle automatic weapon and pistol (Q); ${closeName.toLowerCase()} equipped`
    : `${closeName} (Q)${automaticGroup ? "; selected machine gunners also fire" : ""}`);
  text("close-name", closeName);
  text("close-status", closeState.reload > 0 ? `RELOAD · ${closeState.reload.toFixed(1)} s`
    : close === "minigun" ? gunner.spooling && gunner.spin < 1 ? `SPIN-UP · ${Math.round(gunner.spin * 100)}%`
      : gunner.firing ? "30 ROUNDS / SEC" : gunner.spin > 0 ? `COASTING · ${Math.round(gunner.spin * 100)}%`
      : automaticGroup ? "Q · GROUP AUTOMATIC FIRE" : "Q · HOLD LMB TO SPIN UP"
    : mixedArms ? `Q · SWITCH TO ${close === "pistol" ? "MACHINE GUN" : "PISTOL"}`
    : close === "pistol" ? `Q · ${PISTOL.range} m · NEEDLE ONLY` : "Q · 14 ROUNDS / SEC");
  text("ammo", closeState.ammo);
  text("ammo-limit", ` / ${sim.magazine(gunner, close)}`);
  text("rifle-ammo", rifle.model === "sniper" ? rifle.ammo : "—");
  for (const [key, a, weapon, progress] of [
    ["gun", gunner, close, "reload-progress"],
    ["rifle", rifle, "rifle", "rifle-reload-progress"],
  ] as const) {
    const state = sim.ammunition(a, weapon);
    document.getElementById(key)!.classList.toggle("reloading", state.reload > 0);
    document.getElementById(progress)!.style.width =
      state.reload > 0 ? `${(1 - state.reload / sim.reloadDuration(a, weapon)) * 100}%` : "0";
  }
  const arena = sim.arena;
  document.getElementById("drills")!.hidden = !!arena || sim.range === "city";
  document.getElementById("arena-panel")!.hidden = !arena;
  document.getElementById("arena-defeat")!.hidden = arena?.phase !== "defeat";
  text("reset", arena ? "RESTART ARENA" : sim.range === "city" ? "RESET DISTRICT" : "RESET RANGE");
  if (arena) {
    const pending = arena.phase === "incoming" || arena.phase === "intermission";
    text("arena-wave", `WAVE ${arena.wave + Number(pending)}`);
    text("arena-enemies", arena.enemies.length);
    text("arena-kills", arena.kills);
    text("arena-alive", sim.squad.filter((a) => !a.dead).length);
    text("arena-phase", pending
      ? `${arena.entries.map((i) => ARENA_ENTRIES[i].name).join(" / ")} · ${arena.nextCount} IN ${Math.ceil(arena.countdown)} s`
      : arena.phase === "defeat" ? "SQUAD LOST · SHIFT+R TO RESTART"
      : !arena.enemies.length && sim.grenades.length ? "EXPLOSIVES STILL LIVE" : "ENEMY SQUADS ENGAGED");
    document.getElementById("wave-timer")!.hidden = !pending;
    document.querySelector<HTMLElement>("#wave-timer i")!.style.width =
      `${arena.countdown / (arena.wave ? 6 : 4) * 100}%`;
    text("arena-note", arena.phase === "intermission"
      ? "Survivors repaired and rearmed. Disabled robots stay down."
      : "Clear the wave. Survivors repair and rearm. Shift+R restarts.");
    text("arena-result", `Wave ${Math.max(1, arena.wave)}`);
    text("arena-score", `${arena.kills} hostile robots disabled · ${arena.cleared} waves cleared`);
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
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-sight]"))
    button.disabled = sim.fourthModel !== "sniper" || sim.squad[3].dead;
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
      ? sim.fourthModel === "sniper" ? "Sight a target, then press Space for braced first-person sniping. Mouse aims in both axes; LMB fires."
        : "Choose NEEDLE as robot 4 for the precision rifle drill."
      : "Unlimited range supplies. Reset to go again.",
  );
  for (const id of ["range-select", "menu-range"])
    (document.getElementById(id) as HTMLSelectElement).value = sim.range;
  for (const id of ["loadout-select", "menu-loadout"])
    (document.getElementById(id) as HTMLSelectElement).value = sim.fourthModel;
  text("loadout-description", sim.fourthModel === "sniper"
    ? "NEEDLE · 64 integrity. Long-range rifle and pistol. Space toggles braced sniping. No grenades."
    : sim.fourthModel === "minigunner"
      ? `ROOK (2) + SPINDLE (4) · Two minigunners with 200 integrity each. Heavy, slower chassis; ${MINIGUN.windUp} s wind-up, 30 rounds/s, 240-round belts. Hold Space to brace. ANCHOR and LATCH carry machine guns and grenades.`
      : "BOLT · 160 integrity. Machine gun and grenades. Same speed and loadout as the other assault robots.");
  text(
    "gun-progress",
    sim.actors.some((a) => a.kind === "plate" && a.dead && a.killedBy !== "gun" && a.killedBy !== "minigun")
      ? "Reset to restore gun targets"
      : `Clear six orange plates · ${sim.actors.filter((a) => a.kind === "plate" && a.dead && (a.killedBy === "gun" || a.killedBy === "minigun")).length} / 6`,
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
    const staggered = sim.isDisrupted(actor);
    button.classList.toggle("staggered", staggered);
    const role = button.querySelector<HTMLElement>(".unit-role")!;
    role.hidden = !staggered && !actor.cover && actor.model === "assault";
    role.textContent = staggered ? "STAGGER" : actor.cover ? "COVER" : actor.model === "minigunner" ? actor.spooling && actor.spin < 1 ? "WIND-UP" : actor.firing ? "FIRING" : "MINIGUN" : "SNIPER";
    button.classList.toggle("sniper-unit", actor.model === "sniper");
    button.classList.toggle("minigunner-unit", actor.model === "minigunner");
    const name = squadName(id, actor.model);
    button.querySelector<HTMLElement>(".unit-name")!.textContent = name;
    button.setAttribute("aria-label", `Select ${name}, robot ${id}, ${ROBOT_MODELS[actor.model!].name}, ${Math.ceil(actor.hp)} integrity${staggered ? ", staggered" : ""}`);
    button.title = `${name} · ${ROBOT_MODELS[actor.model!].name} · ${Math.ceil(actor.hp)} / ${actor.maxHp} INTEGRITY${staggered ? " · STAGGERED · BRACING RECOVERS FASTER" : ""}${actor.cover ? " · AUTOMATIC COVER FIRE · MOVEMENT ORDERS ACTIVE" : ""}`;
  }
  document
    .getElementById("all")!
    .classList.toggle("selected", sim.selected.size === sim.squad.length);
  for (const key of ["gun", "rifle", "grenade"] as const) {
    const weapon = key === "gun" ? close : key;
    const selected = sim.weapon === weapon || key === "gun" && (sim.weapon === "gun" || sim.weapon === "minigun") && close !== "pistol";
    const el = document.getElementById(key)!;
    el.classList.toggle("selected", selected);
    el.setAttribute("aria-pressed", String(selected));
    (el as HTMLButtonElement).disabled = !sim.canUse(weapon);
    if (key !== "gun") el.hidden = !sim.canUse(weapon);
  }
  text(
    "rifle-status",
    !sim.rifleOperator
      ? "E · SELECT NEEDLE (4)"
      : sim.isDisrupted(rifle)
        ? "STAGGER · RECOVERING"
      : reloading && sim.weapon === "rifle"
        ? `RELOAD · ${rifle.reload.toFixed(1)} s`
        : rifle.shotWait > 0
          ? `CYCLING · ${rifle.shotWait.toFixed(1)} s`
          : sim.sniping && rifle.braced
            ? rifle.braceTime >= RIFLE.settle
              ? "SPACE · EXIT SIGHT"
              : `SETTLING · ${Math.round((rifle.braceTime / RIFLE.settle) * 100)}%`
            : "E · SPACE TO SNIPE",
  );
  const thrower = sim.grenadeThrower;
  const grenadeWait = sim.grenadeCooldown.toFixed(1);
  document.getElementById("grenade")!.classList.toggle("rearming", !thrower && sim.canUse("grenade"));
  document.getElementById("grenade-reload-progress")!.style.width = thrower
    ? "0" : `${Math.max(0, 1 - Math.min(1, sim.grenadeCooldown / GRENADE_COOLDOWN)) * 100}%`;
  text(
    "grenade-status",
    thrower
      ? `G · ${squadName(thrower.id, thrower.model)} READY`
      : sim.active.length
        ? `G · READY IN ${grenadeWait} s`
        : "NO GRENADE CARRIER",
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
    "brace-action",
    sim.weapon === "rifle" ? (sim.sniping ? "EXIT SIGHT" : "SNIPE") : "BRACE",
  );
  text("move-action", sim.sniping ? "EXIT SIGHT" : "MOVE");
  const gunElevation = sim.aim.y - gunner.body.translation().y - 0.42;
  const gunHeight = Math.abs(gunElevation) > 0.35
    ? ` · AIM ${gunElevation > 0 ? "↑ +" : "↓ "}${gunElevation.toFixed(1)} m`
    : "";
  text(
    "mode-hint",
    dead
      ? "UNIT DISABLED · SELECT ANOTHER ROBOT OR RESET"
      : sim.active.some((a) => sim.isDisrupted(a))
        ? sim.weapon === "rifle"
          ? sim.sniping ? "STAGGER · BRACED RECOVERY" : "STAGGER · SPACE TO BRACE AND SNIPE"
          : "STAGGER · HOLD SPACE TO RECOVER FASTER"
      : sim.weapon === "grenade"
        ? thrower
          ? `GRENADE · ${squadName(thrower.id, thrower.model)} NEXT · ${GRENADE_FUSE} s FUSE · ${GRENADE_COOLDOWN} s COOLDOWN`
          : `GRENADES REARMING · READY IN ${grenadeWait} s`
        : sim.weapon === "rifle"
          ? !sim.rifleOperator
            ? "SELECT NEEDLE (4) TO USE THE SNIPER RIFLE"
            : reloading
              ? "RIFLE RELOADING · 3 s"
              : rifle.braced
                ? rifle.braceTime >= RIFLE.settle
                  ? "MOUSE AIM · LMB FIRE · WHEEL ZOOM · SPACE RETURN"
                  : "BRACING · LET THE RIFLE SETTLE · SPACE RETURN"
                : "UNBRACED · HEAVY RECOIL · SPACE TO SNIPE"
          : reloading
            ? "RELOADING · KEEP MOVING"
            : close === "minigun" && gunner.spooling && gunner.spin < 1
              ? `MINIGUN WIND-UP · ${Math.round(gunner.spin * 100)}% · KEEP HOLDING LMB`
            : sim.active.some((a) => a.braced)
              ? `BRACED${gunHeight} · RELEASE SPACE TO MOVE`
              : `${closeName}${gunHeight} · ${automaticGroup ? "LMB FIRES SELECTED AUTOMATIC WEAPONS" : "HOLD LMB TO FIRE"}`,
  );
}
