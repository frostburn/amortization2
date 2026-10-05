import * as THREE from "three";
import { RIFLE, clamp } from "../game/config";
import type { Actor, Simulation } from "../game/simulation";

/** A full-field rifle view with an etched reticle fixed at the optical centre. */
export class SniperView {
  readonly camera = new THREE.PerspectiveCamera(12, 1, 0.06, RIFLE.range + 10);
  private overlay = new THREE.Scene();
  private overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  private visible = false;
  private operator?: Actor;
  private yaw = 0;
  private pitch = 0;
  invertX = false;
  invertY = false;
  private label = document.getElementById("scope-label")!;
  private field = document.getElementById("field")!;
  private material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      ink: { value: new THREE.Color(0xd3a24f) },
      aspect: { value: 1 },
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `uniform vec3 ink; uniform float aspect;
      varying vec2 vUv;
      void main() {
        vec2 p = abs(vUv - 0.5) * vec2(aspect, 1.0);
        float vertical = (1.0 - smoothstep(0.0006, 0.0015, p.x)) * step(0.009, p.y) * (1.0 - step(0.065, p.y));
        float horizontal = (1.0 - smoothstep(0.0006, 0.0015, p.y)) * step(0.009, p.x) * (1.0 - step(0.065, p.x));
        float dot = 1.0 - smoothstep(0.001, 0.0025, length(p));
        float mark = max(dot, max(vertical, horizontal));
        vec2 lens = (vUv - 0.5) * vec2(aspect, 1.0);
        float shade = smoothstep(0.43, 0.49, length(lens)) * 0.96;
        gl_FragColor = vec4(mix(vec3(0.01, 0.03, 0.03), ink, mark), max(mark, shade));
        #include <colorspace_fragment>
      }`,
  });

  constructor() {
    this.overlay.add(
      new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material),
    );
    this.label.hidden = true;
  }

  private orient(sim: Simulation) {
    const operator = sim.sniping && sim.rifleOperator;
    if (!operator) return;
    if (this.operator !== operator) {
      this.operator = operator;
      const p = operator.body.translation();
      const direction = new THREE.Vector3()
        .copy(sim.aim)
        .sub(new THREE.Vector3(p.x, p.y + 0.65, p.z))
        .normalize();
      this.yaw = Math.atan2(direction.x, direction.z);
      this.pitch = Math.asin(clamp(direction.y, -1, 1));
    }
    const direction = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    const p = operator.body.translation();
    this.camera.position.set(p.x, p.y + 0.65, p.z);
    this.camera.lookAt(this.camera.position.clone().add(direction));
    this.camera.updateMatrixWorld();
  }

  aim(sim: Simulation) {
    const operator = sim.sniping && sim.rifleOperator;
    if (!operator) return;
    this.orient(sim);
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    const origin = this.camera.position;
    const to = origin.clone().addScaledVector(direction, RIFLE.range);
    const hit = sim.ray(origin, to, operator.body);
    sim.aim = origin
      .clone()
      .addScaledVector(direction, hit?.timeOfImpact ?? RIFLE.range);
  }

  look(dx: number, dy: number, sim: Simulation, height: number) {
    if (!sim.sniping || (dx === 0 && dy === 0)) return;
    this.orient(sim);
    const sensitivity =
      THREE.MathUtils.degToRad(this.camera.fov) / Math.max(1, height);
    this.yaw -= dx * sensitivity * (this.invertX ? -1 : 1);
    this.pitch = clamp(
      this.pitch - dy * sensitivity * (this.invertY ? -1 : 1),
      -Math.PI * 0.47,
      Math.PI * 0.47,
    );
    this.aim(sim);
  }

  zoomBy(delta: number) {
    this.camera.fov = clamp(this.camera.fov * Math.exp(delta * 0.001), 6, 24);
  }
  resetSight() {
    this.operator = undefined;
  }

  render(
    renderer: THREE.WebGLRenderer,
    world: THREE.Scene,
    sim: Simulation,
    hiddenObjects: THREE.Object3D[],
    enabled: boolean,
  ) {
    const operator = enabled && sim.sniping && sim.rifleOperator;
    this.visible = !!operator;
    this.field.classList.toggle("sniping", this.visible);
    renderer.domElement.classList.toggle("sniping", this.visible);
    const captured = document.pointerLockElement === renderer.domElement;
    renderer.domElement.classList.toggle(
      "mouse-captured",
      this.visible && captured,
    );
    this.label.hidden = !this.visible;
    if (!operator) {
      this.operator = undefined;
      return false;
    }

    const width = renderer.domElement.clientWidth,
      height = renderer.domElement.clientHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.orient(sim);
    this.material.uniforms.aspect.value = this.camera.aspect;
    const ready = operator.braceTime >= RIFLE.settle && operator.reload === 0;
    this.material.uniforms.ink.value.setHex(ready ? 0x9be6cd : 0xd3a24f);
    this.label.dataset.state = ready ? "ready" : "unsteady";
    const heightDifference = sim.aim.y - this.camera.position.y;
    const range = this.camera.position.distanceTo(
      new THREE.Vector3().copy(sim.aim),
    );
    this.label.textContent = `NEEDLE · ${Math.round(range)} m · HEIGHT ${heightDifference >= 0 ? "+" : ""}${heightDifference.toFixed(1)} m · ${operator.reload > 0 ? "RELOADING" : ready ? "BRACED" : "SETTLING"}${captured ? "" : " · CLICK TO CAPTURE"}`;

    const visibility = hiddenObjects.map((o) => o.visible);
    hiddenObjects.forEach((o) => (o.visible = false));
    renderer.render(world, this.camera);
    hiddenObjects.forEach((o, i) => (o.visible = visibility[i]));
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.overlay, this.overlayCamera);
    renderer.autoClear = true;
    return true;
  }

  inspect() {
    return {
      visible: this.visible,
      fov: this.camera.fov,
      yaw: this.yaw,
      pitch: this.pitch,
      invertX: this.invertX,
      invertY: this.invertY,
    };
  }
}
