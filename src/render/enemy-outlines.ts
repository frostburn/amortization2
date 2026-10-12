import * as THREE from "three";

const MIN_COVERAGE = .3, RELEASE_COVERAGE = .25;
const GRID = 8, QUERY_BUDGET = 2;
type Part = { source: THREE.Mesh; mask: THREE.Mesh; outline: THREE.Mesh; depth: THREE.Mesh };
type Coverage = {
  parts: Part[]; hidden: boolean; fraction: number; camera?: THREE.Camera;
  pending?: { queries: WebGLQuery[]; self: WebGLQuery[]; position: THREE.Vector3; direction: THREE.Vector3 };
};

/** Camera readability only: render the hidden contour against the world depth.
 * A stencil of the actual articulated silhouettes removes internal seams and
 * prevents visible robots from outlining their own back faces. No district ray queries,
 * cloned geometry, extra world render, or changes to combat line of sight.
 * Sparse silhouette probes use asynchronous GPU depth queries: tiny contacts
 * at the ground cannot enable a contour for an otherwise visible chassis. */
export class EnemyOutlines {
  private maskScene = new THREE.Scene();
  private outlineScene = new THREE.Scene();
  private mask = new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: false, depthTest: false,
    side: THREE.DoubleSide, stencilWrite: true, stencilRef: 1,
    stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
  });
  private outline = new THREE.ShaderMaterial({
    depthWrite: false, depthTest: true, depthFunc: THREE.GreaterDepth,
    side: THREE.BackSide, stencilWrite: true, stencilRef: 1,
    stencilFunc: THREE.NotEqualStencilFunc, toneMapped: false,
    uniforms: { resolution: { value: new THREE.Vector2(1, 1) }, ink: { value: new THREE.Color(0xef9a64) } },
    vertexShader: `uniform vec2 resolution;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec2 direction = (projectionMatrix * vec4(normalMatrix * normal, 0.0)).xy;
        float length = length(direction);
        if (length > 0.0001) clip.xy += direction / length * 3.0 / resolution * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: `uniform vec3 ink;
      void main() {
        gl_FragColor = vec4(ink, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  private actors = new Map<THREE.Object3D, Coverage>();
  private probes = new THREE.Scene();
  private selfScene = new THREE.Scene();
  private selfDepth = new THREE.WebGLRenderTarget(1, 1, { stencilBuffer: true });
  private selfMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
  private probeMaterial = new THREE.PointsMaterial({ colorWrite: false, depthWrite: false,
    depthFunc: THREE.GreaterDepth, sizeAttenuation: false });
  private gl?: WebGL2RenderingContext;
  private next = 0;
  private ray = new THREE.Raycaster();
  private bounds = new THREE.Box3();
  private box = new THREE.Box3();
  private point = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private ndc = new THREE.Vector2();
  private frustum = new THREE.Frustum();
  private projection = new THREE.Matrix4();
  private normalMatrix = new THREE.Matrix3();
  private surface = new THREE.Plane();
  private normal = new THREE.Vector3();
  private neighbor = new THREE.Vector3();
  private probePool: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>[] = [];

  constructor() {
    // Bias to the nearest depth within a pixel on this surface, so MSAA does not
    // treat the chassis's own sloping face as an occluder of its centre sample.
    this.probeMaterial.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float depthBias;")
        .replace("#include <project_vertex>", "#include <project_vertex>\ngl_Position.z -= depthBias * gl_Position.w;");
    };
  }

  add(root: THREE.Object3D) {
    const parts: Part[] = [];
    root.traverse(source => {
      if (!(source instanceof THREE.Mesh)) return;
      const mask = new THREE.Mesh(source.geometry, this.mask), outline = new THREE.Mesh(source.geometry, this.outline);
      const depth = new THREE.Mesh(source.geometry, this.selfMaterial);
      mask.matrixAutoUpdate = outline.matrixAutoUpdate = depth.matrixAutoUpdate = false;
      this.maskScene.add(mask); this.outlineScene.add(outline);
      parts.push({ source, mask, outline, depth });
    });
    this.actors.set(root, { parts, hidden: false, fraction: 0 });
  }

  remove(root: THREE.Object3D) {
    const actor = this.actors.get(root);
    if (!actor) return;
    this.cancel(actor);
    for (const part of actor.parts) { part.mask.removeFromParent(); part.outline.removeFromParent(); part.depth.removeFromParent(); }
    this.actors.delete(root);
  }

  private cancel(actor: Coverage) {
    if (!actor.pending) return;
    for (const query of [...(actor.pending?.queries ?? []), ...(actor.pending?.self ?? [])]) this.gl?.deleteQuery(query);
    actor.pending = undefined;
  }

  private poll(actor: Coverage, camera: THREE.Camera) {
    const pending = actor.pending;
    if (!pending || !this.gl || ![...pending.queries, ...pending.self].every(q => this.gl!.getQueryParameter(q, this.gl!.QUERY_RESULT_AVAILABLE))) return;
    // Ignore results from before a large camera jump. Small pans keep the last
    // classification until refreshed instead of flashing contours off every frame.
    if (camera.position.distanceTo(pending.position) < 3 && this.direction.dot(pending.direction) > .98) {
      const valid = pending.queries.filter((_, i) => !this.gl!.getQueryParameter(pending.self[i], this.gl!.QUERY_RESULT));
      actor.fraction = valid.length >= 3 ? valid.filter(q => this.gl!.getQueryParameter(q, this.gl!.QUERY_RESULT)).length / valid.length : 0;
      actor.hidden = actor.fraction >= (actor.hidden ? RELEASE_COVERAGE : MIN_COVERAGE);
    } else { actor.hidden = false; actor.fraction = 0; }
    this.cancel(actor);
  }

  /** Sample the actual front-facing surface at a screen-space grid. Ray tests
   * touch only this robot's small mesh, never the district or instanced trees. */
  private sample(actor: Coverage, camera: THREE.Camera, renderer: THREE.WebGLRenderer) {
    const gl = this.gl!, resolution = this.outline.uniforms.resolution.value as THREE.Vector2;
    const sources = actor.parts.filter(p => p.mask.visible).map(p => p.source);
    this.bounds.makeEmpty();
    for (const source of sources) {
      if (!source.geometry.boundingBox) source.geometry.computeBoundingBox();
      this.box.copy(source.geometry.boundingBox!).applyMatrix4(source.matrixWorld);
      this.bounds.union(this.box);
    }
    if (this.bounds.isEmpty() || !this.frustum.intersectsBox(this.bounds)) { actor.hidden = false; return; }
    let left = 1, right = -1, bottom = 1, top = -1;
    for (const x of [this.bounds.min.x, this.bounds.max.x]) for (const y of [this.bounds.min.y, this.bounds.max.y]) for (const z of [this.bounds.min.z, this.bounds.max.z]) {
      this.point.set(x, y, z).project(camera);
      left = Math.min(left, this.point.x); right = Math.max(right, this.point.x);
      bottom = Math.min(bottom, this.point.y); top = Math.max(top, this.point.y);
    }
    left = Math.max(-1, left); right = Math.min(1, right);
    bottom = Math.max(-1, bottom); top = Math.min(1, top);
    const samples: { point: THREE.Vector3; bias: number }[] = [], pixels = new Set<string>();
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      const px = Math.floor(((left + (right - left) * (x + .5) / GRID) * .5 + .5) * resolution.x);
      const py = Math.floor(((bottom + (top - bottom) * (y + .5) / GRID) * .5 + .5) * resolution.y);
      const key = `${px},${py}`;
      if (pixels.has(key)) continue;
      pixels.add(key);
      this.ndc.set((px + .5) / resolution.x * 2 - 1, (py + .5) / resolution.y * 2 - 1);
      this.ray.setFromCamera(this.ndc, camera);
      const hit = this.ray.intersectObjects(sources, false)[0];
      if (!hit?.face) continue;
      const depth = this.point.copy(hit.point).project(camera).z;
      this.normal.copy(hit.face.normal).applyMatrix3(this.normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize();
      this.surface.setFromNormalAndCoplanarPoint(this.normal, hit.point);
      let bias = .00001;
      for (const offset of [new THREE.Vector2(1 / resolution.x, 0), new THREE.Vector2(0, 1 / resolution.y)]) {
        this.ray.setFromCamera(offset.add(this.ndc), camera);
        if (this.ray.ray.intersectPlane(this.surface, this.neighbor)) bias += Math.abs(this.neighbor.project(camera).z - depth);
      }
      samples.push({ point: hit.point, bias });
    }
    // Very small/off-screen slivers cannot establish reliable coverage.
    if (samples.length < 6) { actor.hidden = false; actor.fraction = 0; return; }
    const queries: WebGLQuery[] = [];
    this.probes.clear();
    this.probeMaterial.size = 1 / renderer.getPixelRatio();
    for (const [i, sample] of samples.entries()) {
      const query = gl.createQuery();
      if (!query) { queries.forEach(q => gl.deleteQuery(q)); this.probes.clear(); return; }
      queries.push(query);
      const probe = this.probePool[i] ??= new THREE.Points(new THREE.BufferGeometry()
        .setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3))
        .setAttribute("depthBias", new THREE.Float32BufferAttribute([0], 1)), this.probeMaterial);
      const bias = probe.geometry.getAttribute("depthBias"); bias.setX(0, sample.bias); bias.needsUpdate = true;
      probe.position.copy(sample.point); probe.frustumCulled = false;
      probe.onBeforeRender = () => gl.beginQuery(gl.ANY_SAMPLES_PASSED, query);
      probe.onAfterRender = () => gl.endQuery(gl.ANY_SAMPLES_PASSED);
      this.probes.add(probe);
    }
    renderer.render(this.probes, camera);
    // Validate against this chassis alone. Silhouette-edge MSAA samples can
    // land on a nearer part of the same robot; those are not world coverage.
    const self: WebGLQuery[] = [], previousTarget = renderer.getRenderTarget();
    this.selfScene.clear();
    for (const part of actor.parts) if (part.mask.visible) {
      part.depth.matrix.copy(part.mask.matrix); this.selfScene.add(part.depth);
    }
    if (this.selfDepth.width !== resolution.x || this.selfDepth.height !== resolution.y) {
      this.selfDepth.samples = gl.getParameter(gl.SAMPLES);
      this.selfDepth.setSize(resolution.x, resolution.y);
    }
    this.selfDepth.scissorTest = true;
    const x = Math.max(0, Math.floor((left * .5 + .5) * resolution.x) - 1);
    const y = Math.max(0, Math.floor((bottom * .5 + .5) * resolution.y) - 1);
    this.selfDepth.scissor.set(x, y, Math.ceil((right - left) * .5 * resolution.x) + 3, Math.ceil((top - bottom) * .5 * resolution.y) + 3);
    try {
      renderer.setRenderTarget(this.selfDepth); renderer.autoClear = true;
      renderer.render(this.selfScene, camera); renderer.autoClear = false;
      for (let i = 0; i < samples.length; i++) {
        const query = gl.createQuery();
        if (!query) { [...queries, ...self].forEach(q => gl.deleteQuery(q)); return; }
        self.push(query);
        this.probePool[i].onBeforeRender = () => gl.beginQuery(gl.ANY_SAMPLES_PASSED, query);
        this.probePool[i].onAfterRender = () => gl.endQuery(gl.ANY_SAMPLES_PASSED);
      }
      renderer.render(this.probes, camera);
      actor.pending = { queries, self, position: camera.position.clone(), direction: this.direction.clone() };
    } finally {
      renderer.autoClear = false; renderer.setRenderTarget(previousTarget);
      if (!actor.pending) [...queries, ...self].forEach(q => gl.deleteQuery(q));
    }
    gl.flush();
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera, enabled: ReadonlySet<THREE.Object3D>) {
    const gl = renderer.getContext();
    if (!("createQuery" in gl)) return;
    this.gl = gl;
    if (gl.isContextLost()) { for (const actor of this.actors.values()) { this.cancel(actor); actor.hidden = false; } return; }
    renderer.getDrawingBufferSize(this.outline.uniforms.resolution.value);
    camera.getWorldDirection(this.direction);
    this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const active: Coverage[] = [];
    for (const [root, actor] of this.actors) {
      if (!enabled.has(root) || actor.camera !== camera) {
        this.cancel(actor); actor.hidden = false; actor.fraction = 0;
      }
      actor.camera = camera;
      if (enabled.has(root)) { this.poll(actor, camera); active.push(actor); }
      for (const part of actor.parts) {
        let visible = enabled.has(root);
        for (let node: THREE.Object3D | null = part.source; visible && node; node = node.parent) visible = node.visible;
        part.mask.visible = visible;
        part.outline.visible = visible && actor.hidden;
        part.mask.matrix.copy(part.source.matrixWorld);
        part.outline.matrix.copy(part.source.matrixWorld);
      }
    }
    if (!active.length) return;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      // Fixed round-robin budget; no readPixels or synchronous query wait.
      let submitted = 0;
      for (let i = 0; i < active.length && submitted < QUERY_BUDGET; i++) {
        const actor = active[this.next++ % active.length];
        if (!actor.pending) { this.sample(actor, camera, renderer); submitted++; }
      }
      for (const actor of active) for (const part of actor.parts) part.outline.visible = part.mask.visible && actor.hidden;
      if (active.some(actor => actor.hidden)) {
        renderer.clearStencil();
        renderer.render(this.maskScene, camera);
        renderer.render(this.outlineScene, camera);
      }
    } finally { renderer.autoClear = autoClear; }
  }
}
