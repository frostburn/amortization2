import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Simulation } from "../src/game/simulation";
import { CITY_DISTRICT, type CityDistrict } from "../src/game/city";
import { MARINE_PORT } from "../src/game/port";
import { VEHICLES, pointOnTrafficPath, trafficPaths, type CivilianVehicle } from "../src/game/traffic";
import { STEP, distance2 } from "../src/game/config";

const ticks=(sim:Simulation,seconds:number)=>{for(let i=0;i<Math.ceil(seconds/STEP);i++)sim.step();};
const road=(d:CityDistrict,x:number,z:number)=>d.streets.some(s=>s.axis==="x"
  ? Math.abs(z-s.at)<=s.width/2+0.05&&Math.abs(x-s.center)<=s.length/2
  : Math.abs(x-s.at)<=s.width/2+0.05&&Math.abs(z-s.center)<=s.length/2);

describe("self-driving street traffic",()=>{
  let sim:Simulation;
  beforeEach(async()=>{sim=await Simulation.create("city");});
  afterEach(()=>sim.world.free());
  function position(c:CivilianVehicle,x:number,z:number,yaw:number) {
    c.body.setTranslation({x,y:VEHICLES[c.model].height/2+0.01,z},true);
    c.body.setLinvel({x:0,y:0,z:0},true);c.yaw=yaw;
    c.body.setRotation({x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)},true);c.nextSense=0;
    c.segment=c.path.points.map((p,i)=>({i,d:distance2(p,{x,z})})).sort((a,b)=>a.d-b.d)[0].i;
  }
  test.each([CITY_DISTRICT,MARINE_PORT])("derived lane routes keep both vehicle footprints on continuous roads",district=>{
    for(const path of trafficPaths(district))for(let d=0;d<path.total;d+=1.1) {
      const p=pointOnTrafficPath(path,d).point,q=pointOnTrafficPath(path,d+0.1).point,l=distance2(p,q);
      const forward={x:(q.x-p.x)/l,z:(q.z-p.z)/l};
      for(const spec of Object.values(VEHICLES))for(const a of [-1,1])for(const b of [-1,1]) {
        const x=p.x+forward.x*a*spec.length/2+forward.z*b*spec.width/2;
        const z=p.z+forward.z*a*spec.length/2-forward.x*b*spec.width/2;
        expect(road(district,x,z),`${path.id} leaves road at ${x}, ${z}`).toBe(true);
      }
    }
  });
  test("both models circulate, stay in lanes, and do not accumulate vehicles",()=>{
    expect(sim.city!.vehicles).toHaveLength(12);
    expect(new Set(sim.city!.vehicles.map(c=>c.model))).toEqual(new Set(["CAB","VAN"]));
    ticks(sim,45);
    for(const c of sim.city!.vehicles) {
      const p=c.body.translation();
      expect(c.body.mass()).toBeCloseTo(VEHICLES[c.model].mass);
      expect(c.distance,`${c.id} stalled on ${c.path.id}`).toBeGreaterThan(20);
      expect(road(CITY_DISTRICT,p.x,p.z),`${c.id} left its road`).toBe(true);
      expect(Math.hypot(c.body.rotation().x,c.body.rotation().z)).toBeLessThan(0.001);
      expect(Math.hypot(c.body.linvel().x,c.body.linvel().z)).toBeLessThan(VEHICLES[c.model].speed+0.1);
    }
    expect(sim.city!.vehicles).toHaveLength(12);expect(sim.events.filter(e=>e.type==="wave")).toHaveLength(0);
  });
  test("an approaching car brakes for a robot and continues when the road clears",()=>{
    const c=sim.city!.vehicles.find(c=>c.path.id==="block-1-1-in")!;
    position(c,-30,45.24,-Math.PI/2);
    const a=sim.squad[0];a.body.setTranslation({x:-37,y:0.98,z:45.24},true);
    sim.world.step();ticks(sim,5);
    expect(c.state).toBe("yield");expect(distance2(c.body.translation(),a.body.translation())).toBeGreaterThan(3);
    expect(Math.hypot(c.body.linvel().x,c.body.linvel().z)).toBeLessThan(0.2);
    a.body.setTranslation({x:-37,y:0.98,z:40},true);sim.world.step();ticks(sim,3);
    expect(c.state).toBe("cruise");expect(c.body.translation().x).toBeLessThan(-34);
  });
  test("a red signal stops vehicles before the central crossing; green releases them",()=>{
    const c=sim.city!.vehicles.find(c=>c.path.id==="block-1-0-in")!;
    // Southbound lane on the western side of the central vertical road.
    position(c,-2.76,-15,0);sim.time=1;sim.world.step();ticks(sim,3);
    expect(c.state).toBe("signal");expect(c.body.translation().z).toBeLessThan(-7.8);
    sim.time=11;ticks(sim,2);
    expect(c.body.translation().z).toBeGreaterThan(-12);
  });
  test("a queued follower cannot reserve a junction ahead of its own leader",()=>{
    sim.city!.vehicles.forEach((c,i)=>position(c,200+i*10,200,0));
    const rear=sim.city!.vehicles.find(c=>c.path.id==="block-2-0-in")!;
    const front=sim.city!.vehicles.find(c=>c.path.id==="block-2-1-out")!;
    position(rear,13.5,-2.76,-Math.PI/2);position(front,8,-2.76,-Math.PI/2);
    sim.time=1;sim.world.step();ticks(sim,4);
    expect(front.body.translation().x).toBeLessThan(5);
    expect(rear.body.translation().x).toBeLessThan(12);
  });
  test("combat causes a local hazard stop, then traffic resumes after quiet",()=>{
    const c=sim.city!.vehicles[0],far=sim.city!.vehicles.find(v=>distance2(v.body.translation(),c.body.translation())>60)!;
    ticks(sim,1);sim.city!.disturb(c.body.translation());ticks(sim,1.5);
    expect(c.state).toBe("alert");expect(Math.hypot(c.body.linvel().x,c.body.linvel().z)).toBeLessThan(0.2);
    expect(far.alertUntil).toBe(0);
    const before=c.distance;ticks(sim,9);expect(c.state).not.toBe("alert");expect(c.distance).toBeGreaterThan(before+1);
  });
  test("rifle hits and blasts affect heavy neutral bodies without hostile credit; wrecks remain cover",()=>{
    const c=sim.city!.vehicles[0];position(c,6,4,0);
    sim.select(4);sim.chooseWeapon("rifle");const a=sim.primary;
    a.body.setTranslation({x:0,y:0.98,z:4},true);sim.world.step();sim.setBrace(true);a.braceTime=1;
    sim.aim={x:6,y:1.1,z:4};sim.shoot(a);
    expect(c.hp).toBe(VEHICLES[c.model].hp-140);expect(c.state).toBe("settling");
    expect(c.body.linvel().x).toBeGreaterThan(0);expect(sim.hits).toBe(0);
    const before=c.hp;sim.city!.blast({x:3,y:0.5,z:4});expect(c.hp).toBeLessThan(before);expect(sim.grenadeHits).toBe(0);
    sim.city!.damage(c,1000,{x:0,y:0,z:0},c.body.translation());
    expect(c.state).toBe("disabled");sim.world.step();
    expect(sim.city!.neutral(sim.ray({x:0,y:0.5,z:4},{x:8,y:0.5,z:4},a.body)!.collider.handle)).toBe(c);
    const events=sim.events.filter(e=>e.type==="down").length;
    sim.city!.damage(c,10,{x:200,y:0,z:0},c.body.translation());
    expect(sim.events.filter(e=>e.type==="down")).toHaveLength(events);
  });
  test("reset and district changes restore deterministic traffic and release previous bodies",()=>{
    const starts=sim.city!.traffic.inspect();ticks(sim,2);sim.reset();expect(sim.city!.traffic.inspect()).toEqual(starts);
    sim.reset("port");expect(sim.city!.vehicles).toHaveLength(6);ticks(sim,3);
    expect(sim.city!.vehicles.some(c=>c.distance>3)).toBe(true);
    sim.reset("arena");expect(sim.city).toBeUndefined();expect(sim.actors).toHaveLength(4);
  });
  test("movement orders route around a disabled car's current rotated footprint",()=>{
    const c=sim.city!.vehicles.find(c=>c.model==="CAB")!;position(c,0,13,Math.PI/2);
    sim.city!.damage(c,1000,{x:0,y:0,z:0},c.body.translation());sim.world.step();
    sim.select(1);sim.move({x:0,z:25});
    expect(sim.primary.path.some(p=>Math.abs(p.x)>2)).toBe(true);
    ticks(sim,15);expect(distance2(sim.primary.body.translation(),{x:0,z:25})).toBeLessThan(1);
    expect(sim.hits).toBe(0);
  });
});
