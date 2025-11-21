/* ============================================================
   FULL MERGED & FIXED game.js
   - Keeps your helpers & structure
   - Restores hills
   - Seals ramps (no see-through)
   - Accurate underwater detection (ray + height)
   - Proper material handling (hex or Color3)
   - Water reflections limited & added after objects created
============================================================ */
window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("renderCanvas");
  const engine = new BABYLON.Engine(canvas, true);

  /* ============================================================
     SETTINGS
  ============================================================ */
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
  function color3(hexOrColor) {
    if (!hexOrColor) return new BABYLON.Color3(1,1,1);
    if (typeof hexOrColor === "string") return BABYLON.Color3.FromHexString(hexOrColor);
    if (hexOrColor instanceof BABYLON.Color3) return hexOrColor;
    return new BABYLON.Color3(1,1,1);
  }

  /* ============================================================
     MATERIAL HELPERS
     - accepts hex string or BABYLON.Color3
  ============================================================ */
  function createBoxMaterial(scene, colorInput, texturePath = null, size = 1, uniqueName = "") {
    const mat = new BABYLON.StandardMaterial("mat_" + uniqueName + "_" + Math.floor(Math.random()*10000), scene);
    if (texturePath) {
      const tex = new BABYLON.Texture(texturePath, scene);
      tex.uScale = tex.vScale = size;
      tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
      mat.diffuseTexture = tex;
    } else {
      mat.diffuseColor = color3(colorInput);
    }
    mat.specularPower = 16;
    mat.specularColor = new BABYLON.Color3(0.18,0.18,0.18);
    return mat;
  }

/* ============================================================
   TRUE SOLID RAMP (Right Triangle Prism)
   - Not hollow
   - Fully closed geometry
   - Real slope for acceleration
============================================================ */
function makeTriWedge(scene, name, width = 10, height = 6, depth = 8) {

  const ramp = BABYLON.MeshBuilder.CreatePolyhedron(name, {
    custom: {
      vertex: [
        // bottom rectangle
        [0, 0, 0],
        [width, 0, 0],
        [width, 0, depth],
        [0, 0, depth],

        // top slope edge
        [0, height, depth]
      ],
      face: [
        [0, 1, 2, 3],   // bottom
        [0, 1, 4],      // slope front
        [1, 2, 4],      // right side
        [2, 3, 4],      // back slope
        [3, 0, 4]       // left side
      ]
    }
  }, scene);

  // center it nicely
  ramp.position.y = -2;

  const mat = createBoxMaterial(scene, "#A6A6A6", null, 1, name);
  mat.backFaceCulling = false;
  mat.specularPower = 28;
  ramp.material = mat;

  ramp.physicsImpostor = new BABYLON.PhysicsImpostor(
    ramp,
    BABYLON.PhysicsImpostor.MeshImpostor,
    { mass: 0, friction: 1, restitution: 0 },
    scene
  );

  ramp.receiveShadows = true;
  ramp.isPickable = false;

  return ramp;
}

  /* ============================================================
     PYRAMID PLACER (unchanged)
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
     SCATTER OBJECTS helper
  ============================================================ */
  function scatterObjects(scene, count, checkCollision, createMeshFunc) {
    const objs = [];
    let attempts = 0;
    const maxAttempts = Math.max(2000, count * 100);
    while (objs.length < count && attempts < maxAttempts) {
      attempts++;
      const x = rnd(-140, 140);
      const z = rnd(-140, 140);

      if (!checkCollision(x, z, objs)) continue;
      const mesh = createMeshFunc(x, z, objs.length);
      if (mesh) objs.push(mesh);
    }
    return objs;
  }

  /* ============================================================
     CREATE SCENE (merged + fixed)
  ============================================================ */
  function createScene(){
    const scene = new BABYLON.Scene(engine);
    scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0), new BABYLON.CannonJSPlugin());

    /* lights */
    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
    hemi.intensity = 0.85;

    const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.2,-1,0.2), scene);
    sun.position = new BABYLON.Vector3(0,50,0);
    sun.intensity = 1.0;
    sun.shadowEnabled = true;

    /* ---------------- GROUND ---------------- */
    const groundSize = 300;
    const groundHeight = 10; // top at y=0
    const groundBox = BABYLON.MeshBuilder.CreateBox("groundBox", {
      width: groundSize,
      height: groundHeight,
      depth: groundSize
    }, scene);
    groundBox.position.y = -groundHeight/2; // top at 0

    // MultiMaterial order [front, back, right, left, top, bottom]
    const topMat = createBoxMaterial(scene, SETTINGS.groundTopColor, null, 1, "groundTop");
    const sideMat = createBoxMaterial(scene, SETTINGS.groundSideColor, null, 1, "groundSide");
    const groundMulti = new BABYLON.MultiMaterial("groundMulti", scene);
    groundMulti.subMaterials = [sideMat, sideMat, sideMat, sideMat, topMat, sideMat];
    groundBox.material = groundMulti;

    groundBox.physicsImpostor = new BABYLON.PhysicsImpostor(
      groundBox,
      BABYLON.PhysicsImpostor.BoxImpostor,
      { mass: 0, friction: 1 },
      scene
    );

    /* ---------------- WATER ---------------- */
    const waterMesh = BABYLON.MeshBuilder.CreateGround("waterSurface", { width: 700, height: 700, subdivisions: 32 }, scene);
    waterMesh.position.y = WATER_SURFACE_Y;
    const waterMat = new BABYLON.WaterMaterial("waterMat", scene);
    waterMat.bumpTexture = new BABYLON.Texture("https://cdn.babylonjs.com/textures/waterbump.png", scene);
    waterMat.windForce = -2;
    waterMat.waveHeight = 0.25;
    waterMat.waveLength = 0.12;
    waterMat.waterColor = color3(SETTINGS.waterColor);
    waterMat.colorBlendFactor = 0.3;
    waterMesh.material = waterMat;
    waterMesh.receiveShadows = true;

    const waterVol = BABYLON.MeshBuilder.CreateBox("waterVolume", {
      width: 700,
      height: WATER_DEPTH,
      depth: 700
    }, scene);
    waterVol.position.y = WATER_SURFACE_Y - WATER_DEPTH/2;
    const waterVolMat = new BABYLON.StandardMaterial("waterVolMat", scene);
    waterVolMat.diffuseColor = color3(SETTINGS.waterColor);
    waterVolMat.alpha = 0.35;
    waterVolMat.backFaceCulling = false;
    waterVol.material = waterVolMat;
    waterVol.isPickable = false;

    /* ---------------- RAMPS ---------------- */
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

    /* ---------------- TREES ---------------- */
    const trees = [];
    (function placeTrees() {
      const count = SETTINGS.treeCount;
      let attempts = 0, placed = 0;
      while (placed < count && attempts < count * 30) {
        attempts++;
        const x = rnd(-groundSize/2 + 10, groundSize/2 - 10);
        const z = rnd(-groundSize/2 + 10, groundSize/2 - 10);

        let ok = true;
        for (const r of RAMPS) {
          if (Math.hypot(x - r.x, z - r.z) < Math.max(r.width, 10) + 6) { ok = false; break; }
        }
        if (!ok) continue;

        let tooClose = false;
        for (const t of trees) if (Math.hypot(x - t.x, z - t.z) < 3.5) { tooClose = true; break; }
        if (tooClose) continue;

        const trunkH = rnd(2.2, 3.6);
        const leafH  = rnd(3.0, 5.0);
        const leafSize = rnd(2.0, 4.0);
        const tiltX = rnd(-0.12, 0.12);
        const tiltZ = rnd(-0.12, 0.12);

        const trunk = BABYLON.MeshBuilder.CreateCylinder("trunk"+placed, {
          height: trunkH, diameterTop: 0.5, diameterBottom: 0.8
        }, scene);
        trunk.position.set(x, trunkH/2, z);
        trunk.rotation.z = tiltZ * 0.3;

        trunk.material = createBoxMaterial(scene, "#59320C");

        const leaf = BABYLON.MeshBuilder.CreateCylinder("leaf"+placed, {
          height: leafH, diameterBottom: leafSize, diameterTop: 0
        }, scene);
        leaf.position.set(x, trunkH + leafH/2 - 0.3, z);
        leaf.rotation.x = tiltX;
        leaf.rotation.z = tiltZ;
        leaf.scaling.x = rnd(0.9, 1.2);
        leaf.scaling.z = rnd(0.9, 1.2);

        leaf.material = createBoxMaterial(scene, SETTINGS.groundTopColor);

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
        const x = rnd(-groundSize/2 + 12, groundSize/2 - 12);
        const z = rnd(-groundSize/2 + 12, groundSize/2 - 12);

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

        const top = createBoxMaterial(scene, SETTINGS.groundTopColor);

        // side material
        let sideMat;
        if (coatTex) {
          sideMat = new BABYLON.StandardMaterial("sideMat"+placed, scene);
          sideMat.diffuseTexture = coatTex.clone();
        } else {
          sideMat = new BABYLON.StandardMaterial("sideMat"+placed, scene);
          sideMat.diffuseColor = BABYLON.Color3.Random();
        }

        const mm = new BABYLON.MultiMaterial("cmMM"+placed, scene);
        mm.subMaterials = [sideMat, sideMat, sideMat, sideMat, top, sideMat];
        cmesh.material = mm;

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

    /* ---------------- HILLS (big boxes) ---------------- */
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

          const top = createBoxMaterial(scene, SETTINGS.groundTopColor);
          const sides = createBoxMaterial(scene, SETTINGS.groundSideColor);

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
      c.position.set(rnd(-groundSize/2+12, groundSize/2-12), 1.2, rnd(-groundSize/2+12, groundSize/2-12));
      return c;
    }
    for (let i = 0; i < SETTINGS.coinMax; i++) coins.push({ id: i, mesh: spawnCoin(i), active: true });

    /* ---------------- CAMERA ---------------- */
    const camera = new BABYLON.ArcRotateCamera("cam", Math.PI/2, Math.PI/3, 60, new BABYLON.Vector3(0,0,0), scene);
    camera.attachControl(canvas,true);

    /* ---------------- WATER REFLECTIONS (limited) ---------------- */
    // Add objects to water render list after creation (avoid trees to reduce artifacts)
    waterMat.addToRenderList(groundBox);
    ramps.forEach(r => waterMat.addToRenderList(r.mesh));
    cubes.forEach(c => waterMat.addToRenderList(c));
    hills.forEach(h => waterMat.addToRenderList(h));
    // pyramidMeshes are already boxes, add them too
    pyramidMeshes.forEach(p => waterMat.addToRenderList(p));

    /* ---------------- DAY/NIGHT & ACCURATE UNDERWATER ---------------- */
    scene.registerBeforeRender(()=>{
      // day/night base color
      const t = (Date.now() % SETTINGS.dayNightCycleMs) / SETTINGS.dayNightCycleMs;
      const mix = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
      const dayNightColor = BABYLON.Color3.Lerp(color3(SETTINGS.nightColor), color3(SETTINGS.dayColor), mix);

      // More accurate underwater detection:
      //  - if camera is obviously below surface by margin -> underwater
      //  - otherwise cast a short ray up to see if water is above camera
      let underwater = false;
      if (camera.position.y < WATER_SURFACE_Y - 0.5) {
        underwater = true;
      } else if (camera.position.y < WATER_SURFACE_Y + 5) {
        const upRay = new BABYLON.Ray(camera.position, new BABYLON.Vector3(0,1,0), 100);
        const pick = scene.pickWithRay(upRay, (m) => m === waterMesh);
        if (pick.hit && pick.pickedPoint.y > camera.position.y + 0.01) {
          underwater = true;
        }
      } // else camera is high above, not underwater

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

      // animate water normals
      if (waterMat.bumpTexture) {
        const now = performance.now() * 0.001;
        waterMat.bumpTexture.uOffset = Math.sin(now * 0.3) * 0.02;
        waterMat.bumpTexture.vOffset = Math.cos(now * 0.27) * 0.02;
      }
    });

    return scene;
  }

  /* ================= RUN */
  const scene = createScene();
  engine.runRenderLoop(()=> scene.render());
  window.addEventListener("resize", ()=> engine.resize());
});
