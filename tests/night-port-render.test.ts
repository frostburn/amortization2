import * as THREE from "three";
import {expect,test} from "vitest";
import {CraneHoist,makeCrane} from "../src/render/port";
import {NightPortView} from "../src/render/night-port";
import {Simulation} from "../src/game/simulation";
import {NightPortMission} from "../src/game/night-port-mission";

test("moving spreaders keep their cables attached to both endpoints",()=>{
  const c={x:34,z:30,span:14,height:19},h=new CraneHoist(c);
  for(const height of [5.5,7.8,10.1]){
    h.update(height);
    for(const cable of h.root.children.slice(0,2) as THREE.Mesh[]){
      expect(cable.position.y+cable.scale.y/2).toBeCloseTo(c.height);
      expect(cable.position.y-cable.scale.y/2).toBeCloseTo(height+.2);
    }
  }
  const staticCrane=makeCrane(c),separate=makeCrane(c,undefined,undefined,undefined,false);
  expect(new THREE.Box3().setFromObject(separate).max.y).toBe(new THREE.Box3().setFromObject(staticCrane).max.y);
  for(const root of [h.root,staticCrane,separate])root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});
});
test("control colors, exit markers and reduced-motion hoists follow the contract state",async()=>{
  const sim=await Simulation.create("nightport"),view=new NightPortView();
  try{
    const m=sim.mission as NightPortMission;
    const rings=view.root.children.filter(o=>o instanceof THREE.Mesh&&o.geometry instanceof THREE.RingGeometry) as THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>[];
    m.phase="restore";m.operators=[1,null];m.contested=[false,true];view.update(sim,false);
    expect(rings.map(r=>r.visible)).toEqual([true,true,false]);
    expect(rings.slice(0,2).map(r=>r.material.color.getHex())).toEqual([0xa3e6d0,0xed765d]);
    m.phase="return";m.restoredAt=0;sim.time=2;view.update(sim,false);
    expect(rings.map(r=>r.visible)).toEqual([false,false,true]);
    const hoists=view.root.children.filter(o=>o instanceof THREE.Group).slice(-2);
    expect(hoists[0].children[2].position.y).not.toBe(7.8);
    view.update(sim,true);expect(hoists.map(h=>h.children[2].position.y)).toEqual([7.8,7.8]);
  }finally{view.root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});sim.world.free();}
});
