import * as THREE from "three";
import { ROBOT_MODELS } from "../game/config";
import { Simulation } from "../game/simulation";
import type { CivilianCart } from "../game/civilians";
import { makeActorBody } from "./actor-model";
import { CartFleet } from "./carts";
import { KiteFleet } from "./kites";
import { PorterFleet } from "./porters";
import { TrafficFleet } from "./traffic";
import { makeHuman } from "./humans";

export const CAST = [
  { id: "human", name: "Maintenance worker", role: "Human · original design", group: "Human", color: "#728f9f" },
  { id: "anchor", name: "ANCHOR", role: "Assault", group: "Squad", color: "#709991" },
  { id: "needle", name: "NEEDLE", role: "Sniper", group: "Squad", color: "#a9bbb0" },
  { id: "rook", name: "ROOK", role: "Minigunner", group: "Squad", color: "#b2a074" },
  { id: "cart", name: "CART", role: "Food delivery", group: "Street", color: "#d0cdbb" },
  { id: "crate", name: "CRATE", role: "Parcel cabinet", group: "Street", color: "#b5c3bd" },
  { id: "kite", name: "KITE", role: "Parcel drone", group: "Street", color: "#a4b1b2" },
  { id: "porter", name: "PORTER", role: "Cargo worker", group: "Street", color: "#c3c3ac" },
  { id: "watch", name: "WATCH", role: "Civilian security", group: "Street", color: "#c6a15d" },
  { id: "cab", name: "CAB", role: "Passenger vehicle", group: "Traffic", color: "#82a3a3" },
  { id: "van", name: "VAN", role: "Delivery vehicle", group: "Traffic", color: "#b1b6b7" },
] as const;
export type CastId = typeof CAST[number]["id"];
export type CastModel = { id: CastId; root: THREE.Group; bounds: THREE.Box3 };
export const DEFAULT_CAST: CastId[] = ["human", "anchor", "rook", "porter"];
type ViewSource = Pick<CivilianCart, "body" | "previous" | "previousRotation">;

function freeze<T extends ViewSource>(member: T) {
  const position = { x: 0, y: 0, z: 0 }, rotation = { x: 0, y: 0, z: 0, w: 1 };
  member.body.setTranslation(position, true); member.body.setRotation(rotation, true);
  member.previous = position; member.previousRotation = rotation; return member;
}

function disposeMeshes(root: THREE.Object3D, geometries: Set<THREE.BufferGeometry>, materials: Set<THREE.Material>) {
  root.traverse(o => { if (o instanceof THREE.Mesh) {
    geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m));
  } });
}

/** Frozen production prefabs. The private fixture world is freed before returning;
 * no city simulation, AI, sounds or physics are run in the model room. */
export async function makeModelRoomCast(human: ReturnType<typeof makeHuman>, reflection?: THREE.Texture) {
  const models: CastModel[] = [], actors: THREE.Group[] = [], fleets: { dispose(): void }[] = [];
  const add = (id: CastId, body: THREE.Group) => {
    body.updateMatrixWorld(true);
    const original = new THREE.Box3().setFromObject(body), center = original.getCenter(new THREE.Vector3());
    body.position.x -= center.x; body.position.y -= original.min.y;
    const root = new THREE.Group(); root.name = id; root.add(body); root.updateMatrixWorld(true);
    models.push({ id, root, bounds: new THREE.Box3().setFromObject(root) });
  };
  const dispose = () => {
    fleets.forEach(f => f.dispose());
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    actors.forEach(root => disposeMeshes(root, geometries, materials));
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    models.forEach(m => m.root.removeFromParent());
  };
  add("human", human.root);
  for (const [id, model] of [["anchor", "assault"], ["needle", "sniper"], ["rook", "minigunner"]] as const) {
    const body = makeActorBody({ kind: "player", model, weapons: [...ROBOT_MODELS[model].weapons] });
    if (body.pistol) body.pistol.visible = false;
    if (body.bipod) body.bipod.visible = false;
    actors.push(body.root); add(id, body.root);
  }
  const watch = makeActorBody({ kind: "enemy", model: null, weapons: ["pistol"], flight: {
    state: "holding", goal: { x: 0, y: 0, z: 0 }, hover: 0, rotors: 0, slot: 0, spawnedAt: 0,
  } });
  actors.push(watch.root); add("watch", watch.root);
  let sim: Simulation | undefined;
  try {
    sim = await Simulation.create("port");
    const city = sim.city!;
    for (const id of ["cart", "crate"] as const) {
      const member = freeze(city.carts.find(c => c.model === id.toUpperCase())!);
      const fleet = new CartFleet([member]); fleets.push(fleet); add(id, fleet.root);
    }
    const porter = freeze(city.porters[0]);
    const workers = new PorterFleet([porter]); workers.update(1); fleets.push(workers); add("porter", workers.root);
    const kite = freeze(city.kites[0]); kite.rotors = 0;
    const aircraft = new KiteFleet([kite]); fleets.push(aircraft); add("kite", aircraft.root);
    for (const id of ["cab", "van"] as const) {
      const member = freeze(city.vehicles.find(c => c.model === id.toUpperCase())!); member.steering = 0;
      const traffic = new TrafficFleet([member], reflection); fleets.push(traffic); add(id, traffic.root);
    }
  } catch (error) { dispose(); throw error; }
  finally { sim?.world.free(); }
  models.sort((a, b) => CAST.findIndex(c => c.id === a.id) - CAST.findIndex(c => c.id === b.id));
  return { models, dispose };
}
