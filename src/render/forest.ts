import * as THREE from "three";
import { FOREST_FIXTURES, FOREST_GROUND, FOREST_RIGS, FOREST_ROCKS, FOREST_SITES } from "../game/forest";
import { ForestMission } from "../game/forest-mission";
import type { Simulation } from "../game/simulation";
import { batchRigid, block, surface, tube } from "./primitives";
import { vehicleBody } from "./traffic";
import { VEHICLES } from "../game/traffic";

/** Autonomous tracked harvester: engine chassis, protected cab, hydraulic boom and felling head. */
function harvester() {
  const root = new THREE.Group(), kit = new THREE.Group(), boom = new THREE.Group(); root.add(kit, boom);
  const rubber = surface(0x252c29), steel = surface(0x414c43, .5), paint = surface(0xaf9e5e, .3), glass = surface(0x49696d, .65, .22);
  for (const z of [-1.35, 1.35]) {
    block(kit, 5.5, .9, .8, 0, .55, z, rubber);
    for (let x = -2; x <= 2; x += 1) { const wheel = tube(kit, .34, .9, x, .6, z, steel); wheel.rotation.x = Math.PI / 2; }
    for (let x = -2.5; x <= 2.5; x += .35) block(kit, .07, .05, .85, x, 1.02, z, steel);
  }
  block(kit, 5.2, .45, 2.8, 0, 1.15, 0, steel);
  block(kit, 2.4, 1.2, 2.5, 1.35, 1.95, 0, paint);
  for (let x = .6; x <= 2; x += .2) block(kit, .035, .65, .06, x, 2, 1.29, rubber);
  block(kit, 1.8, 1.65, 1.85, -1.65, 2.15, 0, steel);
  block(kit, 1.65, 1.1, .035, -1.65, 2.2, 0.945, glass);
  block(kit, .035, 1.1, 1.65, -2.57, 2.2, 0, glass);
  block(kit, 2, .12, 2.05, -1.65, 3.02, 0, paint);
  tube(kit, .25, .25, -1.65, 3.25, 0, steel);
  const light = new THREE.MeshBasicMaterial({color: 0xd8a455}); tube(kit, .10, .22, 1.1, 2.71, .8, light);
  // Two separated boom segments read as hydraulic machinery, not a weapon barrel.
  block(boom, .45, 2.1, .6, -.15, 2.2, 0, paint);
  const upper = block(boom, 4.6, .42, .45, -.25, 3.4, -2, paint); upper.rotation.x = -.2; upper.rotation.y = Math.PI / 2;
  const ram = tube(boom, .08, 3, -.25, 2.95, -1.5, steel); ram.rotation.x = Math.PI / 2 + .2;
  block(boom, .75, 1.25, .8, -.25, 2.5, -4.05, steel);
  for (const x of [-.6, .1]) { const jaw = tube(boom, .10, 1, x, 2.1, -4.2, paint); jaw.rotation.x = .3; }
  batchRigid(kit); batchRigid(boom); return {root, boom, light};
}

export class ForestView {
  readonly root = new THREE.Group();
  private rigs = FOREST_RIGS.map(r => {
    const model = harvester(); model.root.position.set(r.x, r.y, r.z); this.root.add(model.root); return model;
  });
  private marker = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xd3a24f, transparent: true, opacity: .75 }));
  private markerKey = "";
  private terminal = new THREE.MeshBasicMaterial({ color: 0xd3a24f });
  constructor() {
    const kit = new THREE.Group(), concrete = surface(0x9a9c8b), dark = surface(0x39484a, .4), wood = surface(0x8f7959), end = surface(0xb0a17e);
    for (const r of FOREST_ROCKS) {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), surface(0x777a69));
      mesh.position.set(r.x, r.y + r.h / 2, r.z); mesh.scale.set(r.w / 2, r.h / 2, r.d / 2); mesh.rotation.y = r.x * .7;
      mesh.castShadow = mesh.receiveShadow = true; this.root.add(mesh);
    }
    for (const b of FOREST_FIXTURES.filter(b => b.style === "barrier" && !FOREST_ROCKS.some(r => r.x === b.x && r.z === b.z))) {
      for (const offset of [-.24, .24]) {
        const log = tube(kit, b.h / 2, b.w, b.x, (b.y ?? 0) + b.h / 2, b.z + offset, wood); log.rotation.z = Math.PI / 2;
        for (const side of [-1, 1]) { const cap = tube(kit, b.h / 2 - .04, .03, b.x + side * b.w / 2, (b.y ?? 0) + b.h / 2, b.z + offset, end); cap.rotation.z = Math.PI / 2; }
      }
    }
    for (let i = 0; i < 13; i++) {
      const x = -7 + i * 2.6, z = -30 + Math.sin(i * 3) * 4, y = FOREST_GROUND.heightAt({x,z});
      tube(kit, .35 + i % 3 * .06, .38, x, y + .19, z, wood); tube(kit, .30, .025, x, y + .39, z, end);
    }
    // Surveyed construction plot: future data halls, slab pads and cooling plant footprints.
    for (const z of [-35, -23]) for (const x of [42, 52, 62, 72]) {
      block(kit, 6.2, .32, 7.2, x, .16, z, concrete);
      for (const side of [-1,1]) block(kit, .18, .6, 6.4, x + side * 2.4, .62, z, dark);
    }
    for (let z = -42; z <= -10; z += 8) for (const x of [36, 76]) {
      tube(kit, .05, 1.4, x, .7, z, wood); block(kit, .3, .24, .06, x, 1.2, z, surface(0xc9ad5f));
    }
    for (const b of FOREST_FIXTURES.filter(b => b.style === "wall" && b.h === 1.8)) {
      for (let t = -.5; t <= .5; t += .1) tube(kit, .05, 1.8, b.x + t * (b.w > 1 ? b.w : 0), .9, b.z + t * (b.d > 1 ? b.d : 0), dark);
      for (const y of [.35,.9,1.45]) block(kit,b.w,.055,b.d,b.x,y,b.z,dark);
    }
    block(kit, 1.2, 1.5, .7, 33, .75, 1, dark); block(kit, 1.3, .14, .85, 33, 1.58, 1, concrete);
    block(kit, .85, .38, .035, 33, 1.2, 1.37, this.terminal);
    const van = vehicleBody("VAN"); van.paint.color.setHex(0x728c82); van.root.position.set(-57, VEHICLES.VAN.height / 2 + .035, 45);
    van.root.rotation.y = Math.PI / 2; this.root.add(van.root);
    // Sparse survey paint and a permanent forestry road direction board.
    const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 192;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#273c36"; ctx.fillRect(0,0,512,192);
    ctx.fillStyle = "#dfdbc4"; ctx.font = "bold 48px sans-serif"; ctx.fillText("MERIDIAN · PLOT B",22,70);
    ctx.font = "32px sans-serif"; ctx.fillText("DATA HALLS / SURVEY ONLY",22,130);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7,2.6),new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(canvas),roughness:.9,side:THREE.DoubleSide}));
    sign.position.set(39,2.5,-9); this.root.add(sign);
    for(const x of [36.5,41.5])tube(kit,.07,3,x,1.5,-9,dark);
    batchRigid(kit); this.root.add(kit); this.root.add(this.marker);
  }
  update(sim: Simulation, reducedMotion: boolean) {
    const mission = sim.mission instanceof ForestMission ? sim.mission : undefined;
    this.rigs.forEach((model, i) => {
      const active = !!mission && mission.rigs[i].hp > 0 && !mission.stopped;
      model.boom.rotation.y = active && !reducedMotion ? Math.sin(sim.time * .6 + i) * .16 : 0;
      model.light.color.setHex(active ? 0xe5aa43 : 0x44504b);
    });
    this.terminal.color.setHex(mission?.sealedAt === undefined ? 0xd3a24f : 0x9be6cd);
    const marker = sim.mission?.marker; this.marker.visible = !!marker;
    if (marker && this.markerKey !== `${marker.x},${marker.z},${marker.radius}`) {
      this.markerKey = `${marker.x},${marker.z},${marker.radius}`;
      const positions: number[] = [];
      for (let i = 0; i < 80; i++) {
        const angle = i / 80 * Math.PI * 2, p = { x: marker.x + Math.sin(angle) * marker.radius, z: marker.z + Math.cos(angle) * marker.radius };
        positions.push(p.x, FOREST_GROUND.heightAt(p) + .075, p.z);
      }
      this.marker.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      (this.marker.material as THREE.LineBasicMaterial).color.setHex(marker.kind === "return" ? 0x9be6cd : 0xd3a24f);
    }
  }
}
