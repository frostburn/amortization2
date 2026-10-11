import RAPIER from "@dimforge/rapier3d-compat";
import type { Simulation } from "./simulation";
import type { Mission } from "./missions";
import { CROSSING_BRIDGE } from "./crossing";
import { HANDLING_SHELTERS, SERVICE_HALL_ROOF, SERVICE_HALL_SPEC, serviceHallWalls } from "./handling";
import { ESCORT_ROOF, ESCORT_SHELTERS } from "./escort";
import { RECORDS_PANES, RECORDS_SHELL } from "./records-office";

/** Map solids that contract encounters normally install. Arena leaves doors
 * open and the canal deck permanent so a lost bridge cannot strand a wave. */
export class ArenaLandmarks {
  readonly roofs: Mission["roofs"] = [];
  private glazing?: { shell?: number; readonly glass?: number };
  constructor(private sim: Simulation) {
    if (sim.range === "crossing") {
      const b = CROSSING_BRIDGE;
      sim.world.createCollider(RAPIER.ColliderDesc.cuboid(b.length / 2, .12, b.width / 2).setTranslation(b.x, -.12, b.z));
    }
    if (sim.range === "handling" || sim.range === "escort") {
      const handling = sim.range === "handling", r = handling ? SERVICE_HALL_ROOF : ESCORT_ROOF;
      const collider = sim.world.createCollider(RAPIER.ColliderDesc.cuboid(r.w / 2, r.h / 2, r.d / 2)
        .setTranslation(r.x, r.y! + r.h / 2, r.z));
      const walls: number[] = [];
      if (handling) {
        const specs = serviceHallWalls(SERVICE_HALL_SPEC);
        sim.world.forEachCollider(c => {
          const p = c.translation();
          if (specs.some(w => Math.abs(p.x - w.x) < .001 && Math.abs(p.z - w.z) < .001 && Math.abs(p.y - w.h / 2) < .001)) walls.push(c.handle);
        });
      } else this.glazing = sim.city!.windows.addInterior(RECORDS_SHELL, RECORDS_PANES);
      this.roofs.push({ area: (handling ? HANDLING_SHELTERS : ESCORT_SHELTERS)[0], collider: collider.handle,
        walls, revealDistance: handling ? 12 : 10 });
    }
  }
  get cutawayRoofs() {
    if (this.glazing) this.roofs[0].walls = [this.glazing.shell, this.glazing.glass].filter((h): h is number => h !== undefined);
    return this.roofs.filter(({ area, revealDistance }) => this.sim.squad.some(a => {
      const p = a.body.translation();
      return !a.dead && p.y < (area.y ?? 0) + area.h && Math.hypot(
        Math.max(0, Math.abs(p.x - area.x) - area.w / 2), Math.max(0, Math.abs(p.z - area.z) - area.d / 2)) <= revealDistance!;
    }));
  }
}
