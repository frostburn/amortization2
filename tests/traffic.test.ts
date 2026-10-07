import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Simulation } from "../src/game/simulation";
import { CITY_DISTRICT, type CityDistrict } from "../src/game/city";
import { MARINE_PORT } from "../src/game/port";
import { VEHICLES, pointOnTrafficPath, trafficPaths, type CivilianVehicle } from "../src/game/traffic";
import { STEP, distance2 } from "../src/game/config";
import RAPIER from "@dimforge/rapier3d-compat";

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
  test.each(["CAB","VAN"] as const)("sufficient rifle fire detonates a %s once, damages nearby robots and leaves a physical wreck",model=>{
    const c=sim.city!.vehicles.find(c=>c.model===model)!;position(c,0,-20,0);
    const ally=sim.squad[0],shooter=sim.squad[3],cart=sim.city!.carts[0];
    shooter.body.setTranslation({x:-10,y:0.98,z:-20},true);
    ally.body.setTranslation({x:0,y:0.98,z:-16.4},true);
    cart.body.setTranslation({x:0,y:0.31,z:-25},true);
    const enemy=sim.addEnemy("assault",{x:5,z:-20});
    sim.select(4);sim.chooseWeapon("rifle");sim.setBrace(true);shooter.braceTime=1;
    sim.world.step();sim.aim={x:0,y:1.1,z:-20};
    for(let i=0;i<3&&c.hp;i++){shooter.shotWait=0;sim.shoot(shooter);}
    expect(c.hp).toBe(0);ticks(sim,0.02);
    const blasts=()=>sim.events.filter(e=>e.type==="explosion"&&e.vehicle===c.id);
    expect(blasts()).toHaveLength(1);expect(blasts()[0]).toMatchObject({team:"neutral",affected:0});
    expect(ally.hp).toBeLessThan(ally.maxHp);expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(cart.hp).toBe(0);expect(cart.body.linvel().z).toBeLessThan(-0.1);
    expect(shooter.hp).toBe(shooter.maxHp);expect(sim.hits).toBe(0);expect(sim.grenadeHits).toBe(0);
    expect(c.body.mass()).toBeCloseTo(VEHICLES[model].mass);expect(c.body.linvel().y).toBeGreaterThan(1);
    expect(c.colliders.every(h=>h.isValid())).toBe(true);
    sim.city!.damage(c,100,{x:0,y:0,z:0},c.body.translation());ticks(sim,0.1);expect(blasts()).toHaveLength(1);
  });
  test("a grenade initiates a bounded chain reaction, and reset restores unexploded vehicles",()=>{
    const [a,b]=sim.city!.vehicles.filter(c=>c.model==="CAB");position(a,0,-20,0);position(b,4.8,-20,0);
    a.hp=35;b.hp=40;sim.primary.body.setTranslation({x:-10,y:0.98,z:-20},true);
    sim.world.step();expect(sim.throwGrenade({x:-2,z:-20})).toBe(true);
    const grenade=sim.grenades[0];grenade.body.setTranslation({x:-2,y:0.3,z:-20},true);sim.world.step();sim.explode(grenade);
    expect(a.hp).toBe(0);expect(b.hp).toBe(40);ticks(sim,0.02);
    expect(b.hp).toBe(0);expect(sim.events.filter(e=>e.type==="explosion"&&e.vehicle!==undefined)).toHaveLength(2);
    expect(a.explodedAt).toBe(b.explodedAt);expect(sim.grenadeHits).toBe(0);
    ticks(sim,0.2);expect(sim.events.filter(e=>e.type==="explosion"&&e.vehicle!==undefined)).toHaveLength(2);
    sim.reset();expect(sim.city!.vehicles.every(c=>c.hp===VEHICLES[c.model].hp&&c.explodedAt===undefined)).toBe(true);
    ticks(sim,0.1);expect(sim.events.some(e=>e.type==="explosion")).toBe(false);
  });
  test("vehicle pressure ignores its source hull but still respects solid cover",()=>{
    const c=sim.city!.vehicles.find(c=>c.model==="CAB")!;position(c,0,-20,0);
    const shielded=sim.squad[0],exposed=sim.squad[1];
    shielded.body.setTranslation({x:4,y:0.98,z:-20},true);exposed.body.setTranslation({x:0,y:0.98,z:-16.5},true);
    const wall=sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(2,1.5,-20));
    sim.world.createCollider(RAPIER.ColliderDesc.cuboid(0.4,1.5,3),wall);sim.world.step();
    sim.city!.damage(c,1000,{x:0,y:0,z:0},c.body.translation());ticks(sim,0.02);
    expect(shielded.hp).toBe(shielded.maxHp);expect(exposed.hp).toBeLessThan(exposed.maxHp);
    expect(sim.grenadeHits).toBe(0);
  });
  test("VAN collision geometry follows the narrowed nose instead of a full-width box",()=>{
    const c=sim.city!.vehicles.find(c=>c.model==="VAN")!;position(c,0,-20,0);sim.world.step();
    const from={x:-3,y:0.5,z:-17.4};
    expect(sim.ray(from,{...from,x:-0.5})).toBeNull();
    expect(sim.city!.neutral(sim.ray(from,{...from,x:0})!.collider.handle)).toBe(c);
  });
});
