import * as THREE from "three";
import { VEHICLES, type CivilianVehicle, type VehicleModel } from "../game/traffic";
import { batchRigid, block, surface, tube } from "./primitives";

type Section = { z:number; bottom:number; top:number; width:number; roof?:number };
/** Tapered body sections give bonnet, windscreen and roof their own profiles. */
function loft(root:THREE.Group, sections:Section[], material:THREE.Material) {
  const vertices:number[]=[];
  const ring=(s:Section)=>[[-s.width,s.bottom,s.z],[-(s.roof??s.width),s.top,s.z],
    [s.roof??s.width,s.top,s.z],[s.width,s.bottom,s.z]];
  const triangle=(a:number[],b:number[],c:number[])=>vertices.push(...a,...b,...c);
  for(let i=0;i<sections.length-1;i++) {
    const a=ring(sections[i]),b=ring(sections[i+1]);
    for(let j=0;j<4;j++){const k=(j+1)%4;triangle(a[j],b[j],a[k]);triangle(a[k],b[j],b[k]);}
  }
  const a=ring(sections[0]),b=ring(sections.at(-1)!);
  triangle(a[0],a[1],a[2]);triangle(a[0],a[2],a[3]);
  triangle(b[0],b[2],b[1]);triangle(b[0],b[3],b[2]);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
  // Match the indexed position/normal/UV layout of the reusable box parts.
  geometry.setIndex(Array.from({length:vertices.length/3},(_,i)=>i));
  geometry.setAttribute("uv",new THREE.Float32BufferAttribute(new Float32Array(vertices.length/3*2),2));
  geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
}

/** Original contemporary hatchback and service-van silhouettes, in metres. */
export function vehicleBody(model:VehicleModel, reflection?:THREE.Texture) {
  const root=new THREE.Group(),paint=surface(0xffffff,0.35,0.3),rubber=surface(0x20282a),metal=surface(0x718184,0.75,0.3);
  const glass=new THREE.MeshPhysicalMaterial({color:0x1c2c32,roughness:0.12,clearcoat:1,envMap:reflection??null,envMapIntensity:2.2});
  const spec=VEHICLES[model],height=spec.height/2;
  const b=(w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material)=>block(root,w,h,d,x,y-height,z,mat);
  const profile=(rows:Section[],mat:THREE.Material)=>loft(root,rows.map(s=>({...s,bottom:s.bottom-height,top:s.top-height})),mat);
  if(model==="CAB") {
    profile([{z:-2.16,bottom:0.38,top:0.82,width:0.79},{z:-1.55,bottom:0.35,top:0.96,width:0.9},
      {z:1.3,bottom:0.35,top:0.88,width:0.9},{z:2.16,bottom:0.4,top:0.7,width:0.75}],paint);
    profile([{z:-1.52,bottom:0.88,top:0.98,width:0.77,roof:0.75},
      {z:-0.98,bottom:0.9,top:1.43,width:0.8,roof:0.66},{z:0.38,bottom:0.9,top:1.43,width:0.8,roof:0.66},
      {z:1.08,bottom:0.86,top:0.94,width:0.77,roof:0.73}],glass);
    b(1.35,0.055,1.34,0,1.47,-0.3,paint);
    for(const side of [-1,1]) {
      const pillar=b(0.065,0.48,0.065,side*0.745,1.19,-0.3,rubber);pillar.rotation.z=side*0.27;
      b(0.035,0.018,1.75,side*0.897,0.61,-0.3,rubber);
      b(0.05,0.065,0.2,side*0.918,0.82,-0.65,metal);
      b(0.13,0.10,0.22,side*0.98,1.01,0.84,paint);
    }
  } else {
    profile([{z:-2.69,bottom:0.3,top:2.09,width:0.89,roof:0.85},
      {z:-2.4,bottom:0.3,top:2.16,width:0.99,roof:0.94},{z:0.42,bottom:0.3,top:2.16,width:0.99,roof:0.94},
      {z:0.5,bottom:0.3,top:1.27,width:0.99},
      {z:1.73,bottom:0.3,top:1.3,width:0.98},{z:2.69,bottom:0.35,top:1.12,width:0.88}],paint);
    profile([{z:0.52,bottom:1.28,top:2.12,width:0.955,roof:0.9},
      {z:1.65,bottom:1.25,top:1.4,width:0.945,roof:0.9},{z:1.76,bottom:1.24,top:1.25,width:0.93}],glass);
    for(const side of [-1,1]) {
      b(0.02,0.032,2.72,side*1.005,1.19,-0.99,rubber);
      b(0.02,1.45,0.025,side*1.005,1.24,-0.15,rubber);
      b(0.05,0.065,0.22,side*1.03,1.1,0.75,metal);
      b(0.16,0.22,0.15,side*1.08,1.42,1.23,rubber);
    }
    b(0.035,1.7,0.025,0,1.2,-2.706,rubber);
    b(0.13,0.08,0.035,0.16,1.04,-2.72,metal);
  }
  for(const side of [-1,1]) {
    b(0.065,0.12,spec.length*0.85,side*(spec.width/2-0.07),0.3,0,rubber);
    b(0.18,0.06,0.07,side*0.62,model==="CAB"?0.67:0.97,spec.length/2-0.025,metal);
  }
  b(spec.width*0.8,0.10,0.13,0,0.44,spec.length/2-0.02,rubber);
  b(spec.width*0.8,0.10,0.13,0,0.42,-spec.length/2+0.015,rubber);
  b(0.33,0.075,0.05,0,0.59,-spec.length/2-0.015,metal);
  // Modest roof sensor, corner cameras and conventional mirrors, without branding.
  b(0.29,0.07,0.16,0,spec.height+0.03,model==="CAB"?-0.05:0.65,rubber);
  b(0.10,0.04,0.018,0,spec.height+0.04,model==="CAB"?0.04:0.74,glass);
  batchRigid(root);return {root,paint};
}

class VehicleFleet {
  root=new THREE.Group();
  private parts:THREE.InstancedMesh[]=[];
  private wheels:THREE.InstancedMesh[]=[];
  private lamps:THREE.InstancedMesh;
  private pose=new THREE.Matrix4();private local=new THREE.Matrix4();private matrix=new THREE.Matrix4();
  private position=new THREE.Vector3();private rotation=new THREE.Quaternion();private current=new THREE.Quaternion();
  private unit=new THREE.Vector3(1,1,1);private tint=new THREE.Color();
  constructor(private cars:CivilianVehicle[],private model:VehicleModel,reflection?:THREE.Texture) {
    const {root,paint}=vehicleBody(model,reflection);
    const make=(geometry:THREE.BufferGeometry,material:THREE.Material,count=cars.length)=>{
      const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.castShadow=mesh.receiveShadow=true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.root.add(mesh);return mesh;
    };
    for(const part of root.children as THREE.Mesh[]) {
      const mesh=make(part.geometry,part.material as THREE.Material);
      mesh.userData.paint=part.material===paint;this.parts.push(mesh);
    }
    const wheel=new THREE.Group(),rubber=surface(0x202629),hub=surface(0x8a9695,0.65,0.3),radius=model==="CAB"?0.31:0.36;
    const tire=tube(wheel,radius,0.20,0,0,0,rubber,16);tire.rotation.z=Math.PI/2;
    const rim=tube(wheel,radius*0.62,0.215,0,0,0,hub,12);rim.rotation.z=Math.PI/2;
    for(const z of [-radius*0.35,radius*0.35])block(wheel,0.224,0.055,0.06,0,0,z,rubber);
    batchRigid(wheel);
    for(const part of wheel.children as THREE.Mesh[])this.wheels.push(make(part.geometry,part.material as THREE.Material,cars.length*4));
    this.lamps=make(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0xffffff}),cars.length*8);
    this.lamps.castShadow=this.lamps.receiveShadow=false;this.update(1,0);
  }
  update(alpha:number,time:number) {
    const spec=VEHICLES[this.model],radius=this.model==="CAB"?0.31:0.36;
    for(const [i,c] of this.cars.entries()) {
      const p=c.body.translation(),q=c.body.rotation();
      this.position.set(THREE.MathUtils.lerp(c.previous.x,p.x,alpha),THREE.MathUtils.lerp(c.previous.y,p.y,alpha),THREE.MathUtils.lerp(c.previous.z,p.z,alpha));
      this.current.set(q.x,q.y,q.z,q.w);this.rotation.set(c.previousRotation.x,c.previousRotation.y,c.previousRotation.z,c.previousRotation.w).slerp(this.current,alpha);
      this.pose.compose(this.position,this.rotation,this.unit);
      for(const mesh of this.parts) {
        mesh.setMatrixAt(i,this.pose);
        this.tint.setHex(mesh.userData.paint?c.color:0xffffff).multiplyScalar(c.hp?1:0.46);mesh.setColorAt(i,this.tint);
      }
      for(let k=0;k<4;k++) {
        const front=k>=2,side=k%2?-1:1;
        this.local.makeRotationY(c.steering*(front?1:-0.18));
        this.matrix.makeRotationX(c.distance/radius*side);this.local.multiply(this.matrix);
        this.local.setPosition(side*(spec.width/2-0.015),radius-spec.height/2,front?spec.wheelbase/2:-spec.wheelbase/2);
        this.matrix.multiplyMatrices(this.pose,this.local);this.wheels.forEach(m=>m.setMatrixAt(i*4+k,this.matrix));
      }
      const hazards=c.state==="alert"||c.state==="settling"||c.state==="stranded"||!c.hp;
      const turning=Math.abs(c.steering)>0.16;
      for(let k=0;k<8;k++) {
        const side=k%2?1:-1,front=k<4,indicator=k%4>=2;
        const y=(this.model==="CAB"?0.73:1.0)+(indicator?-0.06:0.02);
        this.local.makeScale(indicator?0.11:0.25,0.065,0.038);
        this.local.setPosition(side*(indicator?0.75:0.55),y-spec.height/2,(front?1:-1)*(spec.length/2+0.015));
        this.matrix.multiplyMatrices(this.pose,this.local);this.lamps.setMatrixAt(i*8+k,this.matrix);
        const blink=Math.floor(time*2.5)%2===0&&(hazards||(turning&&side===Math.sign(c.steering)));
        const color=indicator?blink?0xeeb45c:0x473827:front?c.hp?0xd5e1dc:0x333c3c:c.braking?0xf25b43:0x8c332b;
        this.lamps.setColorAt(i*8+k,this.tint.setHex(color));
      }
    }
    for(const mesh of [...this.parts,...this.wheels,this.lamps]) {
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();
    }
  }
  dispose() {
    const materials=new Set<THREE.Material>();
    for(const m of [...this.parts,...this.wheels,this.lamps]){m.dispose();m.geometry.dispose();materials.add(m.material as THREE.Material);}
    materials.forEach(m=>m.dispose());this.root.removeFromParent();
  }
}
export class TrafficFleet {
  root=new THREE.Group();private fleets:VehicleFleet[]=[];
  constructor(cars:CivilianVehicle[],reflection?:THREE.Texture) {
    for(const model of ["CAB","VAN"] as const) {
      const members=cars.filter(c=>c.model===model);if(!members.length)continue;
      const fleet=new VehicleFleet(members,model,reflection);this.fleets.push(fleet);this.root.add(fleet.root);
    }
  }
  update(alpha:number,time:number){this.fleets.forEach(f=>f.update(alpha,time));}
  dispose(){this.fleets.forEach(f=>f.dispose());this.root.removeFromParent();}
}
