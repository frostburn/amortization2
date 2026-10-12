import * as THREE from "three";
import type { Simulation } from "../game/simulation";

/** Four authored lights, one shadow map; transient flashes use a fixed pool. */
export class NightLighting {
  readonly root = new THREE.Group();
  private spots = new Map<string, THREE.SpotLight>();
  private flashes = Array.from({ length: 4 }, () => {
    const light = new THREE.PointLight(0xffbf70, 0, 22, 1.5); this.root.add(light); return light;
  });
  update(sim: Simulation) {
    const night = sim.night;
    this.root.visible = !!night;
    if (!night) return;
    const sources = night.lights;
    for (const source of sources) {
      let light = this.spots.get(source.id);
      if (!light) {
        light = new THREE.SpotLight(source.color, source.intensity, source.range, source.angle, .65, 1.3);
        light.castShadow = source.shadow;
        if (source.shadow) { light.shadow.mapSize.set(1024, 1024); light.shadow.bias = -.0003; light.shadow.normalBias = .08; }
        this.spots.set(source.id, light); this.root.add(light, light.target);
      }
      light.visible = true;
      light.position.copy(source.position); light.target.position.copy(source.target);
    }
    for (const [id, light] of this.spots) if (!sources.some(source => source.id === id)) light.visible = false;
    this.flashes.forEach((light, i) => {
      const flash = night.flashes[i];
      light.intensity = flash ? 100 * Math.min(1, (flash.until - sim.time) / .12) : 0;
      if (flash) { light.position.copy(flash.position); light.distance = flash.range; }
    });
  }
  dispose() { for (const light of this.spots.values()) light.shadow.dispose(); this.spots.clear(); this.root.clear(); }
}
