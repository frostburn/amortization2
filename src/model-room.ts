import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { makeHuman, type HumanPose } from "./render/humans";
import { CAST, DEFAULT_CAST, makeModelRoomCast, type CastId, type CastModel } from "./render/model-room-cast";
import { TACTICAL_CAMERA_OFFSET, tacticalHalfHeight } from "./render/tactical-camera";
import "./model-room.css";

const app = document.querySelector<HTMLDivElement>("#model-room")!;
const defaults = new Set<CastId>(DEFAULT_CAST);
app.innerHTML = `<div class="room">
  <header class="room-header"><div class="brand"><strong>AMORTIZATION II</strong><span>MODEL ROOM / 01</span></div><a class="back-link" href="./index.html">← Return to game</a></header>
  <aside class="room-sidebar" aria-label="Model comparison controls">
    <p class="eyebrow">Civilian study · human</p><h1>Maintenance<br>worker</h1><p class="design-note">A blank face, natural proportions and ordinary workwear. Original geometry, built for the distant camera.</p>
    <p class="eyebrow">Human pose</p><div class="pose-buttons" aria-label="Human pose"><button data-pose="standing" aria-pressed="true">Standing</button><button data-pose="walking" aria-pressed="false">Walking</button><button data-pose="crouching" aria-pressed="false">Crouching</button></div><button class="pose-play" id="play-pose" disabled>Pause walk</button>
    <section class="sidebar-section" aria-label="Comparison cast"><p class="eyebrow">Compare at true scale</p><div class="cast-row"><span class="cast-swatch" style="--swatch: #728f9f"></span><span class="cast-name">Human<span class="cast-role">Maintenance worker</span></span><span class="cast-height" id="human-height">1.74 m</span></div>
    ${["Squad", "Street", "Traffic"].map(group => `<p class="cast-group">${group}</p>${CAST.filter(c => c.group === group).map(c => `<label class="cast-row"><input type="checkbox" data-cast="${c.id}" aria-label="Compare ${c.name}" ${defaults.has(c.id) ? "checked" : ""} disabled><span class="cast-swatch" style="--swatch: ${c.color}"></span><span class="cast-name">${c.name}<span class="cast-role">${c.role}</span></span><span class="cast-height" data-height="${c.id}">—</span></label>`).join("")}`).join("")}</section>
    <div class="sidebar-section room-toggles"><label><input id="name-plates" type="checkbox" checked> Name plates</label><label><input id="grid" type="checkbox" checked> Metre grid</label></div>
  </aside>
  <main class="room-main"><nav class="room-toolbar" aria-label="Camera views"><button data-view="all">Frame cast</button><button data-view="human">Focus human</button><span class="toolbar-divider"></span><button data-view="front">Front</button><button data-view="back">Back</button><button data-view="iso">Isometric</button><button data-view="tactical">Tactical scale</button></nav>
    <div class="viewport" id="viewport"><div class="view-caption"><strong id="view-title">Cast comparison</strong><small id="view-detail">Shared models · original dimensions</small></div><div class="plates" id="plates"></div><div class="load-state" id="load-state" role="status">Preparing the cast…</div></div>
    <footer class="room-footer"><span>Left drag · orbit &nbsp; / &nbsp; wheel · zoom &nbsp; / &nbsp; right drag · pan</span><span>1 m grid · same scale for every model</span></footer>
  </main></div>`;

const viewport = document.querySelector<HTMLDivElement>("#viewport")!;
const loadState = document.querySelector<HTMLDivElement>("#load-state")!;
const human = makeHuman();
let cast: Awaited<ReturnType<typeof makeModelRoomCast>> | undefined;
let renderer: THREE.WebGLRenderer | undefined, controls: OrbitControls | undefined, observer: ResizeObserver | undefined;
let ready = false, disposed = false, frame = 0, poseTime = 0, lastTime = 0;
let humanPose: HumanPose = "standing", playing = true, activeView = "all", focusingHuman = false;
const scene = new THREE.Scene(), stage = new THREE.Group(), camera = new THREE.OrthographicCamera(-5, 5, 3, -3, .05, 250);
const plates = new Map<CastId, HTMLDivElement>(), selected = new Set<CastId>(DEFAULT_CAST);
const title = document.querySelector<HTMLElement>("#view-title")!, detail = document.querySelector<HTMLElement>("#view-detail")!;
const resources: { dispose(): void }[] = [];
const vector = new THREE.Vector3(), direction = new THREE.Vector3(), viewBounds = new THREE.Box3();
let width = 1, height = 1, halfHeight = 3;

function chosen() { return cast?.models.filter(m => selected.has(m.id)) ?? []; }
function visibleBounds() {
  viewBounds.makeEmpty();
  for (const model of chosen()) {
    // Include the complete animated envelope without zoom pumping while walking.
    const bounds = model.bounds.clone().translate(model.root.position); bounds.min.z -= .25; bounds.max.z += .25;
    viewBounds.union(bounds);
  }
  return viewBounds;
}
function projection() {
  const aspect = width / height;
  camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
  camera.top = halfHeight; camera.bottom = -halfHeight; camera.updateProjectionMatrix();
}
function frameBounds(bounds: THREE.Box3, viewDirection: THREE.Vector3) {
  if (!controls) return;
  const center = bounds.getCenter(new THREE.Vector3());
  controls.target.copy(center); camera.position.copy(center).addScaledVector(viewDirection.normalize(), 24); camera.lookAt(center);
  camera.zoom = 1; camera.updateMatrixWorld(true);
  const inverse = camera.matrixWorldInverse, corner = new THREE.Vector3(); let x = 0, y = 0;
  for (const ix of [bounds.min.x, bounds.max.x]) for (const iy of [bounds.min.y, bounds.max.y]) for (const iz of [bounds.min.z, bounds.max.z]) {
    corner.set(ix, iy, iz).applyMatrix4(inverse); x = Math.max(x, Math.abs(corner.x)); y = Math.max(y, Math.abs(corner.y));
  }
  halfHeight = Math.max(1.15, y * 1.38, x * 1.3 / (width / height)); projection(); controls.update();
}
function cameraView(view: string) {
  if (!ready || !controls || !cast) return;
  activeView = view;
  if (view === "human") focusingHuman = true;
  else if (view === "all" || view === "tactical") focusingHuman = false;
  const humanModel = cast.models.find(m => m.id === "human")!;
  const whole = visibleBounds().clone(), humanBounds = humanModel.bounds.clone().translate(humanModel.root.position);
  direction.copy(camera.position).sub(controls.target).normalize();
  if (view === "front") direction.set(0, .035, 1);
  else if (view === "back") direction.set(0, .035, -1);
  else if (view === "iso" || view === "tactical" || view === "all") direction.set(TACTICAL_CAMERA_OFFSET.x, TACTICAL_CAMERA_OFFSET.y, TACTICAL_CAMERA_OFFSET.z).normalize();
  if (view === "human") {
    // Start the inspection from a readable three-quarter view even after tactical zoom.
    direction.set(.45, .18, 1).normalize(); frameBounds(humanBounds, direction);
    title.textContent = "Human study"; detail.textContent = "1.74 m standing · faceless by design";
  } else {
    frameBounds(focusingHuman ? humanBounds : whole, direction);
    if (view === "tactical") {
      halfHeight = tacticalHalfHeight("handling", width / height, 1);
      camera.position.copy(controls.target).add(new THREE.Vector3(TACTICAL_CAMERA_OFFSET.x, TACTICAL_CAMERA_OFFSET.y, TACTICAL_CAMERA_OFFSET.z));
      camera.lookAt(controls.target); projection(); controls.update();
    }
    title.textContent = view === "tactical" ? "Tactical scale" : view === "iso" ? "120° isometric" : view === "front" ? "Front elevation" : view === "back" ? "Back elevation" : "Cast comparison";
    detail.textContent = view === "tactical" ? "Handling camera · default game zoom" : focusingHuman ? "Human study · 1.74 m standing" : "Shared models · original dimensions";
  }
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.view === view)));
  updatePlates();
}
function layoutCast() {
  if (!cast) return;
  let x = 0;
  const members = chosen();
  for (const model of cast.models) { model.root.visible = selected.has(model.id); model.root.position.set(0, 0, 0); }
  for (const model of members) {
    const width = model.bounds.max.x - model.bounds.min.x;
    model.root.position.x = x + width / 2; x += width + .95;
  }
  const center = (x - .95) / 2;
  for (const model of members) model.root.position.x -= center;
  stage.updateMatrixWorld(true); cameraView(activeView);
}
function updatePlates() {
  if (!cast || !controls) return;
  const enabled = document.querySelector<HTMLInputElement>("#name-plates")!.checked;
  for (const model of cast.models) {
    const plate = plates.get(model.id)!;
    vector.set(model.root.position.x, .02, model.bounds.max.z + .2).project(camera);
    const inFrame = Math.abs(vector.x) < .94 && vector.y > -.88 && vector.y < .91 && vector.z > -1 && vector.z < 1;
    plate.hidden = !enabled || activeView === "tactical" || !model.root.visible || !inFrame;
    plate.style.left = `${(vector.x + 1) * width / 2}px`; plate.style.top = `${(1 - vector.y) * height / 2 + 10}px`;
  }
}
function dispose() {
  if (disposed) return; disposed = true; ready = false;
  cancelAnimationFrame(frame); observer?.disconnect(); controls?.dispose(); cast?.dispose(); human.dispose();
  resources.forEach(r => r.dispose()); renderer?.dispose();
}

// Read-only inspection for browser QA; interaction still goes through the visible controls.
declare global { interface Window { amortization2ModelRoom: { inspect(): unknown } } }
window.amortization2ModelRoom = { inspect: () => ({ ready, pose: humanPose, playing, view: activeView, focusingHuman, selected: [...selected],
  camera: { position: camera.position.toArray(), target: controls?.target.toArray(), zoom: camera.zoom, halfHeight, aspect: width / height },
  models: cast?.models.map(m => ({ id: m.id, visible: m.root.visible, scale: m.root.scale.toArray(), position: m.root.position.toArray(),
    bounds: { min: m.bounds.min.toArray(), max: m.bounds.max.toArray() } })),
  humanBounds: human.root.parent ? (() => { const b = new THREE.Box3().setFromObject(human.root); return { min: b.min.toArray(), max: b.max.toArray() }; })() : null,
  render: renderer?.info.render,
}) };

async function start() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.03;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.tabIndex = 0; renderer.domElement.setAttribute("aria-label", "Orbitable model comparison. Drag to orbit; wheel to zoom; right drag to pan.");
  viewport.prepend(renderer.domElement);
  scene.background = new THREE.Color(0x354247); scene.fog = new THREE.Fog(0x354247, 100, 180); scene.add(stage);
  scene.add(new THREE.HemisphereLight(0xd4e8ec, 0x44423a, 2));
  const sun = new THREE.DirectionalLight(0xffe5be, 3.2); sun.position.set(-18, 38, 15); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = sun.shadow.camera.bottom = -25; sun.shadow.camera.right = sun.shadow.camera.top = 25;
  sun.shadow.camera.far = 95; sun.shadow.normalBias = .035; sun.shadow.bias = -.0002; scene.add(sun);
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(), environment = pmrem.fromScene(room);
  room.dispose(); pmrem.dispose(); resources.push(environment); scene.environment = environment.texture; scene.environmentIntensity = .28;
  const concrete = await new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}textures/concrete.webp`);
  if (disposed) { concrete.dispose(); return; }
  concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping; concrete.repeat.set(80, 80); concrete.colorSpace = THREE.SRGBColorSpace;
  const floorGeometry = new THREE.PlaneGeometry(240, 240), floorMaterial = new THREE.MeshStandardMaterial({ color: 0x78827f, map: concrete, roughness: 1 });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.position.y = -.012; scene.add(floor);
  resources.push(floorGeometry, floorMaterial, concrete);
  const grid = new THREE.GridHelper(200, 200, 0x505d59, 0x505d59); grid.position.y = .002;
  const gridMaterial = grid.material as THREE.LineBasicMaterial; gridMaterial.transparent = true; gridMaterial.opacity = .4; gridMaterial.depthWrite = false;
  scene.add(grid); resources.push(grid.geometry, gridMaterial);
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .1;
  controls.minPolarAngle = .04; controls.maxPolarAngle = Math.PI / 2 - .015; controls.minZoom = .2; controls.maxZoom = 32;
  controls.screenSpacePanning = true; controls.addEventListener("change", updatePlates);
  cast = await makeModelRoomCast(human, environment.texture);
  if (disposed) { cast.dispose(); human.dispose(); return; }
  for (const model of cast.models) {
    stage.add(model.root);
    const data = CAST.find(c => c.id === model.id)!, plate = document.createElement("div");
    plate.className = "name-plate"; plate.dataset.human = String(model.id === "human"); plate.textContent = model.id === "human" ? "HUMAN" : data.name;
    document.querySelector("#plates")!.append(plate); plates.set(model.id, plate);
    const heightLabel = document.querySelector<HTMLElement>(model.id === "human" ? "#human-height" : `[data-height="${model.id}"]`)!;
    heightLabel.textContent = `${model.bounds.max.y.toFixed(2)} m`;
  }
  ready = true;
  const resize = () => {
    width = viewport.clientWidth; height = viewport.clientHeight; renderer!.setSize(width, height);
    // Refit presets on a viewport resize; never clip a newly added vehicle.
    cameraView(activeView);
  };
  observer = new ResizeObserver(resize); observer.observe(viewport); resize(); layoutCast();
  document.querySelectorAll<HTMLInputElement>("[data-cast]").forEach(input => {
    input.disabled = false; input.addEventListener("change", () => { const id = input.dataset.cast as CastId;
      if (input.checked) selected.add(id); else selected.delete(id); activeView = "all"; layoutCast();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(button => button.addEventListener("click", () => cameraView(button.dataset.view!)));
  const playButton = document.querySelector<HTMLButtonElement>("#play-pose")!;
  document.querySelectorAll<HTMLButtonElement>("[data-pose]").forEach(button => button.addEventListener("click", () => {
    humanPose = button.dataset.pose as HumanPose; poseTime = 0; playing = true; human.pose(humanPose, poseTime);
    document.querySelectorAll<HTMLButtonElement>("[data-pose]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
    playButton.disabled = humanPose !== "walking"; playButton.textContent = "Pause walk";
  }));
  playButton.addEventListener("click", () => { playing = !playing; playButton.textContent = playing ? "Pause walk" : "Resume walk"; });
  document.querySelector<HTMLInputElement>("#name-plates")!.addEventListener("change", updatePlates);
  document.querySelector<HTMLInputElement>("#grid")!.addEventListener("change", event => { grid.visible = (event.target as HTMLInputElement).checked; });
  loadState.hidden = true;
  const render = (time: number) => {
    if (disposed) return;
    const delta = lastTime ? Math.min(.05, (time - lastTime) / 1000) : 0; lastTime = time;
    if (!document.hidden && humanPose === "walking" && playing) { poseTime += delta; human.pose(humanPose, poseTime); }
    controls!.update(); renderer!.render(scene, camera); frame = requestAnimationFrame(render);
  };
  frame = requestAnimationFrame(render);
}
window.addEventListener("pagehide", event => { if (!event.persisted) dispose(); });
void start().catch(error => { console.error("Model room failed to load", error); dispose(); loadState.textContent = "The model room could not load. Reload this page to try again."; loadState.hidden = false; });
