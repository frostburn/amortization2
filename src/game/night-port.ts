import { MARINE_PORT, portSolids } from "./port";
import type { CityDistrict } from "./city";
import type { NightLight } from "./night-visibility";

export const BERTH_SITES = {
  spawn: { x: -66, z: 0 }, exit: { x: -66, z: 0, radius: 6 },
  controls: [{ x: 34, z: -18, radius: 3.6 }, { x: 34, z: 18, radius: 3.6 }],
  van: { x: -72, z: -15 },
};
export const BERTH_RESTART_SECONDS = 12;
/** Keep the daytime sandbox intact; the contract pauses the same working port. */
export const NIGHT_PORT: CityDistrict = { ...MARINE_PORT, ambientTraffic: false,
  porterRoutes: MARINE_PORT.porterRoutes!.map((r,i)=>({...r,points:r.points.map((p,j)=>
    ({...p,x:j?24:-4,z:[-38,38,-42,42][i]}))})),
  port: { ...MARINE_PORT.port!, separateHoists: true } };
export const NIGHT_PORT_FIXTURES = [...portSolids(NIGHT_PORT), ...BERTH_SITES.controls.map(p=>
  ({x:p.x+2.8,z:p.z,w:.9,d:.7,h:1.4,style:"crate" as const}))];
export const BERTH_GUARDS = [
  { x: -10, z: -10, weapon: "pistol" }, { x: -6, z: 10, weapon: "pistol" },
  { x: 10, z: -13, weapon: "gun" }, { x: 14, z: 13, weapon: "gun" },
  { x: 30, z: -21, weapon: "pistol" }, { x: 30, z: 21, weapon: "pistol" },
  // Clear strip inside the ship's rail, outside its stacked cargo and hatch.
  { x: 55.8, z: 25, y: 1.9, weapon: "rifle" },
] as const;
export const BERTH_RESPONSE = [
  { name: "NORTH CONTAINER AISLE", delay: 0, positions: [{x:28,z:-63},{x:32,z:-65},{x:36,z:-63}], rally: {x:32,z:-23} },
  { name: "SOUTH CONTAINER AISLE", delay: 7, positions: [{x:26,z:63},{x:30,z:65},{x:34,z:63}], rally: {x:32,z:23} },
];
export const BERTH_GATE_RESPONSE = { name: "SERVICE GATE", delay: 0,
  positions: [{x:-60,z:-14},{x:-64,z:-17},{x:-68,z:-14}], rally: {x:-44,z:0} };

/** Lighting and optical acquisition share these cones, including the restored direction. */
export function berthLights(restored = false): NightLight[] {
  return [
    ...BERTH_SITES.controls.map((p, i) => ({ id: `quay-${i}`, position: {x:39,y:8,z:i ? 26 : -26},
      target: restored ? {x:24,y:0,z:i ? 46 : -46} : {x:p.x,y:0,z:p.z},
      range: 46, angle: .72, color: 0xffd599, intensity: 650, shadow: i === 0 })),
    {id:"ship-deck",position:{x:59,y:7,z:32},target:{x:55.8,y:2.8,z:25},range:23,angle:.8,color:0xf2d4a1,intensity:420,shadow:false},
    {id:"service-gate",position:{x:-58,y:7,z:12},target:{x:-66,y:0,z:0},range:28,angle:.8,color:0xbdd4e6,intensity:350,shadow:false},
  ];
}
