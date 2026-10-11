import * as THREE from "three";
import type { HeightField } from "../game/height-field";
import { approachTrack, southTrack, type ForestTree } from "../game/forest";
import type { Simulation } from "../game/simulation";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Shared natural-ground mesh and instanced woodland, independent of mission objectives. */
export class NaturalTerrainView {
  readonly root = new THREE.Group();
  private crowns: THREE.InstancedMesh;
  private broadCrowns: THREE.InstancedMesh;
  private opacity: THREE.InstancedBufferAttribute;
  private crownPositions: THREE.Vector3[];
  constructor(field: HeightField, trees: ForestTree[], coverage: boolean) {
    const ground = new THREE.BufferGeometry();
    ground.setAttribute("position", new THREE.BufferAttribute(field.vertices.slice(), 3));
    ground.setIndex(new THREE.BufferAttribute(field.indices.slice(), 1)); ground.computeVertexNormals();
    const colors: number[] = [], c = new THREE.Color();
    for (let i = 0; i < field.vertices.length; i += 3) {
      const x = field.vertices[i], y = field.vertices[i + 1], z = field.vertices[i + 2];
      const track = approachTrack({x,z}) || southTrack({x,z}) || Math.abs(z + 8) < 3.2 || Math.abs(z + 22) < 2.5 && x > -37 || z > 33 && z < 41;
      const clearing = x > -6 && x < 24 && z > -34 && z < 12;
      const plot = x > 31 && z < 30 && z > -46;
      c.setHex(plot ? 0xa69c80 : track ? 0x8c8068 : clearing ? 0x777d53 : 0x536b43);
      c.multiplyScalar(.94 + Math.sin(x * .43 + z * .37) * .035 + y * .012); colors.push(c.r, c.g, c.b);
    }
    ground.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    mesh.receiveShadow = true; this.root.add(mesh);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.15, 1, 8),
      new THREE.MeshStandardMaterial({ color: 0x615744, roughness: 1 }), trees.length);
    trunks.castShadow = trunks.receiveShadow = true; this.root.add(trunks);
    const parts = [.34, .52, .70, .85].map((level, i) => {
      const g = new THREE.ConeGeometry(.19 - i * .026, .36, 9); g.translate(0, level, 0); return g;
    });
    const crown = mergeGeometries(parts)!; parts.forEach(p => p.dispose());
    this.opacity = new THREE.InstancedBufferAttribute(new Float32Array(trees.length).fill(1), 1);
    crown.setAttribute("canopyOpacity", this.opacity);
    const foliage = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, alphaToCoverage: coverage,
      transparent: !coverage, depthWrite: coverage });
    foliage.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float canopyOpacity; varying float vCanopyOpacity;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCanopyOpacity = canopyOpacity;");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vCanopyOpacity;")
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vCanopyOpacity;");
    };
    this.crowns = new THREE.InstancedMesh(crown, foliage, trees.length); this.crowns.castShadow = true;
    this.root.add(this.crowns);
    const broadParts = [[-.06,.64,0],[.06,.80,.02],[.10,.60,-.04]].map(([x,y,z]) => {
      const g = new THREE.IcosahedronGeometry(1,1); g.scale(.14,.20,.14); g.translate(x,y,z); return g;
    });
    const broad = mergeGeometries(broadParts)!; broadParts.forEach(p=>p.dispose()); broad.setAttribute("canopyOpacity",this.opacity);
    this.broadCrowns = new THREE.InstancedMesh(broad,foliage,trees.length); this.broadCrowns.castShadow=true;this.root.add(this.broadCrowns);
    this.crownPositions = [];
    const transform = new THREE.Object3D();
    trees.forEach((t, i) => {
      const y = field.heightAt(t);
      transform.position.set(t.x, y + t.height * .36, t.z); transform.scale.set(t.radius, t.height * .72, t.radius); transform.updateMatrix();
      trunks.setMatrixAt(i, transform.matrix); trunks.setColorAt(i,new THREE.Color(t.broadleaf ? 0xd5d4b9 : 0x8b8068));
      transform.position.set(t.x, y, t.z); transform.scale.set(t.height * (t.broadleaf ? 1.35 : 1), t.height, t.height * (t.broadleaf ? 1.35 : 1));
      transform.rotation.y = i * 2.399; transform.updateMatrix();
      const live = transform.matrix.clone(); transform.scale.set(0,0,0);transform.updateMatrix();
      this.crowns.setMatrixAt(i,t.broadleaf?transform.matrix:live);this.broadCrowns.setMatrixAt(i,t.broadleaf?live:transform.matrix);
      c.setHex(t.broadleaf ? 0x718251 : i % 3 ? 0x436144 : 0x526b45); this.crowns.setColorAt(i, c); this.broadCrowns.setColorAt(i,c);
      this.crownPositions.push(new THREE.Vector3(t.x, y + t.height * .65, t.z));
    });
  }
  update(sim: Simulation, camera: THREE.Camera, delta: number) {
    const actors = sim.actors.filter(a => !a.dead && !a.flight).map(a => a.body.translation());
    this.crownPositions.forEach((crown, i) => {
      // Hide foliage only where it visually covers a chassis. The trunk remains
      // physical and opaque; no collision disappears under the camera cutaway.
      const obscures = !sim.sniping && actors.some(p => {
        const dx = camera.position.x - p.x, dy = camera.position.y - p.y, dz = camera.position.z - p.z;
        const t = ((crown.x - p.x) * dx + (crown.y - p.y) * dy + (crown.z - p.z) * dz) / (dx * dx + dy * dy + dz * dz);
        return t > 0 && t < 1 && (p.x + dx * t - crown.x) ** 2 + (p.y + dy * t - crown.y) ** 2 + (p.z + dz * t - crown.z) ** 2 < 12;
      });
      const target = obscures ? .08 : 1, current = this.opacity.getX(i);
      this.opacity.setX(i, current + (target - current) * (delta > 0 ? 1 - Math.exp(-delta * 9) : 1));
    });
    this.opacity.needsUpdate = true;
  }
}
