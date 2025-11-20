/* ============================================================
   SETTINGS
============================================================ */
const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

const SETTINGS = {
  groundTopColor:  "#33FF4B",
  groundSideColor: "#8B5A2B",
  waterColor:      "#4DA6FF",
  waterUnderColor: "#0B3B8C",
  skyColor:        "#9DE9FF",

  cubeCount: 30,
  hillCount: 10,
  treeCount: 40,

  cubeSize: 2,
  safeRadius: 8,

  coinMax: 32,
  coinRespawnSec: 45,

  ringRadius: 5.0,
  ringThickness: 0.6,
  ringHeightOffset: 6.0,

  dayColor: "#9DE9FF",
  nightColor: "#1B2432",
  dayNightCycleMs: 5 * 60 * 1000,

  coatTexture: "box-texture.png",
  coatSize: 1.0
};

const WATER_DEPTH = 20;
const WATER_SURFACE_Y = 0;

function rndRange(min,max){ return Math.random()*(max-min)+min; }
function color3(hex){ return BABYLON.Color3.FromHexString(hex); }

/* ============================================================
   TRIANGULAR RAMP
============================================================ */
function makeTriWedge(scene, name="ramp", width=10, height=6, depth=8) {
  const tri = [
    new BABYLON.Vector3(0, 0, 0),
    new BABYLON.Vector3(width, 0, 0),
    new BABYLON.Vector3(0, height, 0)
  ];
  const path = [ new BABYLON.Vector3(0,0,0), new BABYLON.Vector3(0,0,depth) ];

  const ramp = BABYLON.MeshBuilder.ExtrudeShape(name, { shape: tri, path: path, cap: BABYLON.Mesh.CAP_ALL }, scene);
  ramp.position.y = height / 2;

  const mat = new BABYLON.StandardMaterial(name + "Mat", scene);
  mat.diffuseColor = new BABYLON.Color3(0.65,0.65,0.65);
  ramp.material = mat;

  ramp.physicsImpostor = new BABYLON.PhysicsImpostor(
    ramp,
    BABYLON.PhysicsImpostor.MeshImpostor,
    { mass: 0, friction: 1.0, restitution: 0 },
    scene
  );

  ramp.receiveShadows = true;
  ramp.isPickable = false;

  return ramp;
}

/* ============================================================
   PYRAMID PLACER
============================================================ */
function placeCubePyramid(scene, originX, originZ, baseCount = 5, cubeSize = 2, spacing = 2.2) {
  const meshes = [];
  let layer = 0;
  for (let n = baseCount; n >= 1; n--) {
    const layerY = (cubeSize/2) + layer * (cubeSize + 0.02);
    const rowWidth = n * spacing;
    const rowStartX = originX - (rowWidth/2) + spacing/2;
    const rowStartZ = originZ - (rowWidth/2) + spacing/2;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const x = rowStartX + c * spacing;
        const z = rowStartZ + r * spacing;
        const box = BABYLON.MeshBuilder.CreateBox("pyr_cube_" + layer + "_" + r + "_" + c, { size: cubeSize }, scene);

        box.position.set(x, layerY, z);
        const m = new BABYLON.StandardMaterial("pyrMat_" + layer + "_" + r + "_" + c, scene);
        if (SETTINGS.coatTexture) {
          const tex = new BABYLON.Texture(SETTINGS.coatTexture, scene);
          tex.uScale = SETTINGS.coatSize;
          tex.vScale = SETTINGS.coatSize;
          tex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
          tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
          m.diffuseTexture = tex;
        } else m.diffuseColor = new BABYLON.Color3(0.8,0.7,0.6);
        box.material = m;

        box.physicsImpostor = new BABYLON.PhysicsImpostor(box, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0, friction: 1 }, scene);
        meshes.push(box);
      }
    }
    layer++;
  }
  return meshes;
}

/* ============================================================
   CREATE SCENE
============================================================ */
function createScene() {
  const scene = new BABYLON.Scene(engine);
  scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0), new BABYLON.CannonJSPlugin());

  // Lights
  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
  hemi.intensity = 0.85;
  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.2,-1,0.2), scene);
  sun.position = new BABYLON.Vector3(0,50,0);

  // Ground
  const groundSize = 300;
  const groundHeight = 10;
  const groundBox = BABYLON.MeshBuilder.CreateBox("groundBox", { width: groundSize, height: groundHeight, depth: groundSize }, scene);
  groundBox.position.y = -groundHeight/2;

  const topMat = new BABYLON.StandardMaterial("groundTopMat", scene);
  topMat.diffuseColor = color3(SETTINGS.groundTopColor);
  const sideMat = new BABYLON.StandardMaterial("groundSideMat", scene);
  sideMat.diffuseColor = color3(SETTINGS.groundSideColor);
  const groundMulti = new BABYLON.MultiMaterial("groundMulti", scene);
  groundMulti.subMaterials = [sideMat, sideMat, sideMat, sideMat, topMat, sideMat];
  groundBox.material = groundMulti;
  groundBox.physicsImpostor = new BABYLON.PhysicsImpostor(groundBox, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0, friction: 1 }, scene);

  // Water surface & volume
  const waterMesh = BABYLON.MeshBuilder.CreateGround("waterSurface", { width:700, height:700, subdivisions:32 }, scene);
  waterMesh.position.y = WATER_SURFACE_Y;
  const waterMat = new BABYLON.WaterMaterial("waterMat", scene, {});
  waterMat.bumpTexture = new BABYLON.Texture("https://cdn.babylonjs.com/textures/waterbump.png", scene);
  waterMat.windForce = -5;
  waterMat.waveHeight = 0.5;
  waterMat.waveLength = 0.1;
  waterMat.waterColor = color3(SETTINGS.waterColor);
  waterMat.colorBlendFactor = 0.3;
  waterMat.addToRenderList(groundBox);
  waterMesh.material = waterMat;

  const waterVol = BABYLON.MeshBuilder.CreateBox("waterVolume", { width:700, height:WATER_DEPTH, depth:700 }, scene);
  waterVol.position.y = WATER_SURFACE_Y - WATER_DEPTH/2;
  const waterVolMat = new BABYLON.StandardMaterial("waterVolMat", scene);
  waterVolMat.diffuseColor = color3(SETTINGS.waterColor);
  waterVolMat.alpha = 0.35;
  waterVolMat.backFaceCulling = false;
  waterVol.material = waterVolMat;
  waterVol.isPickable = false;

  // Ramps, rings, trees, cubes, pyramid, hills, coins...
  // Keep all your previous logic here except any multiplayer code (connections, otherPlayersLabel, etc.)

  // Camera
  const camera = new BABYLON.ArcRotateCamera("cam", Math.PI/2, Math.PI/3, 60, new BABYLON.Vector3(0,0,0), scene);
  camera.attachControl(canvas,true);

  // Day/Night & water update
  scene.registerBeforeRender(()=>{
    const t = (Date.now() % SETTINGS.dayNightCycleMs) / SETTINGS.dayNightCycleMs;
    const mix = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
    const dayNightColor = BABYLON.Color3.Lerp(color3(SETTINGS.nightColor), color3(SETTINGS.dayColor), mix);
    const camY = camera.position.y;
    const underwater = camY < WATER_SURFACE_Y;
    if (underwater) {
      scene.clearColor = color3(SETTINGS.waterUnderColor);
      scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
      scene.fogDensity = 0.02;
      scene.fogColor = color3(SETTINGS.waterUnderColor);
      waterMat.waterColor = color3(SETTINGS.waterUnderColor);
      waterVolMat.diffuseColor = color3(SETTINGS.waterUnderColor);
      waterVolMat.alpha = 0.45;
    } else {
      scene.clearColor = dayNightColor;
      scene.fogMode = BABYLON.Scene.FOGMODE_NONE;
      waterMat.waterColor = color3(SETTINGS.waterColor);
      waterVolMat.diffuseColor = color3(SETTINGS.waterColor);
      waterVolMat.alpha = 0.35;
    }
    const now = performance.now() * 0.001;
    waterMat.bumpTexture.uOffset = Math.sin(now * 0.3) * 0.02;
    waterMat.bumpTexture.vOffset = Math.cos(now * 0.27) * 0.02;
  });

  return scene;
}

/* RUN */
const scene = createScene();
engine.runRenderLoop(()=> scene.render());
window.addEventListener("resize", ()=> engine.resize());
