import { expect, test } from "vitest";
import { HeightField } from "../src/game/height-field";
import { WalkTerrain, SurfaceNavigation } from "../src/game/walk-surfaces";
const bounds={left:-12,right:12,back:-12,front:12};
test("continuous walkable hills permit straight routes uphill and downhill",()=>{
  const ground=new HeightField(bounds,2,(x)=>8+x*.5);
  const terrain=new WalkTerrain([],[],[],bounds,ground),nav=new SurfaceNavigation(terrain);
  for(const [a,b] of [[-8,8],[8,-8]]) {
    const start=terrain.resolve({x:a,z:0}),end=terrain.resolve({x:b,z:0});
    expect(terrain.canStand(start)).toBe(true);
    expect(nav.findPath(start,end)).toEqual([end]);
  }
});
test("wider natural slope tolerance cannot turn a deck edge or steep cliff into a ramp",()=>{
  const ground=new HeightField(bounds,2,x=>12+x);
  const cliff=new WalkTerrain([],[],[],bounds,ground);
  expect(cliff.segmentClear(cliff.resolve({x:-8,z:0}),cliff.resolve({x:8,z:0}))).toBe(false);
  const deck={id:"deck",x:4,z:0,w:8,d:8,height:2,thickness:.2};
  const terrain=new WalkTerrain([deck],[],[],bounds,new HeightField(bounds,2,()=>0));
  expect(terrain.segmentClear({x:-3,y:0,z:0},{x:3,y:2,z:0})).toBe(false);
});
