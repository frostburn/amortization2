import {afterEach,expect,test} from "vitest";
import {Simulation,type Actor} from "../src/game/simulation";
import {NightPortMission} from "../src/game/night-port-mission";
import {BERTH_SITES,BERTH_GATE_RESPONSE,NIGHT_PORT,berthLights} from "../src/game/night-port";
import {MARINE_PORT} from "../src/game/port";
import {STEP,RIFLE} from "../src/game/config";
import {NEXT_CONTRACT} from "../src/game/missions";
import {levelsForMode} from "../src/game/modes";
let sim:Simulation;
afterEach(()=>sim?.world.free());
const mission=()=>sim.mission as NightPortMission;
const ticks=(seconds:number)=>{for(let i=0;i<seconds/STEP;i++){sim.step();sim.events.length=0;}};
const place=(a:Actor,p:{x:number;z:number;y?:number})=>{a.body.setTranslation({x:p.x,y:(p.y??0)+.93,z:p.z},true);a.body.setLinvel({x:0,y:0,z:0},true);a.path=[];a.moveTarget=undefined;};
const kill=()=>mission().enemies.forEach(a=>sim.damage(a,a.hp,{x:0,y:0,z:0},a.body.translation(),"gun"));
const operators=()=>{place(sim.squad[0],BERTH_SITES.controls[0]);place(sim.squad[1],BERTH_SITES.controls[1]);};
const ready=async()=>{sim=await Simulation.create("nightport");mission().deploy();kill();mission().updateObjectives();};

test.each(["assault","sniper","minigunner"] as const)("%s deployment has a safe approach, both night modes, and preserves the daytime port",async model=>{
  sim=await Simulation.create("nightport",model);
  expect(NEXT_CONTRACT.nightforest).toBe("nightport");
  expect(levelsForMode("mission")).toContain("nightport");expect(levelsForMode("arena")).toContain("nightport");
  expect(levelsForMode("practice")).toContain("port");expect(sim.squad[3].model).toBe(model);
  expect(NIGHT_PORT.port!.separateHoists).toBe(true);expect(MARINE_PORT.port!.separateHoists).toBeUndefined();
  ticks(1);expect(sim.time).toBe(0);expect(mission().guards).toHaveLength(7);
  expect(sim.city!.porters.every(p=>p.grip)).toBe(true);
  mission().deploy();ticks(3);expect(mission().enemyShots).toBe(0);expect(sim.squad.every(a=>a.hp===a.maxHp)).toBe(true);
  sim.reset("port");expect(sim.night).toBeUndefined();expect(sim.mission).toBeUndefined();
});
test("a single operator cannot alternate the two separated controls to accumulate progress",async()=>{
  await ready();const m=mission();place(sim.squad[0],BERTH_SITES.controls[0]);
  for(let i=0;i<60;i++)m.updateObjectives();expect(m.releaseProgress).toBe(0);expect(m.operators).toEqual([1,null]);
  place(sim.squad[0],BERTH_SITES.controls[1]);for(let i=0;i<60;i++)m.updateObjectives();expect(m.releaseProgress).toBe(0);
  operators();for(let i=0;i<60;i++)m.updateObjectives();expect(m.releaseProgress).toBeCloseTo(1/12);
  place(sim.squad[1],{x:0,z:0});const progress=m.releaseProgress;for(let i=0;i<60;i++)m.updateObjectives();expect(m.releaseProgress).toBe(progress);
});
test("enemy proximity interrupts both operators and each finite response launches once",async()=>{
  await ready();operators();const m=mission();m.updateObjectives();m.updateCombat();expect(m.response).toHaveLength(3);
  sim.time+=7.1;m.updateCombat();expect(m.response).toHaveLength(6);expect(m.inspect().responseGroups).toBe(2);
  for(let i=0;i<5;i++)m.updateCombat();expect(m.response).toHaveLength(6);
  const enemy=m.response[0];place(enemy,BERTH_SITES.controls[0]);const progress=m.releaseProgress;
  m.updateObjectives();expect(m.contested).toEqual([true,false]);expect(m.releaseProgress).toBe(progress);
});
test("restoration resumes loaders, redirects lights, and creates a west response before extraction",async()=>{
  await ready();operators();const m=mission();m.updateObjectives();sim.time+=8;m.updateCombat();kill();
  const before=berthLights(false);m.releaseProgress=1;m.updateObjectives();expect(m.phase).toBe("return");
  expect(sim.city!.porters.every(p=>p.state==="travel")).toBe(true);
  expect(sim.night!.lights.filter(l=>l.id.startsWith("quay-")).map(l=>l.target)).not.toEqual(before.slice(0,2).map(l=>l.target));
  m.updateCombat();expect(m.gateResponseAt).toBeDefined();expect(m.response).toHaveLength(3);
  sim.squad.forEach((a,i)=>place(a,{x:BERTH_SITES.exit.x+(i%2?1:-1),z:i<2?1:-1}));
  for(let i=0;i<61;i++)m.updateObjectives();expect(m.phase).toBe("return");kill();
  for(let i=0;i<61;i++)m.updateObjectives();expect(m.phase).toBe("complete");
});
test("return response chooses another clear entry rather than spawning on a camping robot",async()=>{
  sim=await Simulation.create("nightport");mission().deploy();mission().restoredAt=0;
  place(sim.squad[0],BERTH_GATE_RESPONSE.positions[0]);mission().updateCombat();
  expect(mission().gateResponseAt).toBeDefined();expect(mission().response).toHaveLength(3);
  for(const a of mission().response)expect(Math.hypot(a.body.translation().x-sim.squad[0].body.translation().x,a.body.translation().z-sim.squad[0].body.translation().z)).toBeGreaterThanOrEqual(14);
});
test("lookout remains physically on its elevated post after an alert and accepts a real rifle hit",async()=>{
  sim=await Simulation.create("nightport","sniper");mission().deploy();
  const lookout=mission().guards.find(a=>a.model==="sniper")!;
  lookout.ai!.alertPosition={x:-66,y:0,z:0};ticks(1);
  expect(lookout.path).toHaveLength(0);expect(lookout.body.translation().y).toBeCloseTo(2.83,1);
  place(sim.squad[3],{x:35,z:25});sim.select(4);sim.chooseWeapon("rifle");sim.setBrace(true);sim.squad[3].braceTime=RIFLE.settle;sim.world.step();
  sim.aim={...lookout.body.translation(),y:lookout.body.translation().y+.5};sim.shoot(sim.squad[3]);expect(lookout.dead).toBe(true);
});
test("fully submerged enemies are disabled and loss of the squad fails the contract",async()=>{
  sim=await Simulation.create("nightport");mission().deploy();const lookout=mission().guards.find(a=>a.model==="sniper")!;
  lookout.body.setTranslation({x:55.8,y:-2,z:25},true);mission().updateCombat();expect(lookout.dead).toBe(true);
  sim.squad.forEach(a=>sim.damage(a,a.hp,{x:0,y:0,z:0},a.body.translation(),"gun"));mission().updateObjectives();expect(mission().phase).toBe("failed");
});
test("losing the second operator fails before restoration, but a lone survivor can extract afterwards",async()=>{
  await ready();const m=mission();
  sim.squad.slice(1).forEach(a=>sim.damage(a,a.hp,{x:0,y:0,z:0},a.body.translation(),"gun"));
  m.updateObjectives();expect(m.phase).toBe("failed");expect(m.failureReason).toMatch(/Two operators/);
  sim.reset("nightport");const restored=mission();restored.deploy();kill();operators();
  restored.updateObjectives();sim.time+=8;restored.updateCombat();kill();
  restored.releaseProgress=1;restored.updateObjectives();restored.updateCombat();kill();
  sim.squad.slice(1).forEach(a=>sim.damage(a,a.hp,{x:0,y:0,z:0},a.body.translation(),"gun"));
  place(sim.squad[0],BERTH_SITES.exit);
  for(let i=0;i<61;i++)restored.updateObjectives();expect(restored.phase).toBe("complete");
});
