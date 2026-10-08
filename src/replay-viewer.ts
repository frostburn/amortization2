import "./replay-viewer.css";
import { STEP } from "./game/config";
import { readHumanReplay, replaySnapshot, type HumanReplay, type ReplayView } from "./game/replay";
import { ReplayPlayback } from "./game/replay-playback";
import { Simulation } from "./game/simulation";
import type { RangeScene } from "./render/scene";
import type { RangeAudio } from "./audio/audio";

/** Loaded exclusively by Vite's development branch. Imported files stay local. */
export class ReplayViewer {
  private playback?: ReplayPlayback;
  private replay?: HumanReplay;
  private playing = false;
  private seeking: number | null = null;
  private clock = 0;
  private nextRender = 0;
  private attempt = 0;
  private loading = false;
  private checkedEnd = false;
  private views: { tick: number; data: ReplayView }[] = [];
  private panel = document.createElement("section");
  private file = document.createElement("input");
  private get play() { return this.panel.querySelector<HTMLButtonElement>("[data-play]")!; }
  private get timeline() { return this.panel.querySelector<HTMLInputElement>("[data-time]")!; }
  private get status() { return this.panel.querySelector<HTMLElement>("[data-status]")!; }
  private get speed() { return Number(this.panel.querySelector<HTMLSelectElement>("[data-speed]")!.value); }
  get active() { return !!this.playback; }
  constructor(private scene: RangeScene, private audio: RangeAudio, private hooks: {
    enter(sim: Simulation): void; leave(): void; hud(sim: Simulation): void; error(message: string): void;
  }) {
    this.panel.id = "replay-viewer";
    this.panel.hidden = true;
    this.panel.setAttribute("aria-label", "Development replay viewer");
    this.panel.innerHTML = `<div class="replay-heading"><strong>REPLAY</strong><span data-name></span><button data-close>EXIT REPLAY</button></div>
      <div class="replay-transport"><button data-back aria-label="Seek back five seconds">−5 s</button><button data-play>PLAY</button><button data-forward aria-label="Seek forward five seconds">+5 s</button>
      <label>Attempt <select data-attempt aria-label="Replay attempt"></select></label>
      <label>Speed <select data-speed aria-label="Playback speed"><option value="0.25">¼×</option><option value="0.5">½×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
      <output data-clock></output></div><input data-time type="range" min="0" step="1" value="0" aria-label="Replay time">
      <small data-status></small>`;
    document.body.append(this.panel);
    this.file.type = "file";
    this.file.accept = ".json,application/json";
    this.file.hidden = true;
    this.file.id = "replay-file";
    document.body.append(this.file);
    for (const button of document.querySelectorAll("[data-open-replay]"))
      button.addEventListener("click", () => this.file.click());
    this.file.addEventListener("change", () => {
      const file = this.file.files?.[0];
      this.file.value = "";
      if (!file || this.loading) return;
      this.loading = true;
      void (async () => {
        if (file.size > 64 * 1024 * 1024) throw new Error("Replay file exceeds 64 MB");
        await this.open(JSON.parse(await file.text()), file.name);
      })().catch(error => this.hooks.error(`Cannot view replay: ${error instanceof Error ? error.message : String(error)}`))
        .finally(() => { this.loading = false; });
    });
    this.play.addEventListener("click", () => void this.toggle());
    this.panel.querySelector("[data-close]")!.addEventListener("click", () => this.close());
    this.panel.querySelector("[data-back]")!.addEventListener("click", () => this.seek((this.playback?.tick ?? 0) - 5 / STEP));
    this.panel.querySelector("[data-forward]")!.addEventListener("click", () => this.seek((this.playback?.tick ?? 0) + 5 / STEP));
    this.timeline.addEventListener("input", () => this.seek(Number(this.timeline.value)));
    this.panel.querySelector("[data-attempt]")!.addEventListener("change", event => {
      this.switchAttempt(Number((event.target as HTMLSelectElement).value));
    });
    this.panel.querySelector("[data-speed]")!.addEventListener("change", () => { this.clock = 0; });
  }
  async open(value: unknown, name = "Human replay") {
    const replay = readHumanReplay(value);
    if (!replay.sessions.length) throw new Error("Replay has no recorded attempts");
    // Allocate and validate before touching the live game or an existing viewer.
    const sim = await Simulation.create(replay.sessions[0].range, replay.sessions[0].fourthModel);
    let playback: ReplayPlayback;
    try { playback = new ReplayPlayback(sim, replay.sessions[0]); }
    catch (error) { sim.world.free(); throw error; }
    this.close();
    this.replay = replay;
    this.playback = playback;
    this.attempt = 0;
    this.hooks.enter(sim);
    document.body.classList.add("viewing-replay");
    this.panel.hidden = false;
    this.panel.querySelector("[data-name]")!.textContent = name;
    const select = this.panel.querySelector<HTMLSelectElement>("[data-attempt]")!;
    select.replaceChildren(...replay.sessions.map((session, i) => {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = `${i + 1} · ${session.range}`;
      return option;
    }));
    this.prepare();
    this.play.focus();
  }
  private prepare() {
    this.pause();
    this.seeking = null;
    this.checkedEnd = false;
    this.nextRender = 0;
    const session = this.playback!.session;
    this.views = session.views.filter(v => v && Number.isInteger(v.tick) && v.tick >= 0 && v.tick <= session.endTick &&
      v.data && v.data.camera && typeof v.data.camera === "object" && v.data.scope && typeof v.data.scope === "object")
      .map(v => ({ tick: v.tick, data: v.data })).sort((a, b) => a.tick - b.tick);
    this.timeline.max = String(session.endTick);
    this.status.textContent = `Recorded camera · revision ${String(this.replay!.revision ?? "unknown")} · resimulated with current code${this.replay!.stopReason ? " · partial capture" : ""}`;
    this.scene.resetEnvironment();
    this.scene.resetDynamic();
    this.scene.resetCamera();
    this.refresh();
  }
  private switchAttempt(index: number) {
    if (!this.replay || !this.playback || !Number.isInteger(index) || !this.replay.sessions[index]) return;
    this.attempt = index;
    this.playback = new ReplayPlayback(this.playback.sim, this.replay.sessions[index]);
    this.prepare();
  }
  pause() {
    this.playing = false;
    this.clock = 0;
    this.audio.stop();
    this.play.textContent = "PLAY";
  }
  async toggle() {
    if (!this.playback || this.seeking !== null) return;
    if (this.playing) { this.pause(); return; }
    if (this.playback.tick === this.playback.session.endTick) {
      this.seek(0);
      this.seeking = null;
      this.status.textContent = "Recorded camera · resimulated with current code";
    }
    const playback = this.playback;
    try { await this.audio.unlock(); }
    catch { this.audio.failed = true; }
    if (this.playback !== playback || this.seeking !== null) return;
    this.playing = true;
    this.play.textContent = "PAUSE";
  }
  seek(tick: number) {
    if (!this.playback || !Number.isFinite(tick)) return;
    this.pause();
    this.seeking = Math.max(0, Math.min(this.playback.session.endTick, Math.round(tick)));
    this.checkedEnd = false;
    if (this.seeking < this.playback.tick) {
      this.playback.rewind();
      this.scene.resetEnvironment();
    }
    this.playback.sim.events.length = 0;
    this.scene.resetDynamic();
    this.status.textContent = "Seeking…";
    this.refresh();
  }
  close() {
    if (!this.playback) return;
    this.pause();
    const sim = this.playback.sim;
    this.playback = undefined;
    this.replay = undefined;
    this.seeking = null;
    this.panel.hidden = true;
    document.body.classList.remove("viewing-replay");
    this.hooks.leave();
    sim.world.free();
  }
  inspect() {
    return { active: this.active, playing: this.playing, seeking: this.seeking,
      tick: this.playback?.tick ?? 0, endTick: this.playback?.session.endTick ?? 0,
      attempt: this.attempt, speed: this.speed, status: this.status.textContent };
  }
  private refresh() {
    if (!this.playback) return;
    const { tick, session } = this.playback;
    const format = (tick: number) => `${Math.floor(tick * STEP / 60)}:${(tick * STEP % 60).toFixed(1).padStart(4, "0")}`;
    this.panel.querySelector("[data-clock]")!.textContent = `${format(tick)} / ${format(session.endTick)}`;
    this.timeline.value = String(this.seeking ?? tick);
    this.play.disabled = this.seeking !== null;
    // Last observation at this simulation tick wins (paused wall time is skipped).
    let view: ReplayView | undefined;
    for (const entry of this.views) { if (entry.tick > tick) break; view = entry.data; }
    if (view) {
      this.scene.restoreCamera(view.camera);
      this.scene.scope.restore(view.scope, this.playback.sim);
    }
    this.hooks.hud(this.playback.sim);
  }
  frame(delta: number, now: number) {
    if (!this.playback) return;
    const sim = this.playback.sim;
    try {
      if (this.seeking !== null) {
        if (this.playback.advanceTo(this.seeking, 120, 8, true)) {
          this.seeking = null;
          this.status.textContent = "Paused · recorded camera · resimulated with current code";
        }
      } else if (this.playing) {
        this.clock += delta * this.speed;
        const steps = Math.floor(this.clock / STEP);
        const before = this.playback.tick;
        this.playback.advanceTo(before + steps, 24, 8);
        this.clock -= (this.playback.tick - before) * STEP;
        this.clock = Math.min(this.clock, .5);
        for (const event of sim.events.splice(0)) { this.scene.event(event); this.audio.event(event); }
      } else sim.events.length = 0;
      if (this.seeking === null && this.playback.tick === this.playback.session.endTick && !this.checkedEnd) {
        this.pause();
        this.checkedEnd = true;
        const actual = replaySnapshot(sim), expected = this.playback.session.final;
        const matches = actual.shots === expected.shots && actual.hits === expected.hits && actual.throws === expected.throws &&
          actual.actors.length === expected.actors.length && actual.actors.every(a => {
            const e = expected.actors.find(e => e.id === a.id);
            return !!e && a.hp === e.hp && a.ammo === e.ammo && Math.hypot(a.position.x - e.position.x, a.position.y - e.position.y, a.position.z - e.position.z) <= .02;
          });
        this.status.textContent = matches ? "End · combat and robot positions match the capture" : "End · current code differs from this capture; see inspect:replay for details";
      }
    } catch (error) {
      this.pause(); this.seeking = null;
      this.status.textContent = error instanceof Error ? error.message : String(error);
    }
    this.refresh();
    this.audio.setListener(this.scene.listenerPosition, this.scene.listenerRight);
    this.audio.update(sim, !this.playing || this.seeking !== null);
    // Seeking shows progress over the last frame; redraw once the seek completes.
    if (this.seeking === null && (this.playing || now >= this.nextRender)) {
      this.scene.updateAim({ ...sim.aim, y: 0 }, !sim.sniping);
      // Scope remains visible when playback is paused; delta freezes visual effects.
      this.scene.render(1, this.playing ? delta : 0, sim.time, false);
      this.nextRender = now + 250;
    }
  }
}
