import * as THREE from "three";
import { VEHICLES, type CivilianVehicle, type VehicleModel } from "../game/traffic";
import { batchRigid, block, surface, tube } from "./primitives";

type Section = { z:number; bottom:number; top:number; width:number; roof?:number; round?:number };
/** Rounded cross-sections retain the distinct nose, windscreen and cargo profiles. */
function loft(root:THREE.Group, sections:Section[], material:THREE.Material) {
  const vertices:number[]=[],indices:number[]=[];
  const rings=sections.map(s=>{
    const corners=[[-s.width,s.bottom],[-(s.roof??s.width),s.top],[s.roof??s.width,s.top],[s.width,s.bottom]];
    return corners.flatMap((p,i)=>{
      const prev=corners[(i+3)%4],next=corners[(i+1)%4];
      const a=Math.hypot(prev[0]-p[0],prev[1]-p[1]),b=Math.hypot(next[0]-p[0],next[1]-p[1]);
      const r=Math.min(s.round??0.12,a/3,b/3);
      const from=p.map((v,k)=>v+(prev[k]-v)*r/a),to=p.map((v,k)=>v+(next[k]-v)*r/b);
      return Array.from({length:5},(_,j)=>{const t=j/4,u=1-t;return [u*u*from[0]+2*u*t*p[0]+t*t*to[0],u*u*from[1]+2*u*t*p[1]+t*t*to[1],s.z];});
    });
  }),n=rings[0].length;
  rings.forEach(r=>r.forEach(p=>vertices.push(...p)));
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<n;j++) {
    const a=i*n+j,b=(i+1)*n+j,k=(j+1)%n;
    indices.push(a,b,i*n+k,i*n+k,b,(i+1)*n+k);
  }
  // Separate cap vertices keep end panels flat while side normals flow around corners.
  for(const end of [0,rings.length-1]) {
    const start=vertices.length/3,s=sections[end];
    rings[end].forEach(p=>vertices.push(...p));const center=vertices.length/3;
    vertices.push(0,(s.top+s.bottom)/2,s.z);
    for(let j=0;j<n;j++)indices.push(center,start+(end?(j+1)%n:j),start+(end?j:(j+1)%n));
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
  geometry.setIndex(indices);
  geometry.setAttribute("uv",new THREE.Float32BufferAttribute(new Float32Array(vertices.length/3*2),2));
  geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
}

/** Near-future road vehicles with conventional tyres and visible autonomy hardware. */
export function vehicleBody(model:VehicleModel, reflection?:THREE.Texture) {
  const root=new THREE.Group(),paint=surface(0xffffff,0.35,0.3),rubber=surface(0x20282a),metal=surface(0x718184,0.75,0.3);
  const glass=new THREE.MeshPhysicalMaterial({color:model==="VAN"?0x82999c:0x23363c,roughness:0.12,clearcoat:1,
    envMap:reflection??null,envMapIntensity:model==="VAN"?1.1:2.2,transparent:model==="VAN",opacity:model==="VAN"?0.46:1,
    depthWrite:model!=="VAN",side:model==="VAN"?THREE.DoubleSide:THREE.FrontSide});
  const spec=VEHICLES[model],height=spec.height/2;
  const b=(w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material)=>block(root,w,h,d,x,y-height,z,mat);
  const profile=(rows:Section[],mat:THREE.Material)=>loft(root,rows.map(s=>({...s,bottom:s.bottom-height,top:s.top-height})),mat);
  const round=(r:number,h:number,x:number,y:number,z:number,mat:THREE.Material)=>tube(root,r,h,x,y-height,z,mat,20);
  const dome=(r:number,x:number,y:number,z:number,mat:THREE.Material)=>{
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,16,8),mat);mesh.position.set(x,y-height,z);root.add(mesh);return mesh;
  };
  if(model==="CAB") {
    profile([{z:-2.16,bottom:0.45,top:0.69,width:0.66},{z:-1.96,bottom:0.38,top:0.82,width:0.85},
      {z:-1.55,bottom:0.35,top:0.96,width:0.9},{z:1.3,bottom:0.35,top:0.88,width:0.9},
      {z:1.98,bottom:0.39,top:0.77,width:0.83},{z:2.16,bottom:0.46,top:0.64,width:0.64}],paint);
    profile([{z:-1.52,bottom:0.88,top:0.98,width:0.77,roof:0.75},
      {z:-0.98,bottom:0.9,top:1.43,width:0.8,roof:0.66},{z:0.38,bottom:0.9,top:1.43,width:0.8,roof:0.66},
      {z:1.08,bottom:0.86,top:0.94,width:0.77,roof:0.73}],glass);
    profile([{z:-0.99,bottom:1.43,top:1.47,width:0.63},{z:-0.82,bottom:1.43,top:1.52,width:0.66},
      {z:0.19,bottom:1.43,top:1.52,width:0.66},{z:0.4,bottom:1.43,top:1.46,width:0.63}],paint);
    for(const side of [-1,1]) {
      const pillar=b(0.065,0.48,0.065,side*0.745,1.19,-0.3,rubber);pillar.rotation.z=side*0.27;
      b(0.035,0.018,1.75,side*0.897,0.61,-0.3,rubber);
      b(0.05,0.065,0.2,side*0.918,0.82,-0.65,metal);
      const mirror=dome(0.10,side*0.98,1.01,0.84,paint);mirror.scale.set(0.75,0.65,1.25);
    }
  } else {
    profile([{z:-2.69,bottom:0.38,top:1.98,width:0.87,roof:0.81},
      {z:-2.4,bottom:0.3,top:2.15,width:0.99,roof:0.87},
      {z:-0.3,bottom:0.3,top:2.15,width:0.99,roof:0.85},
      {z:0.02,bottom:0.3,top:2.0,width:0.96,roof:0.64}],paint);
    // Wide payload bay funnels into a central single-seat cockpit and pointed nose.
    profile([{z:0.04,bottom:0.3,top:1.03,width:0.95},
      {z:0.62,bottom:0.3,top:1.06,width:0.84},{z:1.9,bottom:0.32,top:0.97,width:0.56},
      {z:2.55,bottom:0.38,top:0.83,width:0.32},{z:2.71,bottom:0.45,top:0.69,width:0.20}],paint);
    profile([{z:0.04,bottom:1.05,top:2.02,width:0.62,roof:0.55},
      {z:0.38,bottom:1.07,top:2.04,width:0.61,roof:0.51},
      {z:1.34,bottom:1.03,top:1.78,width:0.52,roof:0.44},
      {z:2.16,bottom:0.98,top:1.04,width:0.37,roof:0.34}],glass);
    b(0.47,0.16,0.53,0,1.12,0.71,rubber);
    const back=b(0.44,0.53,0.12,0,1.42,0.42,rubber);back.rotation.x=-0.15;
    const head=dome(0.14,0,1.75,0.39,rubber);head.scale.set(1.2,0.65,0.55);
    b(0.66,0.14,0.21,0,1.23,1.27,rubber);
    const wheel=new THREE.Mesh(new THREE.TorusGeometry(0.16,0.022,6,20),metal);
    wheel.rotation.x=-0.36;wheel.position.set(0,1.43-height,1.13);root.add(wheel);
    for(const side of [-1,1]) {
      b(0.02,0.032,2.72,side*1.005,1.19,-0.99,rubber);
      b(0.02,1.45,0.025,side*0.983,1.24,-0.22,rubber);
      b(0.05,0.065,0.22,side*0.989,1.1,-0.62,metal);
      const mirror=dome(0.105,side*0.80,1.25,0.66,rubber);mirror.scale.set(0.6,1,1.3);
      const arch=new THREE.Mesh(new THREE.TorusGeometry(0.41,0.055,6,20,Math.PI),paint);
      arch.rotation.y=Math.PI/2;arch.position.set(side*(spec.width/2-0.03),0.36-height,spec.wheelbase/2);root.add(arch);
    }
    b(0.035,1.7,0.025,0,1.2,-2.706,rubber);
    b(0.13,0.08,0.035,0.16,1.04,-2.72,metal);
  }
  for(const side of [-1,1]) {
    b(0.065,0.12,spec.length*0.85,side*(spec.width/2-0.07),0.3,0,rubber);
    const sensor=dome(0.065,side*(model==="CAB"?0.65:0.23),model==="CAB"?0.66:0.69,spec.length/2-0.01,glass);
    sensor.scale.z=0.65;
  }
  b(spec.width*(model==="CAB"?0.65:0.22),0.10,0.10,0,0.44,spec.length/2-0.02,rubber);
  b(spec.width*0.8,0.10,0.13,0,0.42,-spec.length/2+0.015,rubber);
  b(0.33,0.075,0.05,0,0.59,-spec.length/2-0.015,metal);
  // A round lidar pod and four compact camera domes make autonomy visible at game scale.
  const lidarZ=model==="CAB"?-0.18:-0.62,roof=model==="CAB"?1.52:2.15;
  round(0.22,0.06,0,roof+0.03,lidarZ,rubber);
  round(0.19,0.11,0,roof+0.105,lidarZ,glass);
  const cap=dome(0.195,0,roof+0.16,lidarZ,paint);cap.scale.y=0.35;
  for(const side of [-1,1])for(const end of [-1,1]) {
    const camera=dome(0.085,side*(model==="CAB"?0.73:0.82),model==="CAB"?1.03:1.85,end*(model==="CAB"?1.02:0.35)- (model==="VAN"?1.05:0),rubber);
    camera.scale.set(1,0.8,1.2);
  }
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
        this.tint.setHex(mesh.userData.paint?c.color:0xffffff).multiplyScalar(c.hp?1:0.22);mesh.setColorAt(i,this.tint);
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
        const y=(this.model==="CAB"?0.66:front?0.74:1.0)+(indicator?-0.06:0.02);
        this.local.makeScale(indicator?0.09:0.18,0.065,0.038);
        const x=front&&this.model==="VAN"?(indicator?0.30:0.20):(indicator?0.71:0.55);
        this.local.setPosition(side*x,y-spec.height/2,(front?1:-1)*(spec.length/2+(front&&this.model==="VAN"?-0.19:0.015)));
        this.matrix.multiplyMatrices(this.pose,this.local);this.lamps.setMatrixAt(i*8+k,this.matrix);
        const blink=Math.floor(time*2.5)%2===0&&(hazards||(turning&&side===Math.sign(c.steering)));
        const color=!c.hp?0x1d2423:indicator?blink?0xeeb45c:0x473827:front?0xd5e1dc:c.braking?0xf25b43:0x8c332b;
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
