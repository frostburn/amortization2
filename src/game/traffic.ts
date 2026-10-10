import RAPIER from "@dimforge/rapier3d-compat";
import { BLAST_RADIUS, STEP, clamp, distance2, type Vec2, type Vec3 } from "./config";
import { inWater, type CityDistrict } from "./city";
import type { Simulation } from "./simulation";

export const VEHICLES = {
  CAB: { width: 1.82, length: 4.4, height: 1.52, mass: 1450, hp: 250, speed: 6.2, wheelbase: 2.65 },
  VAN: { width: 2.04, length: 5.5, height: 2.18, mass: 2100, hp: 350, speed: 5.2, wheelbase: 3.1 },
} as const;
export type VehicleModel = keyof typeof VEHICLES;
export type TrafficPath = { id: string; points: Vec2[]; lengths: number[]; offsets: number[]; total: number };
export type CivilianVehicle = {
  id: number; model: VehicleModel; color: number; path: TrafficPath; segment: number; progress: number;
  body: RAPIER.RigidBody; colliders: RAPIER.Collider[]; previous: Vec3;
  previousRotation: { x: number; y: number; z: number; w: number };
  yaw: number; steering: number; hp: number; distance: number; laps: number;
  state: "cruise" | "yield" | "signal" | "alert" | "settling" | "stranded" | "disabled";
  alertUntil: number; impactUntil: number; settled: number; braking: boolean;
  nextSense: number; clearance: number;
  explodedAt?: number;
  commanded?: boolean; parked?: boolean; arrival?: Vec2;
};

/** Conservative bounds follow the body's pose and elevation, including a tipped wreck. */
export function vehicleFootprint(c:CivilianVehicle) {
  const p=c.body.translation(),q=c.body.rotation(),s=VEHICLES[c.model];
  const h=Math.abs(2*(q.x*q.y+q.w*q.z))*s.width+Math.abs(1-2*(q.x*q.x+q.z*q.z))*s.height+Math.abs(2*(q.y*q.z-q.w*q.x))*s.length;
  return {x:p.x,z:p.z,y:p.y-h/2,h,
    w:Math.abs(1-2*(q.y*q.y+q.z*q.z))*s.width+Math.abs(2*(q.x*q.y-q.w*q.z))*s.height+Math.abs(2*(q.x*q.z+q.w*q.y))*s.length,
    d:Math.abs(2*(q.x*q.z-q.w*q.y))*s.width+Math.abs(2*(q.y*q.z+q.w*q.x))*s.height+Math.abs(1-2*(q.x*q.x+q.y*q.y))*s.length};
}

function path(id: string, points: Vec2[]): TrafficPath {
  const lengths = points.map((p,i) => distance2(p, points[(i + 1) % points.length]));
  let total = 0;
  const offsets = lengths.map(d => { const offset = total; total += d; return offset; });
  return { id, points, lengths, offsets, total };
}
function rounded(id: string, points: Vec2[], radius: number) {
  const samples: Vec2[] = [];
  for (const [i,p] of points.entries()) {
    const prev = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
    const incoming = distance2(prev,p), outgoing = distance2(p,next), r = Math.min(radius, incoming / 3, outgoing / 3);
    const a = { x: p.x + (prev.x-p.x) * r/incoming, z: p.z + (prev.z-p.z) * r/incoming };
    const b = { x: p.x + (next.x-p.x) * r/outgoing, z: p.z + (next.z-p.z) * r/outgoing };
    // Quadratic corner fillet. The long connecting segments stay exactly in lane.
    for (let j = 0; j <= 8; j++) {
      const t = j / 8, s = 1-t;
      samples.push({ x: s*s*a.x + 2*s*t*p.x + t*t*b.x, z: s*s*a.z + 2*s*t*p.z + t*t*b.z });
    }
  }
  return path(id, samples);
}

/** Lane geometry comes from the same road dimensions as the visible asphalt.
 * Block loops use right-hand lanes; districts without blocks use end turnarounds. */
export function trafficPaths(district: CityDistrict): TrafficPath[] {
  const xs = district.streets.filter(s => s.axis === "z").sort((a,b) => a.at-b.at);
  const zs = district.streets.filter(s => s.axis === "x").sort((a,b) => a.at-b.at);
  const result: TrafficPath[] = [];
  for (let x = 0; x < xs.length-1; x++) for (let z = 0; z < zs.length-1; z++) {
    const left=xs[x], right=xs[x+1], back=zs[z], front=zs[z+1];
    if ([left,right].some(s => back.at < s.center-s.length/2 || front.at > s.center+s.length/2) ||
      [back,front].some(s => left.at < s.center-s.length/2 || right.at > s.center+s.length/2)) continue;
    const corners = [{x:left.at,z:back.at},{x:right.at,z:back.at},{x:right.at,z:front.at},{x:left.at,z:front.at}];
    const lane = Math.min(left.width,right.width,back.width,front.width)*0.24;
    for (const reverse of [false,true]) {
      const loop = reverse ? [...corners].reverse() : corners;
      const shifted = loop.map((p,i) => {
        const a=loop[(i+3)%4], b=loop[(i+1)%4], d1=distance2(a,p), d2=distance2(p,b);
        return { x:p.x-((p.z-a.z)/d1+(b.z-p.z)/d2)*lane,
          z:p.z+((p.x-a.x)/d1+(b.x-p.x)/d2)*lane };
      });
      result.push(rounded(`block-${x}-${z}-${reverse?"out":"in"}`,shifted,4));
    }
  }
  if (result.length) return result;
  for (const [i,s] of district.streets.entries()) {
    const lane=s.width*0.24, reach=s.length/2-7, points:Vec2[]=[];
    const convert=(along:number,across:number):Vec2 => s.axis==="z"
      ? {x:s.at+across,z:s.center+along} : {x:s.center+along,z:s.at-across};
    // U-turns are beyond the playable district, wholly inside the continuing road.
    for (const end of [1,-1]) for (let j=0;j<=16;j++) {
      const angle=Math.PI*j/16;
      points.push(convert(end*(reach+Math.sin(angle)*lane),-end*Math.cos(angle)*lane));
    }
    result.push(path(`through-${i}`,points));
  }
  return result;
}
export function trafficJunctions(district: CityDistrict) {
  return district.streets.filter(s=>s.axis==="x").flatMap(x=>district.streets.filter(z=>z.axis==="z" &&
    z.at>=x.center-x.length/2 && z.at<=x.center+x.length/2 && x.at>=z.center-z.length/2 && x.at<=z.center+z.length/2)
    .map(z=>({x:z.at,z:x.at})));
}
export function pointOnTrafficPath(p:TrafficPath, progress:number) {
  const d=((progress%p.total)+p.total)%p.total;
  let i=p.points.length-1;
  while(i>0 && p.offsets[i]>d)i--;
  const a=p.points[i],b=p.points[(i+1)%p.points.length],t=(d-p.offsets[i])/p.lengths[i];
  return { point:{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}, segment:i };
}

/** Bounded local traffic controller. No per-car navigation grid or body teleporting. */
export class StreetTraffic {
  cars:CivilianVehicle[]=[];
  private handles=new Map<number,CivilianVehicle>();
  private junctions:Vec2[];
  private reservations=new Map<number,number>();
  private detonations=new Set<CivilianVehicle>();
  constructor(private sim:Simulation,private district:CityDistrict) {
    this.junctions=trafficJunctions(district);
    const paths=trafficPaths(district), colors=[0xc8c6b8,0x687f87,0x98695d,0x89937d,0xb7a980,0x52636e];
    for (const [j,p] of paths.entries()) for (let n=0;n<(paths.length<4?2:1);n++) {
      const model:VehicleModel=(j+n)%3===0?"VAN":"CAB";
      const progress=p.total*((paths.length<4?n*0.5:0)+(0.12+(j%4)*0.17));
      this.spawn(model, colors[(j+n)%colors.length], p, progress);
    }
  }
  private spawn(model: VehicleModel, color: number, p: TrafficPath, progress: number) {
      const spec=VEHICLES[model];
      const start=pointOnTrafficPath(p,progress),next=pointOnTrafficPath(p,progress+1).point;
      const yaw=Math.atan2(next.x-start.point.x,next.z-start.point.z);
      const body=this.sim.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start.point.x,spec.height/2+0.01,start.point.z)
        .lockRotations().setLinearDamping(0.15).setAngularDamping(3).setCcdEnabled(true));
      body.setRotation({x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)},true);
      const hull=(rows:{z:number;width:number;bottom:number;top:number;roof?:number}[])=>RAPIER.ColliderDesc.convexHull(new Float32Array(rows.flatMap(s=>[
        -s.width,s.bottom-spec.height/2,s.z,s.width,s.bottom-spec.height/2,s.z,
        -(s.roof??s.width),s.top-spec.height/2,s.z,s.roof??s.width,s.top-spec.height/2,s.z,
      ])))!;
      const lowerShape=model==="CAB"?RAPIER.ColliderDesc.cuboid(spec.width/2,0.48,spec.length/2).setTranslation(0,0.48-spec.height/2,0)
        :hull([{z:-2.75,width:0.99,bottom:0,top:0.96},{z:0.4,width:0.92,bottom:0,top:0.96},{z:2.75,width:0.22,bottom:0,top:0.72}]);
      const upperShape=model==="CAB"?RAPIER.ColliderDesc.cuboid(spec.width*0.44,(spec.height-0.9)/2,1.25).setTranslation(0,(spec.height+0.9)/2-spec.height/2,-0.25)
        :hull([{z:-2.69,width:0.87,roof:0.81,bottom:0.9,top:1.98},{z:-2.4,width:0.99,roof:0.87,bottom:0.9,top:2.15},
          {z:-0.3,width:0.99,roof:0.85,bottom:0.9,top:2.15},{z:0.38,width:0.61,roof:0.51,bottom:0.96,top:2.04},
          {z:1.34,width:0.52,roof:0.44,bottom:0.96,top:1.78},{z:2.16,width:0.37,roof:0.34,bottom:0.96,top:1.04}]);
      const lower=this.sim.world.createCollider(lowerShape.setMass(spec.mass*0.75).setFriction(0.05)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min),body);
      const cabin=this.sim.world.createCollider(upperShape.setMass(spec.mass*0.25).setFriction(0.05),body);
      const c:CivilianVehicle={id:4000+this.cars.length,model,color,path:p,segment:start.segment,progress,
        body,colliders:[lower,cabin],previous:{...body.translation()},previousRotation:{...body.rotation()},yaw,steering:0,
        hp:spec.hp,distance:0,laps:0,state:"cruise",alertUntil:0,impactUntil:0,settled:0,braking:false,nextSense:0,clearance:100};
      this.cars.push(c);c.colliders.forEach(collider=>this.handles.set(collider.handle,c));
      return c;
  }
  /** Parked contract vehicles share collision, explosions and tyre physics with traffic. */
  park(model: VehicleModel, color: number, position: Vec2, yaw: number) {
    const p=path(`service-${this.cars.length}`, [position,
      {x:position.x+Math.sin(yaw)*8,z:position.z+Math.cos(yaw)*8}]);
    const c=this.spawn(model,color,p,0);
    c.commanded=true;c.parked=true;
    return c;
  }
  go(c: CivilianVehicle, goal: Vec2) {
    if(!c.hp)return;
    const p=c.body.translation();
    c.path=path(c.path.id,[{x:p.x,z:p.z},goal]);
    c.progress=0;c.segment=0;c.commanded=true;c.parked=false;c.arrival={...goal};
  }

  neutral(handle:number){return this.handles.get(handle);}
  disturb(from:Vec3,to:Vec3,duration:number) {
    const dx=to.x-from.x,dz=to.z-from.z,length=dx*dx+dz*dz||1;
    for(const c of this.cars) {
      if(!c.hp)continue;
      const p=c.body.translation(),t=clamp(((p.x-from.x)*dx+(p.z-from.z)*dz)/length,0,1);
      if(distance2(p,from)<20 || distance2(p,{x:from.x+dx*t,z:from.z+dz*t})<5)
        c.alertUntil=Math.max(c.alertUntil,this.sim.time+duration);
    }
  }
  damage(c:CivilianVehicle,damage:number,impulse:Vec3,point:Vec3) {
    const alive=c.hp>0;
    c.hp=Math.max(0,c.hp-damage);c.impactUntil=this.sim.time+0.6;c.settled=0;
    c.body.lockRotations(false,true);c.body.setLinearDamping(0.3);c.body.setAngularDamping(2.5);
    c.colliders.forEach(h=>h.setFriction(0.6));c.body.applyImpulseAtPoint(impulse,point,true);
    for(const [velocity,limit,spin] of [[c.body.linvel(),9,false],[c.body.angvel(),2.5,true]] as const) {
      const speed=Math.hypot(velocity.x,velocity.y,velocity.z);
      if(speed<=limit)continue;
      const bounded={x:velocity.x*limit/speed,y:velocity.y*limit/speed,z:velocity.z*limit/speed};
      if(spin)c.body.setAngvel(bounded,true);else c.body.setLinvel(bounded,true);
    }
    c.state=c.hp?"settling":"disabled";
    if(alive&&!c.hp) {
      this.detonations.add(c);
      this.sim.events.push({type:"down",position:{...c.body.translation()}});
    }
  }
  blast(origin:Vec3,source?:RAPIER.RigidBody) {
    for(const c of this.cars) {
      if(c.body===source)continue;
      const p=c.body.translation(),d=Math.hypot(p.x-origin.x,p.y-origin.y,p.z-origin.z);
      if(d>=BLAST_RADIUS || this.sim.ray(origin,p,c.body,h=>!source||h.parent()?.handle!==source.handle))continue;
      const f=1-d/BLAST_RADIUS,strength=500*f;
      this.damage(c,160*Math.sqrt(f),{x:(p.x-origin.x)/Math.max(d,0.4)*strength,y:strength*0.4,
        z:(p.z-origin.z)/Math.max(d,0.4)*strength},p);
    }
  }
  private locate(c:CivilianVehicle,all=false) {
    const p=c.body.translation(),path=c.path;
    let best=Infinity,progress=c.progress,segment=c.segment;
    for(let k=all?0:-3;k<(all?path.points.length:5);k++) {
      const i=all?k:((c.segment+k)%path.points.length+path.points.length)%path.points.length,a=path.points[i],b=path.points[(i+1)%path.points.length];
      const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(path.lengths[i]**2),0,1);
      const d=distance2(p,{x:a.x+dx*t,z:a.z+dz*t});
      if(d<best){best=d;segment=i;progress=path.offsets[i]+path.lengths[i]*t;}
    }
    if(c.progress>path.total-5&&progress<5)c.laps++;
    c.segment=segment;c.progress=progress;return best;
  }
  private firstAtJunction(j:Vec2,signalled:boolean) {
    let first:CivilianVehicle|undefined,nearest=Infinity;
    for(const c of this.cars) {
      if(!c.hp||c.impactUntil||c.parked||c.alertUntil>this.sim.time)continue;
      const p=c.body.translation(),fx=Math.sin(c.yaw),fz=Math.cos(c.yaw);
      const ahead=(j.x-p.x)*fx+(j.z-p.z)*fz;
      if(ahead<5.8||ahead>14||Math.abs((j.x-p.x)*fz-(j.z-p.z)*fx)>4.5)continue;
      if(signalled&&Math.floor(this.sim.time/10)%2!==(Math.abs(fx)>Math.abs(fz)?0:1))continue;
      const distance=distance2(p,j);
      if(distance<nearest){first=c;nearest=distance;}
    }
    return first?.id;
  }
  update() {
    const now=this.sim.time;
    // Newly destroyed neighbours join the same bounded Set iteration. No
    // recursive damage/blast calls, and each vehicle crosses zero health once.
    for(const c of this.detonations) {
      this.detonations.delete(c);c.explodedAt=now;
      this.sim.explodeVehicle(c.body,c.id);
    }
    for(const [j,id] of this.reservations) {
      const c=this.cars.find(c=>c.id===id)!;
      // Retain the reservation throughout the 14 m approach zone. Releasing
      // it at 12 m let a queued follower reserve ahead of its own leader.
      if(!c.hp||c.impactUntil||distance2(c.body.translation(),this.junctions[j])>16)this.reservations.delete(j);
    }
    for(const c of this.cars) {
      const spec=VEHICLES[c.model],p=c.body.translation(),v=c.body.linvel(),speed=Math.hypot(v.x,v.z);
      c.previous={...p};c.previousRotation={...c.body.rotation()};c.distance+=speed*STEP;
      if(!c.hp)continue;
      if(!c.impactUntil&&this.district.water.some(w=>inWater(p,w)))c.impactUntil=now+0.6;
      if(c.impactUntil) {
        c.state="settling";c.braking=true;
        const q=c.body.rotation();
        const supported=!!this.sim.ray(p,{x:p.x,y:p.y-spec.height/2-0.3,z:p.z},c.body);
        c.settled=speed<0.25&&Math.abs(v.y)<0.15&&now>=c.impactUntil&&supported?c.settled+STEP:0;
        if(c.settled<0.6)continue;
        if(1-2*(q.x*q.x+q.z*q.z)<0.9||this.locate(c,true)>2.5||this.district.water.some(w=>inWater(p,w))) {
          c.state="stranded";continue;
        }
        c.yaw=Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.z*q.z));
        const ahead=pointOnTrafficPath(c.path,c.progress+3).point;
        const turn=Math.atan2(ahead.x-p.x,ahead.z-p.z)-c.yaw;
        if(Math.cos(turn)<0.5){c.state="stranded";continue;}
        c.body.lockRotations(true,true);c.body.setAngvel({x:0,y:0,z:0},true);
        c.colliders.forEach(h=>h.setFriction(0.05));c.body.setLinearDamping(0.15);c.impactUntil=0;
      }
      if(c.arrival&&distance2(p,c.arrival)<.6){c.parked=true;c.arrival=undefined;}
      if(!c.commanded)this.locate(c);
      const target=c.commanded ? c.arrival ?? {x:p.x+Math.sin(c.yaw),z:p.z+Math.cos(c.yaw)}
        : pointOnTrafficPath(c.path,c.progress+1.7+speed*0.35).point;
      const wanted=Math.atan2(target.x-p.x,target.z-p.z),angle=Math.atan2(Math.sin(wanted-c.yaw),Math.cos(wanted-c.yaw));
      const forward={x:Math.sin(c.yaw),z:Math.cos(c.yaw)};
      let desired=Math.min(spec.speed,Math.max(1.4,spec.speed/(1+Math.abs(angle)*7)));
      c.state="cruise";
      if(c.nextSense<=now) {
        c.nextSense=now+0.1;c.clearance=100;
        for(const side of [-0.44,0,0.44]) {
          const from={x:p.x+forward.x*(spec.length/2+0.08)+forward.z*spec.width*side,
            y:0.35,z:p.z+forward.z*(spec.length/2+0.08)-forward.x*spec.width*side};
          const hit=this.sim.ray(from,{x:from.x+forward.x*10,y:from.y,z:from.z+forward.z*10},c.body);
          if(hit)c.clearance=Math.min(c.clearance,hit.timeOfImpact);
        }
      } else c.clearance=Math.max(0,c.clearance-speed*STEP);
      const safe=Math.sqrt(Math.max(0,2*7*(c.clearance-1.2)));
      if(safe<desired){desired=safe;c.state="yield";}
      for(const [i,j] of this.junctions.entries()) {
        const ahead=(j.x-p.x)*forward.x+(j.z-p.z)*forward.z;
        const across=Math.abs((j.x-p.x)*forward.z-(j.z-p.z)*forward.x);
        if(ahead<5.8||ahead>14||across>4.5)continue;
        const signalled=this.district.junctions.some(s=>distance2(s,j)<0.1);
        const red=signalled&&Math.floor(now/10)%2!==(Math.abs(forward.x)>Math.abs(forward.z)?0:1);
        if(!this.reservations.has(i)) {
          const first=this.firstAtJunction(j,signalled);
          if(first!==undefined)this.reservations.set(i,first);
        }
        const owner=this.reservations.get(i);
        if(red || (owner!==undefined&&owner!==c.id)) {
          desired=Math.min(desired,Math.sqrt(Math.max(0,2*7*(ahead-8))));c.state=red?"signal":"yield";
          if(red&&owner===c.id)this.reservations.delete(i);
        }
      }
      if(c.arrival)desired=Math.min(desired,Math.sqrt(2*4*Math.max(0,distance2(p,c.arrival)-.25)));
      if(c.parked){desired=0;c.state="yield";}
      if(!c.commanded&&c.alertUntil>now){desired=0;c.state="alert";}
      c.braking=desired<speed-0.2||c.state!=="cruise";
      const turn=clamp(angle,-STEP*1.3,STEP*1.3)*Math.min(1,speed);
      c.yaw+=turn;c.steering=clamp(Math.atan(turn/STEP*spec.wheelbase/Math.max(1,speed)),-0.7,0.7);
      c.body.setRotation({x:0,y:Math.sin(c.yaw/2),z:0,w:Math.cos(c.yaw/2)},true);
      const fx=Math.sin(c.yaw),fz=Math.cos(c.yaw);
      // Tyres resist sideways slip independently of engine acceleration/braking.
      // Impacted vehicles skip this controller until they have settled upright.
      const drive=clamp(desired-(v.x*fx+v.z*fz),-STEP*7,STEP*2.4);
      const grip=clamp(-(v.x*fz-v.z*fx),-STEP*10,STEP*10);
      c.body.applyImpulse({x:(fx*drive+fz*grip)*spec.mass,y:0,z:(fz*drive-fx*grip)*spec.mass},true);
    }
  }
  inspect(){return this.cars.map(c=>({id:c.id,model:c.model,state:c.state,hp:c.hp,distance:c.distance,laps:c.laps,
    explodedAt:c.explodedAt,
    route:c.path.id,parked:c.parked,steering:c.steering,braking:c.braking,alertUntil:c.alertUntil,
    position:{...c.body.translation()},rotation:{...c.body.rotation()},velocity:{...c.body.linvel()}}));}
}
