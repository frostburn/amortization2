import { describe, expect, test } from "vitest";
import * as THREE from "three";
import { vehicleBody, TrafficFleet } from "../src/render/traffic";
import { VEHICLES } from "../src/game/traffic";
import { Simulation } from "../src/game/simulation";

function dispose(root:THREE.Object3D) {
  const materials=new Set<THREE.Material>();
  root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();materials.add(o.material as THREE.Material);}});
  materials.forEach(m=>m.dispose());
}
describe("reusable traffic models",()=>{
  test.each(["CAB","VAN"] as const)("%s has an exposed sloping windscreen and separated body surfaces",model=>{
    const {root}=vehicleBody(model),spec=VEHICLES[model],ray=new THREE.Raycaster();root.updateMatrixWorld(true);
    try {
      ray.set(new THREE.Vector3(0,(model==="CAB"?1.2:1.65)-spec.height/2,spec.length),new THREE.Vector3(0,0,-1));
      const hits=ray.intersectObject(root,true),first=hits[0];
      expect(first).toBeDefined();expect((first.object as THREE.Mesh).material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
      expect(hits.filter(h=>Math.abs(h.distance-first.distance)<1e-5)).toHaveLength(1);
      expect(new THREE.Box3().setFromObject(root).max.y+spec.height/2).toBeLessThan(spec.height+0.1);
    } finally {dispose(root);}
  });
  test("adding vehicles increases instances rather than draw calls, and disposal releases every batch",async()=>{
    const sim=await Simulation.create("city"),reflection=new THREE.Texture();
    const small=new TrafficFleet(sim.city!.vehicles.slice(0,3),reflection),large=new TrafficFleet(sim.city!.vehicles,reflection);
    const meshes=(root:THREE.Object3D)=>{const found:THREE.Mesh[]=[];root.traverse(o=>{if(o instanceof THREE.Mesh)found.push(o);});return found;};
    try {
      const a=meshes(small.root),b=meshes(large.root);expect(b).toHaveLength(a.length);
      expect(b.every(m=>m instanceof THREE.InstancedMesh)).toBe(true);
      expect(b.filter(m=>m.material instanceof THREE.MeshPhysicalMaterial).every(m=>(m.material as THREE.MeshPhysicalMaterial).envMap===reflection)).toBe(true);
      let disposed=0;b.forEach(m=>m.addEventListener("dispose",()=>disposed++));large.dispose();expect(disposed).toBe(b.length);
      expect(large.root.parent).toBeNull();
    } finally {small.dispose();reflection.dispose();sim.world.free();}
  });
});
