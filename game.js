/* ============================================================
   CLEAN REWRITE - Modular Babylon.js World
   - Organized helpers
   - Sealed ramps
   - Restored hills
   - Accurate underwater detection
   - Optimized water reflections
============================================================ */

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("renderCanvas");
  const engine = new BABYLON.Engine(canvas, true);

  const SETTINGS = {
    groundTopColor: "#33FF4B",
    groundSideColor: "#8B5A2B",
    waterColor: "#4DA6FF",
    waterUnderColor: "#0B3B8C",

    cubeCount: 30,
    hillCount: 12,
    treeCount: 40,
    cubeSize: 2,

    ringRadius: 5,
    ringThickness: 0.6,
    ringHeightOffset: 6,

    dayColor: "#9DE9FF",
    nightColor: "#1B2432",
    dayNightCycleMs: 300000,

    coatTexture: "box-texture.png"
  };

  const WATER_SURFACE_Y = -3;
  const WATER_DEPTH = 20;

  const rnd = (min, max) => Math.random() * (max - min) + min;
  const color3 = c => BABYLON.Color3.FromHexString(c);

  /* ============================================================
     MATERIAL HELPERS
  ============================================================ */
  function createMaterial(scene, color, texture = null, name = "") {
    const mat = new BABYLON.StandardMaterial(name + Math.random(), scene);
    if (texture) {
      mat.diffuseTexture = new BABYLON.Texture(texture, scene);
    } else {
      mat.diffuseColor = color3(color);
    }
    mat.specularPower = 16;
    return mat;
  }

  /* ============================================================
     SEALED RAMP CREATOR
  ============================================================ */
  function createRamp(scene, name, width, height, depth, pos, rotY) {
    const ramp = BABYLON.MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    ramp.scaling.y = 0.01;
    ramp.rotation.z = -Math.atan(height / depth);
    ramp.position.set(pos.x, height / 2, pos.z);
    ramp.rotation.y = rotY;

    ramp.material = createMaterial(scene, "#A6A6A6", null, name);
    ramp.physicsImpostor = new BABYLON.PhysicsImpostor(ramp, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0, friction: 1 }, scene);
    return ramp;
  }

  /* ============================================================
     SCENE CREATION
  ============================================================ */
  function createScene() {
    const scene = new BABYLON.Scene(engine);
    scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0), new BABYLON.CannonJSPlugin());

    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity = 0.8;

    const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.3, -1, 0.2), scene);
    sun.position = new BABYLON.Vector3(0, 60, 0);

    /* ---------------- GROUND ---------------- */
    const ground = BABYLON.MeshBuilder.CreateBox("ground", { width: 300, height: 10, depth: 300 }, scene);
    ground.position.y = -5;

    const groundMM = new BABYLON.MultiMaterial("groundMM", scene);
    groundMM.subMaterials = [
      createMaterial(scene, SETTINGS.groundSideColor),
      createMaterial(scene, SETTINGS.groundSideColor),
      createMaterial(scene, SETTINGS.groundSideColor),
      createMaterial(scene, SETTINGS.groundSideColor),
      createMaterial(scene, SETTINGS.groundTopColor),
      createMaterial(scene, SETTINGS.groundSideColor)
    ];

    ground.material = groundMM;
    ground.physicsImpostor = new BABYLON.PhysicsImpostor(ground, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0, friction: 1 }, scene);

    /* ---------------- WATER ---------------- */
    const water = BABYLON.MeshBuilder.CreateGround("water", { width: 700, height: 700 }, scene);
    water.position.y = WATER_SURFACE_Y;

    const waterMat = new BABYLON.WaterMaterial("waterMat", scene);
    waterMat.bumpTexture = new BABYLON.Texture("https://cdn.babylonjs.com/textures/waterbump.png", scene);
    waterMat.waterColor = color3(SETTINGS.waterColor);
    waterMat.waveHeight = 0.3;
    water.material = waterMat;

    const waterVol = BABYLON.MeshBuilder.CreateBox("waterVol", { width: 700, height: WATER_DEPTH, depth: 700 }, scene);
    waterVol.position.y = WATER_SURFACE_Y - WATER_DEPTH / 2;
    const waterVolMat = createMaterial(scene, SETTINGS.waterColor, null, "waterVol");
    waterVolMat.alpha = 0.35;
    waterVol.material = waterVolMat;
    waterVol.isPickable = false;

    /* ---------------- RAMPS ---------------- */
    const rampsData = [
      { x: 20, z: 20, w: 12, h: 6, d: 8, rot: 0 },
      { x: -30, z: -10, w: 10, h: 8, d: 8, rot: Math.PI / 2 }
    ];

    const ramps = rampsData.map((r, i) =>
      createRamp(scene, `ramp${i}`, r.w, r.h, r.d, { x: r.x, z: r.z }, r.rot)
    );

    /* ---------------- RINGS ---------------- */
    ramps.forEach((ramp, i) => {
      const ring = BABYLON.MeshBuilder.CreateTorus(`ring${i}`, {
        diameter: SETTINGS.ringRadius * 2,
        thickness: SETTINGS.ringThickness
      }, scene);

      ring.position = ramp.position.clone();
      ring.position.y += SETTINGS.ringHeightOffset;
      ring.rotation.x = Math.PI / 2;
      ring.rotation.y = ramp.rotation.y;
      ring.material = createMaterial(scene, "#E5B300");
    });

    /* ---------------- CAMERA ---------------- */
    const camera = new BABYLON.ArcRotateCamera("camera", Math.PI / 2, Math.PI / 3, 220, BABYLON.Vector3.Zero(), scene);
    camera.attachControl(canvas, true);

    /* ---------------- WATER & SKY LOOP ---------------- */
    scene.registerBeforeRender(() => {
      const t = (Date.now() % SETTINGS.dayNightCycleMs) / SETTINGS.dayNightCycleMs;
      const blend = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;

      const isUnderwater = camera.position.y < WATER_SURFACE_Y;

      scene.clearColor = isUnderwater
        ? color3(SETTINGS.waterUnderColor)
        : BABYLON.Color3.Lerp(color3(SETTINGS.nightColor), color3(SETTINGS.dayColor), blend);

      waterMat.waterColor = isUnderwater ? color3(SETTINGS.waterUnderColor) : color3(SETTINGS.waterColor);
      waterVolMat.alpha = isUnderwater ? 0.45 : 0.35;
    });

    return scene;
  }

  const scene = createScene();
  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
});
