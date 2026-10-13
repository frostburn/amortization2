import * as THREE from "three";
import { BERTH_SITES, NIGHT_PORT } from "../game/night-port";
import { NightPortMission } from "../game/night-port-mission";
import type { Simulation } from "../game/simulation";
import { CraneHoist } from "./port";
import { batchRigid, block, surface } from "./primitives";

/** Crane consoles, painted control bays and resumed mechanical work; no floating labels. */
export class NightPortView {
  readonly root=new THREE.Group();
  private lamps: THREE.MeshBasicMaterial[]=[];
  private rings: THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>[]=[];
  private hoists=NIGHT_PORT.port!.cranes.map(c=>new CraneHoist(c));
  private exit: THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>;
  constructor() {
    const kit=new THREE.Group(),steel=surface(0x536969,.5),dark=surface(0x24363b),paint=surface(0xbca66e);
    BERTH_SITES.controls.forEach(p=>{
      block(kit,.9,1.4,.7,p.x+2.8,.7,p.z,steel);
      block(kit,.72,.5,.025,p.x+2.8,1.1,p.z+.365,dark);
      const lamp=new THREE.MeshBasicMaterial({color:0xd1b675});this.lamps.push(lamp);
      block(kit,.48,.06,.03,p.x+2.8,1.18,p.z+.385,lamp);
      for(const sign of [-1,1]){
        block(kit,p.radius*2,.005,.09,p.x,.052,p.z+sign*p.radius,paint);
        block(kit,.09,.005,p.radius*2,p.x+sign*p.radius,.052,p.z,paint);
      }
      const ring=new THREE.Mesh(new THREE.RingGeometry(p.radius-.07,p.radius,48),
        new THREE.MeshBasicMaterial({color:0xd1b675,transparent:true,opacity:.7,depthWrite:false}));
      ring.rotation.x=-Math.PI/2;ring.position.set(p.x,.06,p.z);this.rings.push(ring);this.root.add(ring);
    });
    for(const z of [-26,26]){
      block(kit,.8,.22,.6,39,8,z,steel);
      block(kit,.62,.035,.46,39,7.86,z,new THREE.MeshBasicMaterial({color:0xffdeab}));
    }
    // Ship and gate lamps are shielded fixtures rather than glowing robot hulls.
    for(const [x,y,z] of [[59,7,32],[-58,7,12]]) {
      block(kit,.09,y,.09,x,y/2,z,steel);block(kit,.7,.16,.45,x,y,z,steel);
      block(kit,.56,.025,.35,x,y-.1,z,new THREE.MeshBasicMaterial({color:0xe4d7ad}));
    }
    batchRigid(kit);this.root.add(kit,...this.hoists.map(h=>h.root));
    this.exit=new THREE.Mesh(new THREE.RingGeometry(BERTH_SITES.exit.radius-.08,BERTH_SITES.exit.radius,64),
      new THREE.MeshBasicMaterial({color:0xa3e6d0,transparent:true,opacity:.8,depthWrite:false}));
    this.exit.rotation.x=-Math.PI/2;this.exit.position.set(BERTH_SITES.exit.x,.06,BERTH_SITES.exit.z);this.root.add(this.exit);
  }
  update(sim: Simulation,reducedMotion: boolean) {
    const m=sim.mission instanceof NightPortMission?sim.mission:undefined;
    this.exit.visible=m?.phase==="return";
    this.rings.forEach((ring,i)=>{
      ring.visible=!!m&&!m.finished&&m.phase!=="return";
      const color=m?.cargoReleased?0xa3e6d0:m?.contested[i]?0xed765d:m?.operators[i]?0xa3e6d0:0xd1b675;
      ring.material.color.setHex(color);this.lamps[i].color.setHex(color);
    });
    this.hoists.forEach((h,i)=>h.update(m?.restoredAt!==undefined&&!reducedMotion
      ?7.8+Math.sin((sim.time-m.restoredAt)*.45+i)*2.3:7.8));
  }
}
