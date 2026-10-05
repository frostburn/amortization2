import * as THREE from "three";
import { RIFLE, clamp } from "../game/config";
import type { Actor, Simulation } from "../game/simulation";

/** A second perspective into the same world, composited into a circular viewport. */
export class SniperScope {
  readonly camera = new THREE.PerspectiveCamera(7, 1, 0.06, RIFLE.range + 10);
  private target = new THREE.WebGLRenderTarget(512, 512);
  private overlay = new THREE.Scene();
  private overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  private anchor = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private tracking = false;
  private bounds?: { x: number; y: number; size: number };
  private operator?: Actor;
  private label = document.getElementById("scope-label")!;
  private material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      view: { value: this.target.texture },
      reticle: { value: new THREE.Vector2(0.5, 0.5) },
      ink: { value: new THREE.Color(0xd3a24f) },
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `uniform sampler2D view; uniform vec2 reticle; uniform vec3 ink;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5);
        if (r > 0.5) discard;
        vec3 color = texture2D(view, vUv).rgb;
        color *= 1.0 - smoothstep(0.27, 0.49, r) * 0.5;
        float rim = smoothstep(0.478, 0.484, r) * (1.0 - smoothstep(0.491, 0.498, r));
        vec2 p = abs(vUv - reticle);
        float vertical = (1.0 - smoothstep(0.0012, 0.0025, p.x)) * step(0.012, p.y) * (1.0 - step(0.15, p.y));
        float horizontal = (1.0 - smoothstep(0.0012, 0.0025, p.y)) * step(0.012, p.x) * (1.0 - step(0.15, p.x));
        float dot = 1.0 - smoothstep(0.002, 0.004, length(p));
        color = mix(color, ink, max(rim, max(dot, max(vertical, horizontal))));
        gl_FragColor = vec4(color, 1.0 - smoothstep(0.495, 0.5, r));
        #include <colorspace_fragment>
      }`,
  });

  constructor() {
    this.overlay.add(
      new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material),
    );
    this.label.hidden = true;
  }

  contains(x: number, y: number) {
    const b = this.bounds;
    return (
      !!b &&
      Math.hypot(x - b.x - b.size / 2, y - b.y - b.size / 2) < b.size * 0.475
    );
  }

  pick(x: number, y: number, sim: Simulation) {
    if (
      !this.contains(x, y) ||
      !this.operator ||
      this.operator !== sim.rifleOperator ||
      !this.bounds
    ) {
      this.tracking = false;
      return null;
    }
    if (!this.tracking) this.anchor.copy(sim.aim);
    this.tracking = true;
    const b = this.bounds;
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((x - b.x) / b.size) * 2 - 1,
        1 - ((y - b.y) / b.size) * 2,
      ),
      this.camera,
    );
    const ray = this.raycaster.ray;
    const hit = sim.ray(
      ray.origin,
      ray.origin.clone().addScaledVector(ray.direction, RIFLE.range),
      this.operator.body,
    );
    const aim = ray.origin
      .clone()
      .addScaledVector(ray.direction, hit?.timeOfImpact ?? RIFLE.range);
    const actor =
      hit && sim.actors.find((a) => a.collider.handle === hit.collider.handle);
    return {
      aim,
      ground: { x: aim.x, y: 0, z: aim.z },
      actor: actor?.id,
      scope: true,
    };
  }

  render(
    renderer: THREE.WebGLRenderer,
    world: THREE.Scene,
    mainCamera: THREE.OrthographicCamera,
    sim: Simulation,
    hiddenObjects: THREE.Object3D[],
    enabled: boolean,
  ) {
    const a = sim.weapon === "rifle" ? sim.rifleOperator : undefined;
    const width = renderer.domElement.clientWidth,
      height = renderer.domElement.clientHeight;
    const ppm = width / (mainCamera.right - mainCamera.left);
    const position =
      a && new THREE.Vector3().copy(a.body.translation()).project(mainCamera);
    if (
      !enabled ||
      !a ||
      !position ||
      ppm < 42 ||
      Math.abs(position.x) > 0.92 ||
      Math.abs(position.y) > 0.9
    ) {
      this.bounds = undefined;
      this.operator = undefined;
      this.tracking = false;
      this.label.hidden = true;
      return;
    }
    this.operator = a;
    const size = Math.min(300, width - 32, height - 90);
    const robotX = ((position.x + 1) * width) / 2,
      robotY = ((1 - position.y) * height) / 2;
    const x = clamp(
      robotX + 70 + size < width - 8 ? robotX + 70 : robotX - size - 70,
      8,
      width - size - 8,
    );
    const y = clamp(robotY - size * 0.65, 12, height - size - 44);
    this.bounds = { x, y, size };
    if (!this.tracking) this.anchor.copy(sim.aim);
    this.camera.position.copy(sim.muzzle(a));
    this.camera.lookAt(this.anchor);
    this.camera.updateMatrixWorld();
    const direction = sim.rifleDirection(a);
    const shot = this.camera.position
      .clone()
      .addScaledVector(
        new THREE.Vector3(direction.x, direction.y, direction.z),
        RIFLE.range,
      )
      .project(this.camera);
    this.material.uniforms.reticle.value.set(
      (shot.x + 1) / 2,
      (shot.y + 1) / 2,
    );
    const ready = a.braced && a.braceTime >= RIFLE.settle && a.reload === 0;
    this.material.uniforms.ink.value.setHex(ready ? 0x9be6cd : 0xd3a24f);
    this.label.hidden = false;
    this.label.style.left = `${x}px`;
    this.label.style.top = `${y + size + 2}px`;
    this.label.style.width = `${size}px`;
    this.label.dataset.state = ready ? "ready" : "unsteady";
    this.label.textContent = `NEEDLE · ${Math.round(Math.hypot(sim.aim.x - a.body.translation().x, sim.aim.z - a.body.translation().z))} m · ${a.reload > 0 ? "RELOADING" : ready ? "BRACED" : a.braced ? "SETTLING" : "HOLD SPACE"}`;

    const visibility = hiddenObjects.map((o) => o.visible);
    hiddenObjects.forEach((o) => (o.visible = false));
    const shadowUpdate = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.render(world, this.camera);
    renderer.setRenderTarget(null);
    renderer.shadowMap.autoUpdate = shadowUpdate;
    hiddenObjects.forEach((o, i) => (o.visible = visibility[i]));
    renderer.setViewport(x, height - y - size, size, size);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.overlay, this.overlayCamera);
    renderer.autoClear = true;
    renderer.setViewport(0, 0, width, height);
  }

  inspect() {
    return {
      visible: !!this.bounds,
      bounds: this.bounds,
      operator: this.operator?.id,
    };
  }
}
