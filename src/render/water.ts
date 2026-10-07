import * as THREE from "three";
import { waterSections, waterSolids, type WaterFeature } from "../game/city";
import { batchRigid, block, surface } from "./primitives";

/** A reusable shallow canal with shared-street crossings and low stone banks. */
export class WaterView {
  root = new THREE.Group();
  private time = { value: 0 };
  constructor(water: WaterFeature) {
    const stone = surface(0xb9b5a2), steel = surface(0x43565b, 0.4);
    const structure = new THREE.Group();
    for (const b of waterSolids(water).filter(b => !b.navigationOnly)) {
      if (water.harbor) continue; // The port kit supplies its retaining face and fenders.
      if (b.h < 0.9) block(structure, b.w, b.h, b.d, b.x, b.h / 2, b.z, stone);
      else {
        block(structure, b.w, 0.10, b.d, b.x, 0.90, b.z, steel);
        block(structure, b.w, 0.08, b.d, b.x, 0.40, b.z, steel);
        for (let x = -b.w / 2; x <= b.w / 2; x += 1.4)
          block(structure, 0.08, 0.9, b.d, b.x + x, 0.45, b.z, steel);
      }
    }
    for (const crossing of water.crossings) {
      // The street kit supplies asphalt and sidewalks across the bridge too.
      // Keep the supporting slab below those surfaces, rather than paving over traffic lanes.
      block(structure, water.w + 1.8, 0.12, crossing.width, water.x, -0.075, crossing.z, stone);
      for (const side of [-1, 1]) {
        block(structure, water.w + 1.8, 0.004, 0.25, water.x, 0.035,
          crossing.z + side * (crossing.width / 2 - 2.7), stone);
      }
    }
    batchRigid(structure); this.root.add(structure);
    const material = surface(water.harbor ? 0x426a73 : 0x387779, 0.35, 0.3);
    // Opaque, shallow water retains depth and has no facade sorting problem.
    // Small moving normals and broad highlights avoid glitter at tactical zoom.
    material.onBeforeCompile = shader => {
      shader.uniforms.canalTime = this.time;
      shader.vertexShader = shader.vertexShader.replace("#include <common>",
        "#include <common>\nuniform float canalTime;\nvarying vec2 canalPoint;")
        .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
          float a = position.x * 1.1 + canalTime * 0.65;
          float b = position.z * 1.6 - canalTime * 0.45;
          objectNormal = normalize(vec3(-0.0044 * cos(a), 1.0, -0.0032 * cos(b)));`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          canalPoint = position.xz;
          transformed.y += 0.004 * sin(a) + 0.002 * sin(b);`);
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>",
        "#include <common>\nuniform float canalTime;\nvarying vec2 canalPoint;")
        .replace("#include <color_fragment>", `#include <color_fragment>
          diffuseColor.rgb *= 0.96 + 0.04 * sin(canalPoint.y * 2.0 + canalPoint.x * 0.45 - canalTime * 0.7);`);
    };
    material.customProgramCacheKey = () => "shallow-canal";
    for (const section of waterSections(water)) {
      const depth = section.front - section.back;
      const geometry = new THREE.PlaneGeometry(water.w - (water.harbor ? 0 : 0.6), depth, 16, Math.min(120, Math.ceil(depth)));
      geometry.rotateX(-Math.PI / 2); geometry.userData.owned = true;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(water.x, water.harbor?.surface ?? 0.055, (section.back + section.front) / 2);
      mesh.receiveShadow = true; this.root.add(mesh);
    }
  }
  update(time: number) { this.time.value = time; }
}
