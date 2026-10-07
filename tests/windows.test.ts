import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Simulation } from "../src/game/simulation";
import { RIFLE, STEP } from "../src/game/config";
import { WindowView } from "../src/render/windows";
import { Matrix4 } from "three";

describe("breakable window panes", () => {
  let sim: Simulation;
  beforeEach(async () => { sim = await Simulation.create("city"); });
  afterEach(() => sim.world.free());

  test("a braced rifle hit shatters only its pane, opening the wall without hostile score", () => {
    const pane = sim.city!.windows.panes.find(p => p.spec.id.startsWith("grocer/0/1/0"))!, p = pane.spec;
    const a = sim.squad[3]; sim.select(4); sim.setBrace(true); a.braceTime = RIFLE.settle;
    a.body.setTranslation({ x: p.x, y: 0.98, z: p.z + 8 }, true); sim.world.step();
    sim.aim = { x: p.x, y: p.y, z: p.z };
    expect(sim.fireRay(a, sim.muzzle(a), sim.aim)?.collider.handle).toBe(pane.collider.handle);
    sim.shoot(a);
    expect([...sim.city!.windows.broken]).toEqual([p.id]);
    expect(sim.events.filter(e => e.type === "glass")).toHaveLength(1);
    expect(sim.shots).toBe(1); expect(sim.hits).toBe(0);
    sim.world.step();
    expect(sim.ray({ x: p.x, y: p.y, z: p.z + 2 }, { x: p.x, y: p.y, z: p.z - 2 }, a.body)).toBeNull();
    // The neighbouring pane still blocks the same through-wall ray.
    const neighbour = sim.city!.windows.panes.find(q => q.spec.id === "grocer/0/1/1")!.spec;
    expect(sim.ray({ ...neighbour, z: neighbour.z + 2 }, { ...neighbour, z: neighbour.z - 2 })?.collider.handle)
      .toBe(sim.city!.windows.panes.find(q => q.spec.id === neighbour.id)!.collider.handle);
  });

  test("blast exposure shatters nearby panes but leaves the opposite facade protected", () => {
    const windows = sim.city!.windows;
    const origin = { x: -17, y: 1.5, z: -11 }, shielded = windows.panes.find(p => p.spec.id === "grocer/2/0/0")!.spec;
    expect(Math.hypot(shielded.x - origin.x, shielded.y - origin.y, shielded.z - origin.z)).toBeLessThan(6.5);
    windows.blast(origin);
    expect([...windows.broken].some(id => id.startsWith("grocer/0/"))).toBe(true);
    expect(windows.broken.has(shielded.id)).toBe(false);
    expect(sim.grenadeHits).toBe(0);
  });

  test("broken instances vanish, frames stay physical, and reset restores all panes", () => {
    const panes = sim.city!.windows.panes.filter(p => p.spec.id.startsWith("grocer/"));
    const view = new WindowView(panes.map(p => p.spec));
    try {
      const pane = panes[0]; sim.city!.windows.hit(pane.collider.handle, pane.spec, { x: 0, y: 0, z: 1 });
      view.update(sim.city!.windows.broken);
      const matrix = new Matrix4(); view.mesh.getMatrixAt(0, matrix);
      expect(matrix.elements[0]).toBe(0); expect(matrix.elements[5]).toBe(0);
      sim.world.step();
      expect(sim.ray({ x: -27, y: 4.5, z: -12 }, { x: -27, y: 4.5, z: -16 })).not.toBeNull();
      for (let i = 0; i < 1 / STEP; i++) sim.step();
      expect(sim.city!.windows.broken.has(pane.spec.id)).toBe(true);
      sim.reset(); expect(sim.city!.windows.broken.size).toBe(0);
      expect(sim.city!.windows.panes.every(p => !p.broken)).toBe(true);
    } finally { view.mesh.dispose(); view.mesh.geometry.dispose(); view.material.dispose(); }
  });

  test("ship wheelhouse glazing has the same breakable apertures", () => {
    sim.reset("port"); const pane = sim.city!.windows.panes.find(p => p.spec.id.startsWith("ship/0/"))!, p = pane.spec;
    const from = { ...p, z: p.z + 3 }, to = { ...p, z: p.z - 3 };
    expect(sim.ray(from, to)?.collider.handle).toBe(pane.collider.handle);
    expect(sim.city!.windows.hit(pane.collider.handle, p, { x: 0, y: 0, z: 1 })).toBe(true);
    sim.world.step(); expect(sim.ray(from, to)).toBeNull();
  });

  test("depot skylight panes break through a real roof aperture", () => {
    const pane = sim.city!.windows.panes.find(p => p.spec.id.includes("/roof/"))!, p = pane.spec;
    const from = { ...p, y: p.y + 3 }, to = { ...p, y: p.y - 2 };
    expect(sim.ray(from, to)?.collider.handle).toBe(pane.collider.handle);
    sim.city!.windows.hit(pane.collider.handle, p, { x: 0, y: 1, z: 0 });
    sim.world.step(); expect(sim.ray(from, to)).toBeNull();
  });
});
