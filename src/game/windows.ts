import RAPIER from "@dimforge/rapier3d-compat";
import { BLAST_RADIUS, type BoxSpec, type Vec3 } from "./config";
import type { CityDistrict } from "./city";
import { buildingPanes, buildingShell, shipPanes, shipShell, type PaneSpec } from "./facades";
import type { Simulation } from "./simulation";

const BOX_FACES = [0,2,1, 1,2,3, 4,5,6, 5,7,6, 0,1,4, 1,5,4, 2,6,3, 3,6,7, 0,4,2, 2,4,6, 1,3,5, 3,7,5];

/** One static collision mesh per shell keeps all those frame strips out of
 * the broad phase while preserving physical holes between them. */
function shellCollider(world: RAPIER.World, pieces: BoxSpec[]) {
  const vertices: number[] = [], indices: number[] = [];
  for (const p of pieces) {
    const offset = vertices.length / 3;
    for (const z of [-1, 1]) for (const y of [-1, 1]) for (const x of [-1, 1])
      vertices.push(p.x + x * p.w / 2, (p.y ?? 0) + (y + 1) * p.h / 2, p.z + z * p.d / 2);
    indices.push(...BOX_FACES.map(i => i + offset));
  }
  if (pieces.length) world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(vertices), new Uint32Array(indices)).setFriction(0.8));
}

type Pane = { spec: PaneSpec; collider: RAPIER.Collider; broken: boolean };
type Glazing = { panes: Pane[]; collider?: RAPIER.Collider };

/** One glazing collision mesh per building, rebuilt only when a pane breaks. */
export class CityWindows {
  readonly panes: Pane[] = [];
  readonly broken = new Set<string>();
  private byHandle = new Map<number, Glazing>();
  constructor(private sim: Simulation, district: CityDistrict) {
    for (const building of district.buildings) shellCollider(sim.world, buildingShell(building));
    shellCollider(sim.world, shipShell(district));
    for (const specs of [...district.buildings.map(b => buildingPanes(b, true)), shipPanes(district)]) {
      if (!specs.length) continue;
      const group: Glazing = { panes: specs.map(spec => ({ spec, broken: false } as Pane)) };
      this.rebuild(group); this.panes.push(...group.panes);
    }
  }
  private rebuild(group: Glazing) {
    if (group.collider) {
      this.byHandle.delete(group.collider.handle); this.sim.world.removeCollider(group.collider, true);
      group.collider = undefined;
    }
    const vertices: number[] = [], indices: number[] = [];
    for (const { spec: p, broken } of group.panes) {
      if (broken) continue;
      const offset = vertices.length / 3, yaw = p.turn * Math.PI / 2, pitch = p.pitch ?? 0;
      for (const z of [-0.025, 0.025]) for (const y of [-p.h / 2, p.h / 2]) for (const x of [-p.w / 2, p.w / 2]) {
        const py = y * Math.cos(pitch) - z * Math.sin(pitch), pz = z * Math.cos(pitch) + y * Math.sin(pitch);
        vertices.push(p.x + x * Math.cos(yaw) + pz * Math.sin(yaw), p.y + py, p.z + pz * Math.cos(yaw) - x * Math.sin(yaw));
      }
      indices.push(...BOX_FACES.map(i => i + offset));
    }
    if (!vertices.length) return;
    group.collider = this.sim.world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(vertices), new Uint32Array(indices)));
    this.byHandle.set(group.collider.handle, group);
    for (const pane of group.panes) pane.collider = group.collider;
  }
  private breakPane(pane: Pane, point: Vec3, normal: Vec3) {
    pane.broken = true; this.broken.add(pane.spec.id);
    this.sim.events.push({ type: "glass", position: { ...point }, normal: { ...normal } });
  }
  hit(handle: number, point: Vec3, normal: Vec3) {
    const group = this.byHandle.get(handle);
    if (!group) return false;
    const pane = group.panes.find(({ spec: p, broken }) => {
      if (broken) return false;
      const yaw = p.turn * Math.PI / 2, pitch = p.pitch ?? 0, dx = point.x - p.x, dy = point.y - p.y, dz = point.z - p.z;
      const x = dx * Math.cos(yaw) - dz * Math.sin(yaw), z = dz * Math.cos(yaw) + dx * Math.sin(yaw);
      return Math.abs(x) <= p.w / 2 + 0.001 && Math.abs(dy * Math.cos(pitch) + z * Math.sin(pitch)) <= p.h / 2 + 0.001 &&
        Math.abs(z * Math.cos(pitch) - dy * Math.sin(pitch)) < 0.027;
    });
    if (!pane) return false;
    this.breakPane(pane, point, normal); this.rebuild(group); return true;
  }
  has(handle: number) { return this.byHandle.has(handle); }
  blast(origin: Vec3, source?: RAPIER.RigidBody) {
    // Resolve exposure before changing any mesh, so authoring order cannot
    // change which panes a solid wall shields from the pressure.
    const exposed = this.panes.filter(p => !p.broken &&
      Math.hypot(p.spec.x - origin.x, p.spec.y - origin.y, p.spec.z - origin.z) < BLAST_RADIUS &&
      !this.sim.ray(origin, p.spec, source, c => c.handle !== p.collider.handle));
    const changed = new Set<Glazing>();
    for (const p of exposed) {
      changed.add(this.byHandle.get(p.collider.handle)!);
      const yaw = p.spec.turn * Math.PI / 2, pitch = p.spec.pitch ?? 0;
      this.breakPane(p, p.spec, { x: Math.sin(yaw) * Math.cos(pitch), y: -Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) });
    }
    for (const group of changed) this.rebuild(group);
  }
  inspect() { return { total: this.panes.length, broken: [...this.broken] }; }
}
