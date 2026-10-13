import { MAGAZINE, PISTOL, STEP, distance2, type Vec2, type Firearm } from "./config";
import { updateEnemy, type EnemyProfile } from "./enemies";
import { Mission, type MissionDefinition } from "./missions";
import { BERTH_GUARDS, BERTH_RESPONSE, BERTH_GATE_RESPONSE, BERTH_SITES, BERTH_RESTART_SECONDS } from "./night-port";
import type { Actor, Simulation } from "./simulation";

export const DEMURRAGE_CONTRACT = {
  id: "nightport", number: "09", title: "Demurrage", location: "Wharf Cooperative · Marine berth, 02:40",
  summary: "Gannet has locked the cooperative's cranes overnight, then billed it for failing to load. Reclaim both crane controls and reopen the berth before the invented failure becomes grounds for a takeover.",
  selectableSquad: true,
  briefing: [
    {speaker:"morrow",message:"The inspectors have Birchwater. Back at the port, Gannet has locked the cooperative's cranes and started charging for the delay. Their guarantee transfers the berth if loading fails. Take back the controls, restore loading and get the squad home."},
    {speaker:"vale",message:"The control stands are beside the north and south cranes. They need two robots at once; use the other two to cover the container aisles. A rifle lookout is aboard the freighter, above the quay. The gatehouse crew can see our service van from here."},
    {speaker:"sable",message:"Keep a robot inside each painted control bay for twelve seconds while I restore the paired safety circuit. Nearby enemy machines interrupt it. Progress holds if you step away. The loaders will resume, the work lights will turn onto the approaches, and Gannet will send a squad to cut off the service gate."},
  ],
  objectives: ["Reclaim both crane controls", "Hold both control bays and restore loading", "Defeat the response and recover the squad at the service gate"],
  releaseSeconds: BERTH_RESTART_SECONDS, returnSeconds: 1,
} as const satisfies MissionDefinition;
const GUN: EnemyProfile = {brace:true,grenades:false,automaticBurst:.2,attackInterval:2.6,reactionTime:1,
  noticeRange:44,automaticRange:34,leash:14};
const PISTOLS: EnemyProfile = {...GUN,brace:false,pistolRange:23,attackInterval:1.5};
const LOOKOUT: EnemyProfile = {...GUN,fixedPost:true,noticeRange:52,reactionTime:1.4};

/** Two concurrent physical operators, finite counterattack, then a contested return. */
export class NightPortMission extends Mission {
  readonly definition = DEMURRAGE_CONTRACT;
  readonly firstPhase = "yard";
  readonly service;
  private guardIds: number[] = [];
  private responseIds: number[] = [];
  private groups = new Set<number>();
  private profiles = new Map<number, EnemyProfile>();
  responseAt?: number;
  restoredAt?: number;
  gateResponseAt?: number;
  operators: (number | null)[] = [null,null];
  contested = [false,false];
  constructor(sim: Simulation) {
    super(sim);
    this.service=sim.city!.traffic.park("VAN",0x71988c,BERTH_SITES.van,Math.PI);
    this.service.reportDamage=false;
    for(const p of sim.city!.porters) sim.city!.workers.hold(p.route.id);
    BERTH_GUARDS.forEach((p,i)=>{
      const a=this.spawn(p,p,p.weapon,0,i,"BERTH HOLD");this.guardIds.push(a.id);
      this.profiles.set(a.id,p.weapon==="rifle"?LOOKOUT:p.weapon==="gun"?GUN:{...PISTOLS,leash:12});
    });
  }
  private spawn(position: Vec2, rally: Vec2, weapon: Firearm, squad: number, slot: number, gate: string) {
    const a=this.sim.addEnemy(weapon==="rifle"?"sniper":"assault",position);
    a.weapons=weapon==="rifle"?["rifle","pistol"]:[weapon];a.weapon=weapon;
    a.ammo=weapon==="pistol"?0:weapon==="rifle"?this.sim.magazine(a,"rifle"):MAGAZINE;
    a.pistol.ammo=PISTOL.magazine;
    a.hp=a.maxHp=weapon==="rifle"?64:weapon==="gun"?150:105;
    a.ai={squad,gate,rally:{...rally},flank:slot%2?.55:-.55,target:null,
      aim:{x:rally.x,y:(rally.y??0)+1.4,z:rally.z},state:squad?"entering":"holding",
      nextThink:this.sim.time+slot*.04,nextRoute:0,nextAttack:this.sim.time+1,entryUntil:this.sim.time+18,
      nextGrenade:Infinity,burstUntil:0,visible:false,fire:false};
    if(squad)this.sim.navigate(a,rally);
    return a;
  }
  get guards(){return this.sim.actors.filter(a=>this.guardIds.includes(a.id)&&!a.dead);}
  get response(){return this.sim.actors.filter(a=>this.responseIds.includes(a.id)&&!a.dead);}
  get enemies(){return [...this.guards,...this.response];}
  get objective(){return this.phase==="return"||this.finished?2:this.phase==="restore"?1:0;}
  get marker(){return this.phase==="return"?{...BERTH_SITES.exit,kind:"return" as const}:null;}
  private inside(a: Actor,p: {x:number;z:number;radius:number}) {
    return !a.dead&&distance2(a.body.translation(),p)<p.radius&&Math.abs(this.sim.walkingPoint(a).y)<.3;
  }
  private wave(group: typeof BERTH_GATE_RESPONSE,index: number) {
    const living=this.sim.squad.filter(a=>!a.dead);
    const entries=[{x:0,z:0},{x:0,z:16},{x:0,z:-16},{x:16,z:0},{x:-16,z:0}]
      .map(offset=>group.positions.map(p=>({x:p.x+offset.x,z:p.z+offset.z})))
      .find(points=>points.every(p=>this.sim.canSpawnAt(p)&&living.every(a=>distance2(a.body.translation(),p)>=14)));
    if(!entries)return false;
    entries.forEach((p,i)=>{
      const rally={...group.rally,x:group.rally.x+(i-1)*2.4};
      const a=this.spawn(p,rally,i===0?"gun":"pistol",index+1,i,group.name);
      this.responseIds.push(a.id);this.profiles.set(a.id,i===0?{...GUN,leash:undefined}:{...PISTOLS,leash:undefined});
    });
    return true;
  }
  updateCombat() {
    const living=this.sim.squad.filter(a=>!a.dead);
    // Water has a real submerged bed. A chassis knocked off the quay or ship
    // is disabled once fully submerged, rather than becoming an unreachable enemy.
    for(const a of this.sim.actors)if(!a.dead&&a.body.translation().y<-1.7)
      this.sim.damage(a,a.hp,{x:0,y:0,z:0},a.body.translation(),"vehicle");
    for(const a of this.enemies)updateEnemy(this.sim,a,living,this.profiles.get(a.id)!);
    if(this.responseAt!==undefined)for(const [i,group] of BERTH_RESPONSE.entries()) {
      if(this.groups.has(i)||this.sim.time<this.responseAt+group.delay||!this.wave(group,i))continue;
      this.groups.add(i);
      this.sim.events.push({type:"comms",speaker:"vale",message:i===0?"Three machines through the north container aisle. Machine gun and two pistols.":"Another three through the southern stacks. Keep the two control bays covered."});
    }
    if(this.restoredAt!==undefined&&this.gateResponseAt===undefined&&this.wave(BERTH_GATE_RESPONSE,2)) {
      this.gateResponseAt=this.sim.time;
      this.sim.events.push({type:"comms",speaker:"vale",message:"Three more at the west service lane. They're moving to cut off the gate. Bring the operators back together before you return."});
    }
  }
  updateObjectives() {
    if(this.stopped)return;
    const living=this.sim.squad.filter(a=>!a.dead);
    if(!living.length){this.failureReason="No squad chassis left";this.finish("failed");return;}
    if(living.length<2&&this.releaseProgress<1){this.failureReason="Two operators required to restore the cranes";this.finish("failed");return;}
    this.operators=BERTH_SITES.controls.map(p=>living.find(a=>this.inside(a,p))?.id??null);
    this.contested=BERTH_SITES.controls.map(p=>this.enemies.some(a=>distance2(a.body.translation(),p)<8&&Math.abs(this.sim.walkingPoint(a).y)<.5));
    if(this.phase==="yard"&&!this.guards.length)this.phase="restore";
    if(this.phase==="restore") {
      if(this.responseAt===undefined&&this.operators.some(id=>id!==null)) {
        this.responseAt=this.sim.time;
        this.sim.events.push({type:"comms",speaker:"sable",message:"The first console is ours. Keep both bays occupied; the second controller must agree before the safety circuit can come back."});
      }
      if(this.operators.every(id=>id!==null)&&!this.contested.some(Boolean))
        this.releaseProgress=Math.min(1,this.releaseProgress+STEP/BERTH_RESTART_SECONDS);
      if(this.releaseProgress>=1) {
        this.restoredAt=this.sim.time;this.phase="return";
        for(const p of this.sim.city!.porters)this.sim.city!.workers.resume(p.route.id);
        this.sim.events.push({type:"comms",speaker:"sable",message:"Both cranes released. The work lights are on the approaches and the loaders have their jobs back. Gannet's night hold is recorded against their own dispatch instruction. Return through the service gate."});
      }
    }
    if(this.phase==="return") {
      this.returnProgress=this.groups.size===BERTH_RESPONSE.length&&this.gateResponseAt!==undefined&&!this.enemies.length&&living.every(a=>this.inside(a,BERTH_SITES.exit))
        ?Math.min(1,this.returnProgress+STEP):0;
      if(this.returnProgress>=1)this.finish("complete");
    }
  }
  inspect(){return {id:this.definition.id,phase:this.phase,objective:this.objective,enemies:this.enemies.length,guards:this.guardIds.length,
    enemyShots:this.enemyShots,deployedAt:this.deployedAt,finishedAt:this.finishedAt,survivors:this.sim.squad.filter(a=>!a.dead).length,
    releaseProgress:this.releaseProgress,returnProgress:this.returnProgress,cargoReleased:this.cargoReleased,marker:this.marker,
    operators:[...this.operators],contested:[...this.contested],responseAt:this.responseAt,restoredAt:this.restoredAt,
    responseGroups:this.groups.size,gateResponseAt:this.gateResponseAt};}
}
