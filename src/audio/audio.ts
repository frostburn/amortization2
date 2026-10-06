import startUrl from "../../sounds/854644__qubodup__machine-gun-burst-loop-start.wav?url";
import loopUrl from "../../sounds/854643__qubodup__machine-gun-burst-loop-middle-10-shots.wav?url";
import endUrl from "../../sounds/854642__qubodup__machine-gun-burst-loop-end.wav?url";
import blastUrl from "../../sounds/855893__qubodup__blast.flac?url";
import rifleNearUrl from "../../sounds/855602__qubodup__sniper-shot-from-wood-and-metal-post-1-ga-precision-m40a6.flac?url";
import rifleFarUrl from "../../sounds/855606__qubodup__sniper-shot-in-field-1-m2010-enhanced-sniper-rifle-esr.flac?url";
import rifleReloadUrl from "../../sounds/855601__qubodup__putting.flac?url";
import pistolUrl from "../../sounds/854226__qubodup__m4a1-rifle-shot-5.wav?url";
import minigunUpUrl from "../../sounds/minigun/spin-up.wav?url";
import minigunMotorUrl from "../../sounds/minigun/motor-loop.wav?url";
import minigunDownUrl from "../../sounds/minigun/spin-down.wav?url";
import minigunStartUrl from "../../sounds/minigun/fire-start.wav?url";
import minigunLoopUrl from "../../sounds/minigun/fire-loop.wav?url";
import minigunTailUrl from "../../sounds/minigun/fire-tail.wav?url";
import impact1Url from "../../sounds/minigun/impact-1.wav?url";
import impact2Url from "../../sounds/minigun/impact-2.wav?url";
import impact3Url from "../../sounds/minigun/impact-3.wav?url";
import flybyUrl from "../../sounds/855248__qubodup__real-bullet-flyby-sound.flac?url";
import { MINIGUN, clamp, type Vec2, type Vec3 } from "../game/config";
import type { GameEvent, Simulation } from "../game/simulation";
import { rifleMix, spatialPan } from "./spatial";

type Voice = {
  start: AudioBufferSourceNode;
  loop: AudioBufferSourceNode;
  gain: GainNode;
  pan: StereoPannerNode;
};
type Layer = { sources: AudioBufferSourceNode[]; gain: GainNode; pan: StereoPannerNode };
type RotaryVoice = { motor: Layer; phase: "up" | "down"; fire?: Layer; spin: number };
type CartMotor = { sources: OscillatorNode[]; gain: GainNode; pan: StereoPannerNode; filter: BiquadFilterNode };

export class RangeAudio {
  context?: AudioContext;
  private master?: GainNode;
  private effects?: DynamicsCompressorNode;
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Map<number, Voice>();
  private rotary = new Map<number, RotaryVoice>();
  private cartMotors = new Map<number, CartMotor>();
  private transients = new Set<AudioScheduledSourceNode>();
  private pending?: Promise<void>;
  private noise?: AudioBuffer;
  muted = false;
  volume = 0.6;
  failed = false;
  ready = false;
  private listener: Vec3 = { x: 0, y: 28, z: 35.5 };
  private listenerRight: Vec2 = { x: 1, z: 0 };
  private lastRifle?: ReturnType<typeof rifleMix>;
  private pistolShots = 0;
  private impactSerial = 0;
  private nextImpact = 0;
  private nextFlyby = 0;

  setListener(position: Vec3, right: Vec2 = { x: 1, z: 0 }) {
    this.listener = { ...position };
    this.listenerRight = { ...right };
  }

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
        rifleNear: rifleNearUrl,
        rifleFar: rifleFarUrl,
        rifleReload: rifleReloadUrl,
        pistol: pistolUrl,
        minigunUp: minigunUpUrl,
        minigunMotor: minigunMotorUrl,
        minigunDown: minigunDownUrl,
        minigunStart: minigunStartUrl,
        minigunLoop: minigunLoopUrl,
        minigunTail: minigunTailUrl,
        impact1: impact1Url,
        impact2: impact2Url,
        impact3: impact3Url,
        flyby: flybyUrl,
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
    pan.pan.value = spatialPan(position, this.listener, this.listenerRight);
    amp.connect(pan);
    pan.connect(this.effects!);
    return { amp, pan };
  }

  private sample(
    key: string,
    position: Vec3,
    gain: number,
    rate = 1,
    offset = 0,
  ) {
    const buffer = this.buffers.get(key);
    if (!buffer || !this.context) return;
    const { amp, pan } = this.bus(position, gain);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(amp);
    this.transients.add(source);
    source.onended = () => {
      this.transients.delete(source);
      source.disconnect();
      amp.disconnect();
      pan.disconnect();
    };
    source.start(0, offset);
  }

  update(sim: Simulation, paused: boolean) {
    if (!this.ready || !this.context) return;
    if (paused) {
      this.stop();
      return;
    }
    const firing = paused
      ? []
      : sim.actors.filter((a) => a.firing && !a.dead && a.weapon === "gun" && !!a.model);
    const automaticVoices = Math.max(1, firing.length + sim.actors.filter((a) => a.firing && !a.dead && a.weapon === "minigun").length);
    for (const id of this.voices.keys())
      if (!firing.some((a) => a.id === id))
        this.stopGun(
          id,
          sim.actors.find((a) => a.id === id)?.body.translation() ?? {
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
          spatialPan(position, this.listener, this.listenerRight),
          this.context.currentTime,
          0.05,
        );
        voice.gain.gain.setTargetAtTime(
          0.42 / Math.sqrt(automaticVoices) * this.distanceGain(position),
          this.context.currentTime,
          0.02,
        );
      }
    }
    const rotating = sim.actors.filter((a) => a.model && !a.dead && a.weapon === "minigun" && a.spin > 0);
    const normalization = 1 / Math.sqrt(Math.max(1, firing.length + rotating.filter((a) => a.firing).length));
    for (const [id, voice] of this.rotary) {
      if (rotating.some((a) => a.id === id)) continue;
      this.stopLayer(voice.motor);
      if (voice.fire) this.stopLayer(voice.fire);
      this.rotary.delete(id);
    }
    for (const a of rotating) {
      const position = a.body.translation(), phase = a.spooling ? "up" : "down";
      let voice = this.rotary.get(a.id);
      const gain = this.distanceGain(position) * normalization;
      if (!voice || voice.phase !== phase) {
        if (voice) this.stopLayer(voice.motor);
        const motor = this.startLayer(
          phase === "up" ? "minigunUp" : "minigunDown",
          phase === "up" ? "minigunMotor" : undefined,
          position, 0.3 * gain,
          phase === "up" ? a.spin * MINIGUN.windUp : (1 - a.spin) * MINIGUN.coast,
        );
        if (voice) { voice.motor = motor; voice.phase = phase; }
        else { voice = { motor, phase, spin: a.spin }; this.rotary.set(a.id, voice); }
      }
      voice.spin = a.spin;
      if (a.firing && !voice.fire)
        voice.fire = this.startLayer("minigunStart", "minigunLoop", position, 0.55 * gain);
      else if (!a.firing && voice.fire) {
        this.stopLayer(voice.fire, 0.003);
        voice.fire = undefined;
        this.sample("minigunTail", position, 0.45 * gain);
      }
      this.moveLayer(voice.motor, position, 0.3 * gain);
      if (voice.fire) this.moveLayer(voice.fire, position, 0.55 * gain);
    }
    this.updateCarts(sim);
  }

  private updateCarts(sim: Simulation) {
    const ctx = this.context!;
    const moving = (sim.city?.carts ?? []).filter(c => c.hp > 0 && Math.hypot(c.body.linvel().x, c.body.linvel().z) > 0.08)
      .sort((a, b) => {
        const pa = a.body.translation(), pb = b.body.translation();
        return Math.hypot(pa.x - this.listener.x, pa.z - this.listener.z) - Math.hypot(pb.x - this.listener.x, pb.z - this.listener.z);
      }).slice(0, 6);
    for (const [id, voice] of this.cartMotors) if (!moving.some(c => c.id === id)) {
      this.stopCart(voice); this.cartMotors.delete(id);
    }
    for (const c of moving) {
      const position = c.body.translation(), speed = Math.hypot(c.body.linvel().x, c.body.linvel().z);
      let voice = this.cartMotors.get(c.id);
      if (!voice) {
        const { amp, pan } = this.bus(position, 0);
        const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 1600;
        filter.connect(amp);
        const sources = [ctx.createOscillator(), ctx.createOscillator()];
        sources[0].type = "sine"; sources[1].type = "triangle";
        const harmonic = ctx.createGain(); harmonic.gain.value = 0.08; harmonic.connect(filter);
        sources[0].connect(filter); sources[1].connect(harmonic);
        sources.forEach(s => s.start());
        voice = { sources, gain: amp, pan, filter }; this.cartMotors.set(c.id, voice);
        sources[1].onended = () => { sources.forEach(s => s.disconnect()); harmonic.disconnect(); filter.disconnect(); amp.disconnect(); pan.disconnect(); };
      }
      const frequency = 150 + speed * 90 + (c.id % 7) * 5;
      voice.sources[0].frequency.setTargetAtTime(frequency, ctx.currentTime, 0.15);
      voice.sources[1].frequency.setTargetAtTime(frequency * 4.03, ctx.currentTime, 0.15);
      voice.gain.gain.setTargetAtTime(0.025 * Math.min(1, speed) * this.distanceGain(position), ctx.currentTime, 0.09);
      voice.pan.pan.setTargetAtTime(spatialPan(position, this.listener, this.listenerRight), ctx.currentTime, 0.08);
    }
  }
  private stopCart(voice: CartMotor) {
    const ctx = this.context!;
    voice.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.025);
    voice.sources.forEach(s => s.stop(ctx.currentTime + 0.12));
  }

  private startLayer(attack: string, loop: string | undefined, position: Vec3, gain: number, offset = 0): Layer {
    const ctx = this.context!, { amp, pan } = this.bus(position, gain);
    const first = ctx.createBufferSource();
    first.buffer = this.buffers.get(attack)!;
    const skip = clamp(offset, 0, first.buffer.duration - 1 / first.buffer.sampleRate);
    const sources = [first];
    first.connect(amp);
    first.start(ctx.currentTime, skip);
    if (loop) {
      const sustain = ctx.createBufferSource();
      sustain.buffer = this.buffers.get(loop)!;
      sustain.loop = true;
      sustain.connect(amp);
      sustain.start(ctx.currentTime + first.buffer.duration - skip);
      sources.push(sustain);
    }
    for (const source of sources) source.onended = () => source.disconnect();
    sources.at(-1)!.onended = () => {
      sources.at(-1)!.disconnect();
      amp.disconnect();
      pan.disconnect();
    };
    return { sources, gain: amp, pan };
  }
  private moveLayer(layer: Layer, position: Vec3, gain: number) {
    const now = this.context!.currentTime;
    layer.gain.gain.setTargetAtTime(gain, now, 0.02);
    layer.pan.pan.setTargetAtTime(spatialPan(position, this.listener, this.listenerRight), now, 0.04);
  }
  private stopLayer(layer: Layer, fade = 0.008) {
    const now = this.context!.currentTime;
    layer.gain.gain.cancelScheduledValues(now);
    layer.gain.gain.setTargetAtTime(0, now, fade / 3);
    for (const source of layer.sources) source.stop(now + fade);
  }

  private startGun(id: number, position: Vec3) {
    const ctx = this.context!;
    const { amp, pan } = this.bus(position, 0.42 * this.distanceGain(position));
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
  private stopGun(id: number, position: Vec3, tail = true) {
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
    if (tail) this.sample("end", position, 0.23 * this.distanceGain(position));
  }
  stop() {
    for (const id of this.voices.keys()) this.stopGun(id, { x: 0, y: 0, z: 0 }, false);
    for (const voice of this.rotary.values()) {
      this.stopLayer(voice.motor);
      if (voice.fire) this.stopLayer(voice.fire, 0.003);
    }
    this.rotary.clear();
    for (const voice of this.cartMotors.values()) this.stopCart(voice);
    this.cartMotors.clear();
    for (const source of this.transients) source.stop();
    this.transients.clear();
  }
  private distanceGain(position: Vec3) {
    const distance = Math.hypot(position.x - this.listener.x, position.y - this.listener.y, position.z - this.listener.z);
    return Math.pow(16 / Math.max(16, distance), 0.45);
  }

  private impact(position: Vec3, metal: boolean, strength = 1) {
    if (!this.context || !this.noise) return;
    const ctx = this.context,
      now = ctx.currentTime;
    // A dense volley should not create hundreds of overlapping collision voices.
    if (now < this.nextImpact) return;
    this.nextImpact = now + 0.025;
    strength *= this.distanceGain(position);
    if (metal) {
      this.sample(`impact${1 + this.impactSerial++ % 3}`, position, 0.23 * strength,
        0.92 + Math.random() * 0.16);
      return;
    }
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
    this.transients.add(source);
    source.onended = () => {
      this.transients.delete(source);
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
    this.transients.add(osc);
    osc.stop(now + seconds);
    osc.onended = () => {
      this.transients.delete(osc);
      osc.disconnect();
      amp.disconnect();
      pan.disconnect();
    };
  }
  event(e: GameEvent) {
    if (!this.ready) return;
    if (e.type === "shot") {
      if (e.weapon === "rifle") {
        const mix = rifleMix(e.from, this.listener, this.listenerRight);
        this.lastRifle = mix;
        // Equal-power mix; align the recordings' attacks without cutting their tails.
        if (mix.near > 0.001)
          this.sample("rifleNear", e.from, mix.gain * mix.near, 1, 0.005);
        if (mix.far > 0.001)
          this.sample("rifleFar", e.from, mix.gain * mix.far);
      } else if (e.weapon === "pistol") {
        // The supplied softer M4A1 one-shot stands in for the pistol recording.
        this.sample("pistol", e.from, 0.5 * this.distanceGain(e.from));
        this.pistolShots++;
      }
      if (e.impact)
        this.impact(e.to, e.material === "metal");
      this.flyby(e.from, e.to);
    } else if (e.type === "explosion") {
      this.sample("blast", e.position, 0.95, 0.97 + Math.random() * 0.06);
      this.tone(e.position, 75, 0.25, 0.35, 34);
    } else if (e.type === "bounce") this.impact(e.position, true, 0.6);
    else if (e.type === "throw") this.impact(e.position, true, 0.2);
    else if (e.type === "reload") {
      if (e.weapon === "rifle") this.sample("rifleReload", e.position, 0.5);
      else this.impact(e.position, true, 0.8);
    } else if (e.type === "down") this.tone(e.position, 155, 0.11, 0.28, 70);
  }
  private flyby(from: Vec3, to: Vec3) {
    if (!this.context || this.context.currentTime < this.nextFlyby) return;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const t = clamp(((this.listener.x - from.x) * dx + (this.listener.y - from.y) * dy +
      (this.listener.z - from.z) * dz) / (dx * dx + dy * dy + dz * dz || 1), 0, 1);
    const nearest = { x: from.x + t * dx, y: from.y + t * dy, z: from.z + t * dz };
    const distance = Math.hypot(nearest.x - this.listener.x, nearest.y - this.listener.y, nearest.z - this.listener.z);
    // Hear a pass only along the actual unobstructed segment, away from its muzzle.
    if (distance > 2.5 || t < 0.02 || Math.hypot(from.x - nearest.x, from.y - nearest.y, from.z - nearest.z) < 3) return;
    this.nextFlyby = this.context.currentTime + 0.12;
    this.sample("flyby", nearest, 0.13 * (1 - distance / 3));
  }
  inspect() {
    return {
      ready: this.ready,
      failed: this.failed,
      muted: this.muted,
      context: this.context?.state,
      buffers: [...this.buffers.keys()],
      loops: this.voices.size,
      cartMotors: this.cartMotors.size,
      miniguns: [...this.rotary].map(([actor, voice]) => ({ actor, phase: voice.phase, spin: voice.spin, firing: !!voice.fire })),
      transients: this.transients.size,
      impacts: this.impactSerial,
      rifle: this.lastRifle,
      pistolShots: this.pistolShots,
    };
  }
}
