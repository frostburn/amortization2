import * as THREE from "three";

/** Camera readability only: render the hidden contour against the world depth.
 * A stencil of the actual articulated silhouettes removes internal seams and
 * prevents visible robots from outlining their own back faces. No ray queries,
 * cloned geometry, extra world render, or changes to combat line of sight. */
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
  private actors = new Map<THREE.Object3D, { source: THREE.Mesh; mask: THREE.Mesh; outline: THREE.Mesh }[]>();

  add(root: THREE.Object3D) {
    const parts: { source: THREE.Mesh; mask: THREE.Mesh; outline: THREE.Mesh }[] = [];
    root.traverse(source => {
      if (!(source instanceof THREE.Mesh)) return;
      const mask = new THREE.Mesh(source.geometry, this.mask), outline = new THREE.Mesh(source.geometry, this.outline);
      mask.matrixAutoUpdate = outline.matrixAutoUpdate = false;
      this.maskScene.add(mask); this.outlineScene.add(outline);
      parts.push({ source, mask, outline });
    });
    this.actors.set(root, parts);
  }

  remove(root: THREE.Object3D) {
    for (const part of this.actors.get(root) ?? []) { part.mask.removeFromParent(); part.outline.removeFromParent(); }
    this.actors.delete(root);
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera, enabled: ReadonlySet<THREE.Object3D>) {
    if (!enabled.size) return;
    renderer.getDrawingBufferSize(this.outline.uniforms.resolution.value);
    for (const [root, parts] of this.actors) for (const part of parts) {
      let visible = enabled.has(root);
      for (let node: THREE.Object3D | null = part.source; visible && node; node = node.parent) visible = node.visible;
      part.mask.visible = part.outline.visible = visible;
      part.mask.matrix.copy(part.source.matrixWorld);
      part.outline.matrix.copy(part.source.matrixWorld);
    }
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      renderer.clearStencil();
      renderer.render(this.maskScene, camera);
      renderer.render(this.outlineScene, camera);
    } finally { renderer.autoClear = autoClear; }
  }
}
