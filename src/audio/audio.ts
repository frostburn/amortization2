import startUrl from "../../sounds/854644__qubodup__machine-gun-burst-loop-start.wav?url";
import loopUrl from "../../sounds/854643__qubodup__machine-gun-burst-loop-middle-10-shots.wav?url";
import endUrl from "../../sounds/854642__qubodup__machine-gun-burst-loop-end.wav?url";
import blastUrl from "../../sounds/855893__qubodup__blast.flac?url";
import { clamp, type Vec3 } from "../game/config";
import type { GameEvent, Simulation } from "../game/simulation";

type Voice = {
  start: AudioBufferSourceNode;
  loop: AudioBufferSourceNode;
  gain: GainNode;
  pan: StereoPannerNode;
};

export class RangeAudio {
  context?: AudioContext;
  private master?: GainNode;
  private effects?: DynamicsCompressorNode;
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Map<number, Voice>();
  private pending?: Promise<void>;
  private noise?: AudioBuffer;
  muted = false;
  volume = 0.6;
  failed = false;
  ready = false;

  async unlock() {
    if (this.context) {
      await this.context.resume();
      return this.pending;
    }
    this.context = new AudioContext();
    const ctx = this.context;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);
    this.effects = ctx.createDynamicsCompressor();
    this.effects.threshold.value = -8;
    this.effects.knee.value = 8;
    this.effects.ratio.value = 8;
    this.effects.attack.value = 0.003;
    this.effects.release.value = 0.15;
    this.effects.connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.pending = Promise.all(
      Object.entries({
        start: startUrl,
        loop: loopUrl,
        end: endUrl,
        blast: blastUrl,
      }).map(async ([key, url]) => {
        const response = await fetch(url);
        if (!response.ok)
          throw new Error(`Audio load failed: ${response.status}`);
        this.buffers.set(
          key,
          await ctx.decodeAudioData(await response.arrayBuffer()),
        );
      }),
    )
      .then(() => {
        this.ready = true;
      })
      .catch((error) => {
        this.failed = true;
        console.error("Range audio:", error);
      });
    await ctx.resume();
    return this.pending;
  }

  setVolume(volume: number) {
    this.volume = clamp(volume, 0, 1);
    if (this.context && this.master)
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : this.volume,
        this.context.currentTime,
        0.015,
      );
  }
  setMuted(value: boolean) {
    this.muted = value;
    this.setVolume(this.volume);
  }

  private bus(position: Vec3, gain: number) {
    const ctx = this.context!;
    const amp = ctx.createGain();
    amp.gain.value = gain;
    const pan = ctx.createStereoPanner();
    pan.pan.value = clamp(position.x / 28, -0.8, 0.8);
    amp.connect(pan);
    pan.connect(this.effects!);
    return { amp, pan };
  }

  private sample(key: string, position: Vec3, gain: number, rate = 1) {
    const buffer = this.buffers.get(key);
    if (!buffer || !this.context) return;
    const { amp, pan } = this.bus(position, gain);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(amp);
    source.onended = () => {
      source.disconnect();
      amp.disconnect();
      pan.disconnect();
    };
    source.start();
  }

  update(sim: Simulation, paused: boolean) {
    if (!this.ready || !this.context) return;
    const firing = paused ? [] : sim.squad.filter((a) => a.firing && !a.dead);
    for (const id of this.voices.keys())
      if (!firing.some((a) => a.id === id))
        this.stopGun(
          id,
          sim.squad.find((a) => a.id === id)?.body.translation() ?? {
            x: 0,
            y: 0,
            z: 0,
          },
        );
    for (const a of firing) {
      const position = a.body.translation();
      if (!this.voices.has(a.id)) this.startGun(a.id, position);
      const voice = this.voices.get(a.id);
      if (voice) {
        voice.pan.pan.setTargetAtTime(
          clamp(position.x / 28, -0.8, 0.8),
          this.context.currentTime,
          0.05,
        );
        voice.gain.gain.setTargetAtTime(
          0.42 / Math.sqrt(firing.length),
          this.context.currentTime,
          0.02,
        );
      }
    }
  }

  private startGun(id: number, position: Vec3) {
    const ctx = this.context!;
    const { amp, pan } = this.bus(position, 0.42);
    const start = ctx.createBufferSource();
    start.buffer = this.buffers.get("start")!;
    const loop = ctx.createBufferSource();
    loop.buffer = this.buffers.get("loop")!;
    loop.loop = true;
    start.connect(amp);
    loop.connect(amp);
    start.start();
    loop.start(ctx.currentTime + start.buffer.duration);
    start.onended = () => start.disconnect();
    this.voices.set(id, { start, loop, gain: amp, pan });
  }
  private stopGun(id: number, position: Vec3) {
    const voice = this.voices.get(id);
    if (!voice || !this.context) return;
    const now = this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, 0.006);
    voice.start.stop(now + 0.035);
    voice.loop.stop(now + 0.035);
    voice.loop.onended = () => {
      voice.loop.disconnect();
      voice.gain.disconnect();
      voice.pan.disconnect();
    };
    this.voices.delete(id);
    this.sample("end", position, 0.23);
  }
  stop() {
    for (const id of this.voices.keys()) this.stopGun(id, { x: 0, y: 0, z: 0 });
  }

  private impact(position: Vec3, metal: boolean, strength = 1) {
    if (!this.context || !this.noise) return;
    const ctx = this.context,
      now = ctx.currentTime;
    const { amp, pan } = this.bus(position, 0.12 * strength);
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = metal ? 1900 : 900;
    filter.Q.value = 0.6;
    amp.gain.setValueAtTime(0.12 * strength, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    source.connect(filter);
    filter.connect(amp);
    source.start(now, Math.random() * 0.5, 0.12);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      amp.disconnect();
      pan.disconnect();
    };
    if (metal)
      this.tone(position, 390 + Math.random() * 120, 0.035 * strength, 0.16);
  }
  private tone(
    position: Vec3,
    frequency: number,
    strength: number,
    seconds: number,
    endFrequency = frequency * 0.84,
  ) {
    if (!this.context) return;
    const ctx = this.context,
      now = ctx.currentTime;
    const { amp, pan } = this.bus(position, strength);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(endFrequency, now + seconds);
    amp.gain.setValueAtTime(strength, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    osc.connect(amp);
    osc.start();
    osc.stop(now + seconds);
    osc.onended = () => {
      osc.disconnect();
      amp.disconnect();
      pan.disconnect();
    };
  }
  event(e: GameEvent) {
    if (!this.ready) return;
    if (e.type === "shot") {
      if (e.hit || Math.random() < 0.3)
        this.impact(e.to, e.material === "metal");
    } else if (e.type === "explosion") {
      this.sample("blast", e.position, 0.95, 0.97 + Math.random() * 0.06);
      this.tone(e.position, 75, 0.25, 0.35, 34);
    } else if (e.type === "bounce") this.impact(e.position, true, 0.6);
    else if (e.type === "throw") this.impact(e.position, true, 0.2);
    else if (e.type === "reload") {
      this.impact(e.position, true, 0.8);
    } else if (e.type === "down") this.tone(e.position, 155, 0.11, 0.28, 70);
  }
  inspect() {
    return {
      ready: this.ready,
      failed: this.failed,
      muted: this.muted,
      context: this.context?.state,
      buffers: [...this.buffers.keys()],
      loops: this.voices.size,
    };
  }
}
