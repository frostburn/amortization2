import { describe, expect, test } from "vitest";
import * as THREE from "three";
import { EnemyOutlines } from "../src/render/enemy-outlines";

/** Exercise query scheduling/lifetime without requiring a GPU in unit CI.
 * Actual coverage and contour pixels are checked separately in Chromium. */
function fixture(count = 1) {
  type Query = { ready: boolean; hidden: boolean; deleted: boolean; self: boolean };
  const queries: Query[] = [];
  let current: Query | undefined, resultReads = 0, contours = 0;
  let target: THREE.WebGLRenderTarget | null = null;
  const gl = {
    ANY_SAMPLES_PASSED: 1, QUERY_RESULT_AVAILABLE: 2, QUERY_RESULT: 3,
    isContextLost: () => false,
    SAMPLES: 4, getParameter: () => 0,
    createQuery: () => { const q = { ready: false, hidden: false, deleted: false, self: !!target }; queries.push(q); return q; },
    deleteQuery: (q: Query) => { q.deleted = true; },
    beginQuery: (_: number, q: Query) => { expect(current).toBeUndefined(); current = q; },
    endQuery: () => { expect(current).toBeDefined(); current = undefined; },
    getQueryParameter: (q: Query, parameter: number) => {
      expect(q.deleted).toBe(false);
      if (parameter === 2) return q.ready;
      expect(q.ready).toBe(true); resultReads++; return q.hidden;
    },
    flush() {},
  };
  const renderer = {
    autoClear: true, getContext: () => gl, getPixelRatio: () => 1,
    getRenderTarget: () => target, setRenderTarget: (value: THREE.WebGLRenderTarget | null) => { target = value; },
    getDrawingBufferSize: (size: THREE.Vector2) => size.set(1000, 800), clearStencil() {},
    render: (scene: THREE.Scene, camera: THREE.Camera) => {
      scene.updateMatrixWorld(true);
      scene.traverse(object => {
        if (!object.visible) return;
        if (object instanceof THREE.Points) {
          object.onBeforeRender(renderer as never, scene, camera, object.geometry, object.material, null as never);
          object.onAfterRender(renderer as never, scene, camera, object.geometry, object.material, null as never);
        }
        if (object instanceof THREE.Mesh && object.material instanceof THREE.ShaderMaterial) contours++;
      });
    },
  } as unknown as THREE.WebGLRenderer;
  const camera = new THREE.OrthographicCamera(-5, 5, 4, -4, .1, 30);
  camera.position.set(0, 1, 8); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const outlines = new EnemyOutlines(), roots: THREE.Group[] = [];
  for (let i = 0; i < count; i++) {
    const root = new THREE.Group(); root.position.x = i * .5 - count * .25;
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial()));
    root.updateMatrixWorld(true); roots.push(root); outlines.add(root);
  }
  const draw = (enabled = new Set<THREE.Object3D>(roots), view: THREE.Camera = camera) => {
    contours = 0; outlines.render(renderer, view, enabled); expect(renderer.autoClear).toBe(true); expect(target).toBeNull(); return contours;
  };
  const resolve = (hidden: boolean) => {
    for (const q of queries) if (!q.deleted) { q.ready = true; q.hidden = !q.self && hidden; }
  };
  return { outlines, roots, camera, queries, draw, resolve, reads: () => resultReads };
}

describe("asynchronous enemy coverage", () => {
  test("waits for availability and suppresses isolated contacts, then recovers after cover", () => {
    const f = fixture(); expect(f.draw()).toBe(0);
    expect(f.queries.length).toBeGreaterThanOrEqual(6);
    expect(f.draw()).toBe(0); expect(f.reads()).toBe(0);
    f.resolve(false); f.queries[0].hidden = true;
    expect(f.draw()).toBe(0); // One occluded point cannot make feet glow.
    f.resolve(true); expect(f.draw()).toBeGreaterThan(0);
    f.resolve(false); expect(f.draw()).toBe(0);
  });
  test("bounds work per frame and services the whole squad in round-robin order", () => {
    const f = fixture(6);
    f.draw(); expect(f.queries.length).toBeLessThanOrEqual(2 * 64 * 2);
    const first = f.queries.length;
    f.draw(); expect(f.queries.length - first).toBeLessThanOrEqual(2 * 64 * 2);
    f.draw(); f.resolve(true);
    expect(f.draw()).toBe(6);
  });
  test("self-occluded antialiasing samples do not count as world coverage", () => {
    const f = fixture(); f.draw(); f.resolve(false);
    const world = f.queries.filter(q => !q.self), self = f.queries.filter(q => q.self);
    for (let i = 0; i < world.length / 2; i++) { world[i].hidden = true; self[i].hidden = true; }
    expect(f.draw()).toBe(0);
    f.resolve(true); expect(f.draw()).toBeGreaterThan(0);
  });
  test("a small change near the threshold does not flicker the contour", () => {
    const f = fixture(); f.draw();
    const cover = (fraction: number) => {
      f.resolve(false);
      const world = f.queries.filter(q => !q.deleted && !q.self);
      world.forEach((q, i) => { q.hidden = i < Math.floor(world.length * fraction); });
      return f.draw();
    };
    expect(cover(.4)).toBeGreaterThan(0);
    expect(cover(.28)).toBeGreaterThan(0);
    expect(cover(.1)).toBe(0);
  });
  test("camera changes and disabled/removed robots discard pending queries and old contours", () => {
    const f = fixture(); f.draw(); f.resolve(true); expect(f.draw()).toBeGreaterThan(0);
    const old = f.queries.filter(q => !q.deleted), scope = new THREE.PerspectiveCamera(35, 1, .1, 30);
    scope.position.copy(f.camera.position); scope.lookAt(0, 0, 0); scope.updateMatrixWorld();
    expect(f.draw(new Set(f.roots), scope)).toBe(0);
    expect(old.every(q => q.deleted)).toBe(true);
    f.resolve(true); expect(f.draw(new Set(f.roots), scope)).toBeGreaterThan(0);
    expect(f.draw(new Set(), scope)).toBe(0);
    expect(f.queries.every(q => q.deleted)).toBe(true);
    f.draw(); f.outlines.remove(f.roots[0]);
    expect(f.queries.every(q => q.deleted)).toBe(true); expect(f.draw()).toBe(0);
  });
});
