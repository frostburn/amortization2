import { NEXT_CONTRACT, type Contact } from "./game/missions";
import { RANGES } from "./game/ranges";
import type { EscortMission } from "./game/escort-mission";
import { PriorityMission } from "./game/priority-mission";
import { squadName } from "./game/config";
import type { Simulation } from "./game/simulation";
import { rookDebrief } from "./game/debrief";
import { replayControls } from "./replay-ui";

const CONTACTS = {
  morrow: { name: "MORROW", role: "Operations" },
  vale: { name: "VALE", role: "Recon / contacts" },
  rook: { name: "ROOK", role: "Weapons / security" },
  sable: { name: "SABLE", role: "Systems" },
  quill: { name: "REN QUILL", role: "Agreements" },
};
const portrait = (speaker: Contact) => `${import.meta.env.BASE_URL}portraits/${speaker}.webp`;
const contact = (speaker: Contact, message: string) => `<article class="contact-line" data-contact="${speaker}"><img src="${portrait(speaker)}" alt="${CONTACTS[speaker].name}" width="64" height="64"/><div><p class="contact-name">${CONTACTS[speaker].name}<span>${CONTACTS[speaker].role}</span></p><p>${message}</p></div></article>`;

export const missionBriefing = `<section id="mission-briefing"></section>`;
export const missionHUD = `
  <aside id="mission-panel" class="mission-panel panel" aria-label="Mission objective" hidden>
    <div class="panel-heading"><b id="mission-name">01 / RECEIVING</b> <span id="mission-stage">1 / 3</span></div>
    <h2 id="mission-objective">Clear the pickup yard</h2><p id="mission-detail">4 guards</p>
    <progress id="mission-progress" max="1" value="0" aria-label="Objective progress" hidden></progress>
    <div id="escort-status" hidden><img src="${portrait("quill")}" alt="Ren Quill" width="36" height="36"/><div><b>QUILL</b><span id="escort-state"></span><progress id="escort-health" max="88" value="88" aria-label="Ren Quill health"></progress></div></div>
  </aside>
  <aside id="mission-comms" class="mission-comms" role="status" aria-live="polite" hidden>
    <img id="comms-portrait" alt="" width="64" height="64"/><div><p class="contact-name" id="comms-name"></p><p id="comms-message"></p></div>
    <button id="dismiss-comms" aria-label="Dismiss radio message">×</button>
  </aside>`;
export const missionResult = `<dialog id="mission-result" aria-labelledby="mission-result-title"><div class="dialog-inner"><div class="dialog-rule"></div><p class="dialog-location" id="mission-result-state">CONTRACT COMPLETE</p><h2 id="mission-result-title">Receiving</h2>${contact("morrow", "")}${contact("rook", "")}<p id="mission-result-detail"></p><div class="mission-result-actions"><button id="mission-next" class="primary" hidden>NEXT CONTRACT · CROSSING <span>↗</span></button><button id="mission-replay">REPLAY CONTRACT</button><button id="mission-debug">PRACTICE / DEBUG</button></div>${replayControls}</div></dialog>`;

const setText = (id: string, value: string) => {
  const element = document.getElementById(id)!;
  if (element.textContent !== value) element.textContent = value;
};

export function updateMissionUI(sim: Simulation) {
  const mission = sim.mission;
  const selectable = !!mission?.definition.selectableSquad;
  document.getElementById("mission-panel")!.hidden = !mission;
  document.getElementById("mission-briefing")!.hidden = !mission;
  document.getElementById("menu")!.classList.toggle("mission-menu", !!mission);
  document.getElementById("app")!.classList.toggle("on-mission", !!mission);
  for (const id of ["loadout-select", "menu-loadout"]) {
    const select = document.getElementById(id) as HTMLSelectElement;
    select.disabled = !!mission && (!selectable || mission.phase !== "briefing");
    select.closest("label")!.hidden = !!mission && !selectable;
  }
  for (const selector of ["#loadout-description", ".loadout-note", "#debug-controls", ".aim-settings"])
    (document.querySelector(selector) as HTMLElement).hidden = !!mission && !selectable;
  document.getElementById("mission-controls")!.hidden = !sim.pistolsOnly;
  const note = document.querySelector(".loadout-note")!;
  note.textContent = selectable ? "Choose before deployment. Restart the contract to change the squad." : "Changing the squad restarts the combat floor.";
  document.getElementById("haul-controls")!.hidden = !sim.hauling;
  document.getElementById("escort-controls")!.hidden = !sim.escort;
  document.getElementById("escort-status")!.hidden = !sim.escort;
  if (!mission) return;

  const briefing = document.getElementById("mission-briefing")!;
  if (briefing.dataset.contract !== mission.definition.id) {
    const definition = mission.definition;
    briefing.innerHTML = `<p class="contract-location">${definition.location}</p>${definition.briefing.map(line => contact(line.speaker, line.message)).join("")}<ol class="contract-steps">${definition.objectives.map(label => `<li>${label}</li>`).join("")}</ol><p class="contract-equipment">${selectable ? "MILITARY WEAPONS AUTHORISED" : "FOUR PISTOLS · NO RIFLES OR GRENADES"}</p>`;
    briefing.dataset.contract = definition.id;
  }
  setText("mission-name", `${mission.definition.number} / ${mission.definition.title.toUpperCase()}`);
  setText("mission-result-title", mission.definition.title);
  const next = document.getElementById("mission-next")!;
  const nextRange = NEXT_CONTRACT[mission.definition.id as keyof typeof NEXT_CONTRACT];
  next.hidden = !nextRange || mission.phase !== "complete";
  const nextContract = nextRange ? RANGES[nextRange].name.split(" · ")[1] : "";
  if (next.dataset.contract !== nextContract) {
    next.innerHTML = `NEXT CONTRACT · ${nextContract} <span>↗</span>`;
    next.dataset.contract = nextContract;
  }

  setText("mission-stage", `${mission.objective + 1} / ${mission.definition.objectives.length}`);
  setText("mission-objective", mission.definition.objectives[mission.objective]);
  const living = sim.squad.filter(a => !a.dead);
  const marker = mission.marker;
  const near = marker ? living.filter(a => Math.hypot(a.body.translation().x - marker.x,
    a.body.translation().z - marker.z) < marker.radius).length : 0;
  const across = mission.bridge ? living.filter(a => mission.bridge!.shore(a.body.translation()) === 1).length : 0;
  const load = sim.hauling?.available();
  const escort = sim.escort, rescue = mission as EscortMission;
  const priority = mission instanceof PriorityMission ? mission : undefined;
  if (escort) {
    const guide = escort.leader;
    setText("escort-state", escort.human.dead ? "Lost" : escort.state === "captive" ? "Inside office"
      : escort.state === "waiting" ? "Waiting · H to follow" : guide ? `Following ${squadName(guide.id, guide.model)}` : "Needs a guide");
    const health = document.getElementById("escort-health") as HTMLProgressElement;
    health.max = escort.human.maxHp; health.value = escort.human.hp;
  }
  setText("mission-detail", priority ? mission.phase === "yard" ? `${priority.guards.length} perimeter machines · ${priority.removal === "secured" ? "Equipment secured" : priority.removal === "loading" ? "Removal loading" : "Removal at the east gate"}`
    : mission.phase === "seizure" ? "Bring a robot beside the recovery van"
    : mission.phase === "dispatch" ? "Bring a robot to the service door"
    : mission.phase === "restore" ? priority.restoredAt !== undefined ? `${priority.response.length} response machines remaining`
      : priority.contested ? "Restart paused · Clear the service-door approach"
      : priority.repairing.length ? `${priority.repairing.length} technicians working · ${priority.response.length} response machines`
      : "Service crew arriving · Cover the street and concourse"
    : mission.phase === "return" ? `${near} / ${living.length} robots at the van`
    : mission.phase === "complete" ? "Exchange restored · Squad recovered" : mission.failureReason ?? "Recovery required"
    : escort ? mission.phase === "breach" ? "Shoot the entrance lock"
    : mission.phase === "rescue" ? rescue.guards.length ? `${rescue.guards.length} guards remaining` : "Bring a robot to Quill"
    : mission.phase === "escort" ? `${near} / ${living.length} robots at the van · ${rescue.reinforcements.length} response machines`
    : mission.phase === "complete" ? "Quill recovered · Squad recovered" : mission.failureReason ?? "Recovery required"
    : sim.hauling && ["delivery", "haul"].includes(mission.phase)
    ? load?.carriers.length ? `${load.carriers.length} / ${load.hands} carriers · ${load.state === "approaching" ? "Collecting" : load.state === "lifting" ? "Lifting" : "H puts cargo down"}`
      : `${load?.hands ?? 1} ${load?.hands === 2 ? "robots" : "robot"} needed · H to collect`
    : mission.phase === "crossing" ? `${across} / ${living.length} across${mission.alarmAt !== undefined ? " · West-bank pursuit" : " · One chassis at a time"}`
    : mission.phase === "withdraw" ? `${near} / ${living.length} at the van`
    : mission.phase === "dispatch" ? near ? "Dispatcher accepting release…" : "Bring one robot onto the yellow pad"
    : mission.phase === "return" ? `${near} / ${living.length} robots at the van`
    : mission.phase === "complete" ? sim.hauling ? "Tools recovered · Squad recovered" : mission.bridge ? "Canal crossed · Squad recovered" : "Cargo released · Squad recovered"
    : mission.phase === "failed" ? "Squad requires recovery"
    : `${mission.enemies.length} guards remaining`);
  const progress = document.getElementById("mission-progress") as HTMLProgressElement;
  progress.hidden = !marker || !!escort && mission.phase === "rescue" || !!sim.hauling && mission.phase === "delivery" && !mission.releaseProgress;
  progress.value = mission.phase === "breach" ? 1 - rescue.doorHp / rescue.doorMaxHp : (mission.phase === "dispatch" || mission.phase === "delivery") ? mission.releaseProgress : mission.returnProgress;
  if (priority) {
    progress.hidden = mission.phase === "yard" || mission.finished;
    progress.value = mission.phase === "seizure" ? priority.stopProgress : mission.phase === "dispatch" ? priority.accessProgress
      : mission.phase === "restore" ? priority.repairProgress : mission.returnProgress;
  }
  if (escort && mission.phase === "breach") progress.hidden = false;

  if (mission.finished) {
    const complete = mission.phase === "complete";
    setText("mission-result-state", complete ? "CONTRACT COMPLETE" : "RECOVERY REQUIRED");
    const civilians = [...sim.city!.carts, ...sim.city!.kites, ...sim.city!.porters, ...sim.city!.vehicles];
    const damaged = civilians.filter(c => c.hp <= 0).length;
    const message = priority ? !complete
      ? `${mission.failureReason ?? "Recovery required"}. Vale is getting the owners and a recovery crew clear of the district.`
      : damaged ? "Dispatch is running again. We also owe the neighbourhood repairs. Meridian has offered priority access, with control of dispatch attached. Quill will handle their terms."
      : "The owners have their exchange and their equipment. Meridian has already offered priority access in return for control of dispatch. Quill is answering them. Send our invoice to the cooperative."
      : escort ? !complete
      ? escort.human.dead ? "Ren didn't make it. We can recover machines. We cannot replace him."
        : "Ren is still at the office. We're arranging another way in before Gannet moves him."
      : escort.human.hp < escort.human.maxHp ? "Ren is aboard. We've arranged treatment. The files can wait until he's ready."
        : "Ren is home. Again. He brought the operating-rights records; this time they don't get to write the account of what happened."
      : sim.hauling ? complete
      ? "The cooperative has its tools back. Send the return receipt to Gannet; their inventory can argue with itself."
      : `${mission.failureReason ?? "Squad recovery required"}. Rook will arrange a recovery crew for the yard.`
      : mission.bridge ? !complete
      ? `${mission.failureReason ?? "Squad recovery required"}. We'll arrange a recovery crew at the canal.`
      : living.length < 4 ? "The surviving chassis are across. Rook will arrange recovery for the ones we lost."
      : "All four across. The cooperative has its crew back, and Gannet has another invoice to dispute."
      : !complete ? mission.cargoReleased
      ? "The yard is open, but the squad is down. We're calling recovery."
      : "The squad is down. We're calling recovery. The cooperative still needs its parts."
      : damaged ? "The cargo hold is off. The cooperative will finish collection after the damaged equipment is recovered."
      : living.length < 4 ? "Yard reopened. Bring the damaged chassis to Rook's bench; the cooperative can arrange its pickups."
      : "They have their parts, and the dispatcher has the yard. Send the invoice. We're done here.";
    const line = document.querySelector('#mission-result [data-contact="morrow"] > div > p:last-child')!;
    if (line.textContent !== message) line.textContent = message;
    const rook = document.querySelector('#mission-result [data-contact="rook"] > div > p:last-child')!;
    const assessment = rookDebrief(sim.squad, complete);
    if (rook.textContent !== assessment) rook.textContent = assessment;
    const seconds = Math.floor((mission.finishedAt ?? sim.time) - mission.deployedAt);
    setText("mission-result-detail", `${living.length} / 4 robots ${complete ? "recovered" : "still responding"} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} on site${damaged ? ` · ${damaged} civilian machines disabled` : ""}`);
  }
}

export function showComms(speaker: Contact, message: string) {
  const image = document.getElementById("comms-portrait") as HTMLImageElement;
  image.src = portrait(speaker);
  image.alt = CONTACTS[speaker].name;
  setText("comms-name", CONTACTS[speaker].name);
  setText("comms-message", message);
  document.getElementById("mission-comms")!.hidden = false;
}
