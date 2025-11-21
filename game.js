/* ============================================================
   SETTINGS
============================================================ */
const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

const SETTINGS = {
  groundTopColor: "#33FF4B",
  groundSideColor: "#8B5A2B",
  waterColor: "#4DA6FF",
  waterUnderColor: "#0B3B8C",
  skyColor: "#9DE9FF",

  cubeCount: 30,
  hillCount: 10,
  treeCount: 40,
  cubeSize: 2,
  safeRadius: 8,

  coinMax: 32,
  coinRespawnSec: 45,

  ringRadius: 5,
  ringThickness: 0.6,
  ringHeightOffset: 6,

  dayColor: "#9DE9FF",
  nightColor: "#1B2432",
  dayNightCycleMs: 5 * 60 * 1000,

  coatTexture: "box-texture.png",
  coatSize: 1.0
};

const WATER_DEPTH = 20;
const WATER_SURFACE_Y = -3;

function rnd(min, max) { return Math.random() * (max - min) + min; }
function color3(hex) { return BABYLON.Color3.FromHexString(hex); }

/* ============================================================
   MATERIAL HELPERS
============================================================ */
function createBoxMaterial(scene, colorHex, texturePath = null, size = 1) {
  const mat = new BABYLON.StandardMaterial("mat", scene);
  if (texturePath) {
    const tex = new BABYLON.Texture(texturePath, scene);
    tex.uScale = tex.vScale = size;
    tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    mat.diffuseTexture = tex;
  } else {
    mat.diffuseColor = color3(colorHex);
  }
  return mat;
}

/* ============================================================
   RAMP CREATOR
============================================================ */
function makeTriWedge(scene, name, width = 10, height = 6, depth = 8, pos = {x:0, y:0, z:0}, rotY = 0) {
  const shape = [new BABYLON.Vector3(0,0,0), new BABYLON.Vector3(width,0,0), new BABYLON.Vector3(0,height,0)];
  const path = [new BABYLON.Vector3(0,0,0), new BABYLON.Vector3(0,0,depth)];
  const ramp = BABYLON.MeshBuilder.ExtrudeShape(name, { shape, path, cap: BABYLON.Mesh.CAP_ALL }, scene);

  ramp.position.set(pos.x, pos.y + height/2, pos.z);
  ramp.rotation.y = rotY;

  // MultiMaterial for full lighting on all sides
  const topMat = createBoxMaterial(scene, "#A6A6A6");
  const sideMat = createBoxMaterial(scene, "#A6A6A6");
  const mm = new BABYLON.MultiMaterial(name + "_MM", scene);
  mm.subMaterials = [sideMat, sideMat, sideMat, sideMat, topMat, sideMat];
  ramp.material = mm;

  ramp.physicsImpostor = new BABYLON.PhysicsImpostor(ramp, BABYLON.PhysicsImpostor.MeshImpostor, { mass:0, friction:1, restitution:0 }, scene);
  ramp.receiveShadows = true;
  ramp.isPickable = false;
  return ramp;
}

/* ============================================================
   SCATTER OBJECTS (TREES, CUBES)
============================================================ */
function scatterObjects(scene, count, checkCollision, createMeshFunc) {
  const objs = [];
  let attempts = 0;
  while (objs.length < count && attempts < count * 50) {
    attempts++;
    const x = rnd(-150, 150);
    const z = rnd(-150, 150);

    if (!checkCollision(x, z, objs)) continue;
    const mesh = createMeshFunc(x, z, objs.length);
    objs.push(mesh);
  }
  return objs;
}

/* ============================================================
   CREATE SCENE
============================================================ */
function createScene() {
  const scene = new BABYLON.Scene(engine);
  scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0), new BABYLON.CannonJSPlugin());

  // Lights
  new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene).intensity = 0.85;
  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.2,-1,0.2), scene);
  sun.position = new BABYLON.Vector3(0,50,0);

  /* ---------------- GROUND ---------------- */
  const ground = BABYLON.MeshBuilder.CreateBox("ground", { width:300, height:10, depth:300 }, scene);
  ground.position.y = -5;
  const topMat = createBoxMaterial(scene, SETTINGS.groundTopColor);
  const sideMat = createBoxMaterial(scene, SETTINGS.groundSideColor);
  const mm = new BABYLON.MultiMaterial("groundMM", scene);
  mm.subMaterials = [sideMat, sideMat, sideMat, sideMat, topMat, sideMat];
  ground.material = mm;
  ground.physicsImpostor = new BABYLON.PhysicsImpostor(ground, BABYLON.PhysicsImpostor.BoxImpostor, {mass:0, friction:1}, scene);

  /* ---------------- WATER ---------------- */
  const water = BABYLON.MeshBuilder.CreateGround("water", { width:700, height:700, subdivisions:32 }, scene);
  water.position.y = WATER_SURFACE_Y;
  const waterMat = new BABYLON.WaterMaterial("waterMat", scene);
  waterMat.bumpTexture = new BABYLON.Texture("https://cdn.babylonjs.com/textures/waterbump.png", scene);
  waterMat.windForce = -2; waterMat.waveHeight = 0.3; waterMat.waveLength = 0.1;
  waterMat.waterColor = color3(SETTINGS.waterColor);
  waterMat.colorBlendFactor = 0.3;
  water.material = waterMat;

  const waterVol = BABYLON.MeshBuilder.CreateBox("waterVol", {width:700, height:WATER_DEPTH, depth:700}, scene);
  waterVol.position.y = WATER_SURFACE_Y - WATER_DEPTH/2;
  const waterVolMat = createBoxMaterial(scene, SETTINGS.waterColor);
  waterVolMat.alpha = 0.35;
  waterVol.material = waterVolMat;
  waterVol.isPickable = false;

  /* ---------------- RAMPS ---------------- */
  const rampsDef = [
    {x:20,z:20,width:12,height:6,depth:8,rotY:0},
    {x:-30,z:-10,width:10,height:8,depth:8,rotY:Math.PI/2},
    {x:40,z:-40,width:14,height:7,depth:10,rotY:Math.PI/3}
  ];
  const ramps = rampsDef.map(r=>makeTriWedge(scene, `ramp_${r.x}_${r.z}`, r.width,r.height,r.depth,{x:r.x,y:0,z:r.z}, r.rotY));

  /* ---------------- RINGS ---------------- */
  ramps.forEach((ramp,i)=>{
    const pos = ramp.position.clone();
    pos.y += rampsDef[i].height + SETTINGS.ringHeightOffset;
    const tor = BABYLON.MeshBuilder.CreateTorus(`ring${i}`, { diameter:SETTINGS.ringRadius*2, thickness:SETTINGS.ringThickness }, scene);
    tor.position.copyFrom(pos); tor.rotation.x = Math.PI/2; tor.rotation.y = ramp.rotation.y;
    tor.material = createBoxMaterial(scene, "#E5B300");
  });

  /* ---------------- TREES ---------------- */
  const trees = scatterObjects(scene, SETTINGS.treeCount, (x,z,objs)=>{
    return !objs.some(o=>Math.hypot(o.position.x - x, o.position.z - z)<4) &&
           !ramps.some(r=>Math.hypot(r.position.x-x,r.position.z-z)<10);
  }, (x,z,id)=>{
    const trunkH = rnd(2.2,3.6), leafH=rnd(3,5), leafSize=rnd(2,4);
    const trunk = BABYLON.MeshBuilder.CreateCylinder(`trunk${id}`, {height:trunkH,diameterTop:0.5,diameterBottom:0.8}, scene);
    trunk.position.set(x,trunkH/2,z);
    trunk.material = createBoxMaterial(scene, "#59320C");

    const leaf = BABYLON.MeshBuilder.CreateCylinder(`leaf${id}`, {height:leafH,diameterBottom:leafSize,diameterTop:0}, scene);
    leaf.position.set(x,trunkH+leafH/2-0.3,z);
    leaf.material = createBoxMaterial(scene, SETTINGS.groundTopColor);
    return trunk;
  });

  /* ---------------- CUBES ---------------- */
  const coatTex = SETTINGS.coatTexture ? new BABYLON.Texture(SETTINGS.coatTexture, scene) : null;
  const cubes = scatterObjects(scene, SETTINGS.cubeCount, (x,z,objs)=>{
    return !objs.some(o=>Math.hypot(o.position.x-x,o.position.z-z)<3) &&
           !ramps.some(r=>Math.hypot(r.position.x-x,r.position.z-z)<8);
  }, (x,z,id)=>{
    const cube = BABYLON.MeshBuilder.CreateBox(`cube${id}`, {size:SETTINGS.cubeSize}, scene);
    cube.position.set(x, SETTINGS.cubeSize/2+0.1, z);

    // MultiMaterial: top green, sides same as coat or random
    const topMat = createBoxMaterial(scene, SETTINGS.groundTopColor);
    const sideMat = coatTex ? new BABYLON.StandardMaterial(`sideMat${id}`, scene) : createBoxMaterial(scene, BABYLON.Color3.Random());
    if (coatTex) sideMat.diffuseTexture = coatTex.clone();
    const mm = new BABYLON.MultiMaterial(`cubeMM${id}`, scene);
    mm.subMaterials = [sideMat, sideMat, sideMat, sideMat, topMat, sideMat];
    cube.material = mm;

    cube.physicsImpostor = new BABYLON.PhysicsImpostor(cube, BABYLON.PhysicsImpostor.BoxImpostor, {mass:1, friction:1}, scene);
    return cube;
  });

  /* ---------------- CAMERA ---------------- */
  const camera = new BABYLON.ArcRotateCamera("cam", Math.PI/2, Math.PI/3, 60, BABYLON.Vector3.Zero(), scene);
  camera.attachControl(canvas,true);

  /* ---------------- WATER REFLECTION ---------------- */
  // Add all objects to water render list
  waterMat.addToRenderList(ground);
  ramps.forEach(r => waterMat.addToRenderList(r));
  cubes.forEach(c => waterMat.addToRenderList(c));
  trees.forEach(t => waterMat.addToRenderList(t));

  /* ---------------- DAY/NIGHT & WATER ANIMATION ---------------- */
  scene.registerBeforeRender(()=>{
    const t = (Date.now()%SETTINGS.dayNightCycleMs)/SETTINGS.dayNightCycleMs;
    const mix = Math.sin(t*Math.PI*2)*0.5+0.5;
    const dayNightColor = BABYLON.Color3.Lerp(color3(SETTINGS.nightColor), color3(SETTINGS.dayColor), mix);
    const underwater = camera.position.y < WATER_SURFACE_Y;

    scene.clearColor = underwater ? color3(SETTINGS.waterUnderColor) : dayNightColor;
    scene.fogMode = underwater ? BABYLON.Scene.FOGMODE_EXP2 : BABYLON.Scene.FOGMODE_NONE;
    waterMat.waterColor = underwater ? color3(SETTINGS.waterUnderColor) : color3(SETTINGS.waterColor);
    waterVolMat.diffuseColor = waterMat.waterColor;
    waterVolMat.alpha = underwater ? 0.45 : 0.35;

    const now = performance.now()*0.001;
    waterMat.bumpTexture.uOffset = Math.sin(now*0.3)*0.02;
    waterMat.bumpTexture.vOffset = Math.cos(now*0.27)*0.02;
  });

  return scene;
}

/* ================= RUN ================= */
const scene = createScene();
engine.runRenderLoop(()=>scene.render());
window.addEventListener("resize",()=>engine.resize());
