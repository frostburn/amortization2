import type { Contact } from "./game/missions";
import type { Simulation } from "./game/simulation";
import { rookDebrief } from "./game/debrief";
import { replayControls } from "./replay-ui";

const CONTACTS = {
  morrow: { name: "MORROW", role: "Operations" },
  vale: { name: "VALE", role: "Recon / contacts" },
  rook: { name: "ROOK", role: "Weapons / security" },
};
const portrait = (speaker: Contact) => `${import.meta.env.BASE_URL}portraits/${speaker}.webp`;
const contact = (speaker: Contact, message: string) => `<article class="contact-line" data-contact="${speaker}"><img src="${portrait(speaker)}" alt="${CONTACTS[speaker].name}" width="64" height="64"/><div><p class="contact-name">${CONTACTS[speaker].name}<span>${CONTACTS[speaker].role}</span></p><p>${message}</p></div></article>`;

export const missionBriefing = `<section id="mission-briefing"></section>`;
export const missionHUD = `
  <aside id="mission-panel" class="mission-panel panel" aria-label="Mission objective" hidden>
    <div class="panel-heading"><b id="mission-name">01 / RECEIVING</b> <span id="mission-stage">1 / 3</span></div>
    <h2 id="mission-objective">Clear the pickup yard</h2><p id="mission-detail">4 guards</p>
    <progress id="mission-progress" max="1" value="0" aria-label="Objective progress" hidden></progress>
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
  document.getElementById("mission-panel")!.hidden = !mission;
  document.getElementById("mission-briefing")!.hidden = !mission;
  document.getElementById("menu")!.classList.toggle("mission-menu", !!mission);
  document.getElementById("app")!.classList.toggle("on-mission", !!mission);
  for (const id of ["loadout-select", "menu-loadout"]) {
    const select = document.getElementById(id) as HTMLSelectElement;
    select.disabled = !!mission;
    select.closest("label")!.hidden = !!mission;
  }
  for (const selector of ["#loadout-description", ".loadout-note", "#debug-controls", ".aim-settings"])
    (document.querySelector(selector) as HTMLElement).hidden = !!mission;
  document.getElementById("mission-controls")!.hidden = !mission;
  if (!mission) return;

  const briefing = document.getElementById("mission-briefing")!;
  if (briefing.dataset.contract !== mission.definition.id) {
    const definition = mission.definition;
    briefing.innerHTML = `<p class="contract-location">${definition.location}</p>${definition.briefing.map(line => contact(line.speaker, line.message)).join("")}<ol class="contract-steps">${definition.objectives.map(label => `<li>${label}</li>`).join("")}</ol><p class="contract-equipment">FOUR PISTOLS · NO RIFLES OR GRENADES</p>`;
    briefing.dataset.contract = definition.id;
  }
  setText("mission-name", `${mission.definition.number} / ${mission.definition.title.toUpperCase()}`);
  setText("mission-result-title", mission.definition.title);
  document.getElementById("mission-next")!.hidden = mission.definition.id !== "receiving" || mission.phase !== "complete";

  setText("mission-stage", `${mission.objective + 1} / 3`);
  setText("mission-objective", mission.definition.objectives[mission.objective]);
  const living = sim.squad.filter(a => !a.dead);
  const marker = mission.marker;
  const near = marker ? living.filter(a => Math.hypot(a.body.translation().x - marker.x,
    a.body.translation().z - marker.z) < marker.radius).length : 0;
  const across = mission.bridge ? living.filter(a => mission.bridge!.side(a.body.translation()) === 1).length : 0;
  setText("mission-detail", mission.phase === "crossing" ? `${across} / ${living.length} across${mission.alarmAt !== undefined ? " · West-bank pursuit" : " · One chassis at a time"}`
    : mission.phase === "withdraw" ? `${near} / ${living.length} at the van`
    : mission.phase === "dispatch" ? near ? "Dispatcher accepting release…" : "Bring one robot onto the yellow pad"
    : mission.phase === "return" ? `${near} / ${living.length} robots at the van`
    : mission.phase === "complete" ? mission.bridge ? "Canal crossed · Squad recovered" : "Cargo released · Squad recovered"
    : mission.phase === "failed" ? "Squad requires recovery"
    : `${mission.enemies.length} guards remaining`);
  const progress = document.getElementById("mission-progress") as HTMLProgressElement;
  progress.hidden = !marker;
  progress.value = mission.phase === "dispatch" ? mission.releaseProgress : mission.returnProgress;

  if (mission.finished) {
    const complete = mission.phase === "complete";
    setText("mission-result-state", complete ? "CONTRACT COMPLETE" : "RECOVERY REQUIRED");
    const civilians = [...sim.city!.carts, ...sim.city!.kites, ...sim.city!.porters, ...sim.city!.vehicles];
    const damaged = civilians.filter(c => c.hp <= 0).length;
    const message = mission.bridge ? !complete
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
