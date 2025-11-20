/* ============================================================
   SETTINGS
============================================================ */
const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

const SETTINGS = {
  groundTopColor:  "#33FF4B",
  groundSideColor: "#8B5A2B",
  waterColor:      "#4DA6FF",
  waterUnderColor: "#0B3B8C", // dark bluish when underwater
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

  // day/night
  dayColor: "#9DE9FF",
  nightColor: "#1B2432",
  dayNightCycleMs: 5 * 60 * 1000,

  coatTexture: "box-texture.png",
  coatSize: 1.0   // 1x1, no repeat
};

// water depth choice C -> 20 units
const WATER_DEPTH = 20;
const WATER_SURFACE_Y = -3; // keep water surface at y=0 (top)

function rndRange(min,max){ return Math.random()*(max-min)+min; }
function color3(hex){ return BABYLON.Color3.FromHexString(hex); }

/* ============================================================
   TRIANGULAR RAMP (true 3D wedge using ExtrudeShape)
============================================================ */
function makeTriWedge(scene, name="ramp", width=10, height=6, depth=8) {
  const tri = [
    new BABYLON.Vector3(0, 0, 0),
    new BABYLON.Vector3(width, 0, 0),
    new BABYLON.Vector3(0, height, 0)
  ];
  const path = [ new BABYLON.Vector3(0,0,0), new BABYLON.Vector3(0,0,depth) ];

  const ramp = BABYLON.MeshBuilder.ExtrudeShape(name, {
    shape: tri,
    path: path,
    cap: BABYLON.Mesh.CAP_ALL
  }, scene);

  // position so top of ramp lines up with world Y if we want top at height
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
   PYRAMID PLACER (same as before)
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
        } else {
          m.diffuseColor = new BABYLON.Color3(0.8,0.7,0.6);
        }
        box.material = m;

        box.physicsImpostor = new BABYLON.PhysicsImpostor(
          box,
          BABYLON.PhysicsImpostor.BoxImpostor,
          { mass: 0, friction: 1 },
          scene
        );

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
function createScene(){
  const scene = new BABYLON.Scene(engine);

  /* lights */
  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
  hemi.intensity = 0.85;

  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.2,-1,0.2), scene);
  sun.position = new BABYLON.Vector3(0,50,0);

  scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0), new BABYLON.CannonJSPlugin());

  /* ---------------- GROUND AS A CUBE (visible) ---------------- */
  const groundSize = 300;
  const groundHeight = 10; // top at y=0 (so box centered at y=-5)

  const groundBox = BABYLON.MeshBuilder.CreateBox("groundBox", {
    width: groundSize,
    height: groundHeight,
    depth: groundSize
  }, scene);

  // position so top of ground is at y=0
  groundBox.position.y = -groundHeight/2 + 0.0; // center at -5 -> top at 0

  // materials: MultiMaterial order [front, back, right, left, top, bottom]
  const topMat = new BABYLON.StandardMaterial("groundTopMat", scene);
  topMat.diffuseColor = color3(SETTINGS.groundTopColor);

  const sideMat = new BABYLON.StandardMaterial("groundSideMat", scene);
  sideMat.diffuseColor = color3(SETTINGS.groundSideColor);

  const groundMulti = new BABYLON.MultiMaterial("groundMulti", scene);
  groundMulti.subMaterials = [sideMat, sideMat, sideMat, sideMat, topMat, sideMat];
  groundBox.material = groundMulti;

  // create subMeshes for box to assign faces (default box generates 6 faces in a single mesh)
  // Babylon's CreateBox automatically generates subMeshes indices, but ensure assignment:
  // (This is safe: subMeshes will correspond to order used above)

  // physics for ground (static)
  groundBox.physicsImpostor = new BABYLON.PhysicsImpostor(
    groundBox,
    BABYLON.PhysicsImpostor.BoxImpostor,
    { mass: 0, friction: 1 },
    scene
  );

  /* ---------------- WATER SURFACE & VOLUME ---------------- */
  // Water surface (for reflections/normal map)
  const waterMesh = BABYLON.MeshBuilder.CreateGround("waterSurface", { width: 700, height: 700, subdivisions: 32 }, scene);
  waterMesh.position.y = WATER_SURFACE_Y;
  const waterMat = new BABYLON.WaterMaterial("waterMat", scene, {});


  // configure waterMaterial for nice surface
  waterMat.bumpTexture = new BABYLON.Texture("https://cdn.babylonjs.com/textures/waterbump.png", scene);
  waterMat.windForce = -5;
  waterMat.waveHeight = 0.5;
  waterMat.waveLength = 0.1;
  waterMat.waterColor = color3(SETTINGS.waterColor);
  waterMat.colorBlendFactor = 0.3;
  waterMat.addToRenderList(groundBox);
  // optionally add more to renderList (pyramids, etc.) if you want reflection
  if (scene.getMeshByName("pyr_cube_0_0_0")) waterMat.addToRenderList(scene.getMeshByName("pyr_cube_0_0_0"));

  waterMesh.material = waterMat;
  waterMesh.receiveShadows = true;

  // water volume - semi-transparent box representing depth
  const waterVol = BABYLON.MeshBuilder.CreateBox("waterVolume", {
    width: 700,
    height: WATER_DEPTH,
    depth: 700
  }, scene);
  // position center so top is at WATER_SURFACE_Y
  waterVol.position.y = WATER_SURFACE_Y - WATER_DEPTH/2;
  const waterVolMat = new BABYLON.StandardMaterial("waterVolMat", scene);
  waterVolMat.diffuseColor = color3(SETTINGS.waterColor);
  waterVolMat.alpha = 0.35;
  waterVolMat.backFaceCulling = false;
  waterVolMat.specularColor = new BABYLON.Color3(0,0,0);
  waterVol.material = waterVolMat;
  waterVol.isPickable = false;

  // make sure water volume doesn't interfere with physics (no impostor)

  /* ---------------- RAMPS (wedge ramps) ---------------- */
  const RAMPS = [
    { x: 20,  z: 20,  rotY: 0,           width: 12, height: 6, depth: 8 },
    { x: -30, z: -10, rotY: Math.PI/2,  width: 10, height: 8, depth: 8 },
    { x: 40,  z: -40, rotY: Math.PI/3,  width: 14, height: 7, depth: 10 }
  ];
  const ramps = [];
  for (const r of RAMPS) {
    const wedge = makeTriWedge(scene, "ramp_" + r.x + "_" + r.z, r.width, r.height, r.depth);
    wedge.position.x = r.x;
    wedge.position.z = r.z;
    wedge.rotation.y = r.rotY;
    ramps.push({ mesh: wedge, def: r });
  }

  /* ---------------- RINGS ---------------- */
  const rings = [];
  for (let i = 0; i < ramps.length; i++) {
    const ramp = ramps[i].mesh;
    const pos = ramp.position.clone();
    pos.y += ramps[i].def.height + SETTINGS.ringHeightOffset; // above ramp top

    const tor = BABYLON.MeshBuilder.CreateTorus(
      "ring" + i,
      { diameter: SETTINGS.ringRadius*2, thickness: SETTINGS.ringThickness },
      scene
    );

    tor.position.copyFrom(pos);
    tor.rotation.x = Math.PI/2;
    tor.rotation.y = ramp.rotation.y;

    const rm = new BABYLON.StandardMaterial("ringMat" + i, scene);
    rm.emissiveColor = new BABYLON.Color3(0.9,0.7,0.1);
    tor.material = rm;

    rings.push(tor);
  }

  /* ---------------- TREES (natural clusters, avoid ramps) ---------------- */
  const trees = [];
  (function placeTrees() {
    const count = SETTINGS.treeCount;
    let attempts = 0, placed = 0;
    while (placed < count && attempts < count * 30) {
      attempts++;
      const x = rndRange(-groundSize/2 + 10, groundSize/2 - 10);
      const z = rndRange(-groundSize/2 + 10, groundSize/2 - 10);

      let ok = true;
      for (const r of RAMPS) {
        if (Math.hypot(x - r.x, z - r.z) < Math.max(r.width, 10) + 6) { ok = false; break; }
      }
      if (!ok) continue;

      let tooClose = false;
      for (const t of trees) if (Math.hypot(x - t.x, z - t.z) < 3.5) { tooClose = true; break; }
      if (tooClose) continue;

      const trunkH = rndRange(2.2, 3.6);
      const leafH  = rndRange(3.0, 5.0);
      const leafSize = rndRange(2.0, 4.0);
      const tiltX = rndRange(-0.12, 0.12);
      const tiltZ = rndRange(-0.12, 0.12);

      const trunk = BABYLON.MeshBuilder.CreateCylinder("trunk"+placed, {
        height: trunkH, diameterTop: 0.5, diameterBottom: 0.8
      }, scene);
      trunk.position.set(x, trunkH/2, z);
      trunk.rotation.z = tiltZ * 0.3;

      trunk.material = new BABYLON.StandardMaterial("tm"+placed, scene);
      trunk.material.diffuseColor = new BABYLON.Color3(0.35,0.25,0.12);

      const leaf = BABYLON.MeshBuilder.CreateCylinder("leaf"+placed, {
        height: leafH, diameterBottom: leafSize, diameterTop: 0
      }, scene);
      leaf.position.set(x, trunkH + leafH/2 - 0.3, z);
      leaf.rotation.x = tiltX;
      leaf.rotation.z = tiltZ;
      leaf.scaling.x = rndRange(0.9, 1.2);
      leaf.scaling.z = rndRange(0.9, 1.2);

      leaf.material = new BABYLON.StandardMaterial("lm"+placed, scene);
      leaf.material.diffuseColor = color3(SETTINGS.groundTopColor);

      trees.push({ trunk, leaf, x, z });
      placed++;
    }
  })();

  /* ---------------- COAT TEXTURE (small cubes only) ---------------- */
  let coatTex = null;
  if (SETTINGS.coatTexture) {
    coatTex = new BABYLON.Texture(SETTINGS.coatTexture, scene);
    coatTex.uScale = SETTINGS.coatSize;
    coatTex.vScale = SETTINGS.coatSize;
    coatTex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    coatTex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  }

  /* ---------------- SMALL CUBES (natural scatter) ---------------- */
  const cubes = [];
  (function scatterCubes() {
    const count = SETTINGS.cubeCount;
    const minDist = 3.0;
    let attempts = 0, placed = 0;
    const placedPositions = [];

    while (placed < count && attempts < count * 60) {
      attempts++;
      const x = rndRange(-groundSize/2 + 12, groundSize/2 - 12);
      const z = rndRange(-groundSize/2 + 12, groundSize/2 - 12);

      let ok = true;
      for (const r of RAMPS) {
        if (Math.hypot(x - r.x, z - r.z) < Math.max(r.width, 10) + 4) { ok = false; break; }
      }
      if (!ok) continue;

      let tooClose = false;
      for (const p of placedPositions) {
        if (Math.hypot(x - p.x, z - p.z) < minDist) { tooClose = true; break; }
      }
      if (tooClose) continue;

      const cmesh = BABYLON.MeshBuilder.CreateBox("cube"+placed, { size: SETTINGS.cubeSize }, scene);
      cmesh.position.set(x, SETTINGS.cubeSize/2 + 0.1, z);

      const m = new BABYLON.StandardMaterial("cm"+placed, scene);
      if (coatTex) {
        m.diffuseTexture = coatTex.clone();
        m.diffuseTexture.uScale = SETTINGS.coatSize;
        m.diffuseTexture.vScale = SETTINGS.coatSize;
        m.diffuseTexture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
        m.diffuseTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
      } else {
        m.diffuseColor = BABYLON.Color3.Random();
      }
      cmesh.material = m;

      cmesh.physicsImpostor = new BABYLON.PhysicsImpostor(
        cmesh,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { mass:1, friction:1 },
        scene
      );

      cubes.push(cmesh);
      placedPositions.push({ x, z });
      placed++;
    }
  })();

  /* ---------------- PYRAMID ---------------- */
  let pyrX = -5, pyrZ = 5;
  (function pickPyramidSpot(){
    const candidates = [
      {x:-5,z:5}, {x:10,z:-8}, {x: -12, z: 22}, {x: 25, z: -6}, {x:0, z: 0}
    ];
    for (const cand of candidates) {
      let ok = true;
      for (const r of RAMPS) {
        if (Math.hypot(cand.x - r.x, cand.z - r.z) < Math.max(r.width,10) + 8) { ok = false; break; }
      }
      if (ok) { pyrX = cand.x; pyrZ = cand.z; break; }
    }
  })();
  const pyramidMeshes = placeCubePyramid(scene, pyrX, pyrZ, 5, SETTINGS.cubeSize, SETTINGS.cubeSize + 0.2);

  /* ---------------- HILLS (big boxes) - top green, sides brown ---------------- */
  const hills = [];
  (function placeHills(){
    const count = SETTINGS.hillCount;
    const cols = Math.ceil(Math.sqrt(count));
    const spacing = 24;
    let ix = 0;
    for (let r = 0; r < cols && ix < count; r++) {
      for (let c = 0; c < cols && ix < count; c++) {
        const size = 6 + ix * 0.5;
        const x = -cols/2*spacing + c*spacing - 40;
        const z = -cols/2*spacing + r*spacing - 40;

        const h = BABYLON.MeshBuilder.CreateBox("hill"+ix, {width:size, height:size/2, depth:size}, scene);
        h.position.set(x, size/4 + 0.1, z);

        const top = new BABYLON.StandardMaterial("hTop"+ix, scene);
        top.diffuseColor = color3(SETTINGS.groundTopColor); // green top

        const sides = new BABYLON.StandardMaterial("hSide"+ix, scene);
        sides.diffuseColor = color3(SETTINGS.groundSideColor); // brown sides

        const mm = new BABYLON.MultiMaterial("hillM"+ix, scene);
        mm.subMaterials = [sides, sides, sides, sides, top, sides];
        h.material = mm;

        h.physicsImpostor = new BABYLON.PhysicsImpostor(
          h,
          BABYLON.PhysicsImpostor.BoxImpostor,
          { mass:0, friction:1 },
          scene
        );

        hills.push(h);
        ix++;
      }
    }
  })();

  /* ---------------- COINS ---------------- */
  const coins = [];
  const coinMat = new BABYLON.StandardMaterial("coinMat", scene);
  coinMat.emissiveColor = new BABYLON.Color3(1,0.85,0.1);

  function spawnCoin(id){
    const c = BABYLON.MeshBuilder.CreateTorus("coin"+id, { diameter:1, thickness:0.2 }, scene);
    c.rotation.x = Math.PI/2;
    c.material = coinMat;
    c.position.set(rndRange(-groundSize/2+12, groundSize/2-12), 1.2, rndRange(-groundSize/2+12, groundSize/2-12));
    return c;
  }
  for (let i = 0; i < SETTINGS.coinMax; i++) coins.push({ id: i, mesh: spawnCoin(i), active: true });

  /* ---------------- CAMERA ---------------- */
  const camera = new BABYLON.ArcRotateCamera("cam", Math.PI/2, Math.PI/3, 60, new BABYLON.Vector3(0,0,0), scene);
  camera.attachControl(canvas,true);

  /* day/night + underwater override */
  scene.registerBeforeRender(()=>{
    // day/night base color
    const t = (Date.now() % SETTINGS.dayNightCycleMs) / SETTINGS.dayNightCycleMs;
    const mix = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
    const dayNightColor = BABYLON.Color3.Lerp(color3(SETTINGS.nightColor), color3(SETTINGS.dayColor), mix);

    // underwater check
    const camY = camera.position.y;
    const underwater = camY < WATER_SURFACE_Y;

    if (underwater) {
      // darker blue clear color and a bit of fogginess
      scene.clearColor = color3(SETTINGS.waterUnderColor);
      scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
      scene.fogDensity = 0.02;
      scene.fogColor = color3(SETTINGS.waterUnderColor);

      // darken water surface coloring slightly
      waterMat.waterColor = color3(SETTINGS.waterUnderColor);
      waterVolMat.diffuseColor = color3(SETTINGS.waterUnderColor);
      waterVolMat.alpha = 0.45;
    } else {
      // normal sky/day color
      scene.clearColor = dayNightColor;
      scene.fogMode = BABYLON.Scene.FOGMODE_NONE;

      waterMat.waterColor = color3(SETTINGS.waterColor);
      waterVolMat.diffuseColor = color3(SETTINGS.waterColor);
      waterVolMat.alpha = 0.35;
    }

    // animate water normals
    if (waterMat) {
      const now = performance.now() * 0.001;
      waterMat.bumpTexture.uOffset = Math.sin(now * 0.3) * 0.02;
      waterMat.bumpTexture.vOffset = Math.cos(now * 0.27) * 0.02;
    }
  });

  return scene;
}

/* RUN */
const scene = createScene();
engine.runRenderLoop(()=> scene.render());
window.addEventListener("resize", ()=> engine.resize());
