/* ============================================================
   FULL MERGED & FIXED game.js (WORLD EXPANDED)
   - Larger ground
   - Natural city layout
   - Roads system
   - Hills repurposed as buildings
   - Street lights added
============================================================ */
window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("renderCanvas");
  const engine = new BABYLON.Engine(canvas, true);

  const SETTINGS = {
    groundTopColor: "#33FF4B",
    groundSideColor: "#8B5A2B",
    roadColor: "#111111",
    buildingColor: "#BBBBBB",
    windowColor: "#FFD966",
    lightColor: new BABYLON.Color3(1, 0.9, 0.6),

    cubeCount: 30,
    hillCount: 16,
    treeCount: 40,

    citySpacing: 40,
    roadWidth: 8,

    coinMax: 32,
    dayNightCycleMs: 5 * 60 * 1000
  };

  function rnd(min, max) { return Math.random() * (max - min) + min; }

  function createBoxMaterial(scene, color) {
    const m = new BABYLON.StandardMaterial("mat_" + Math.random(), scene);
    if (typeof color === "string") m.diffuseColor = BABYLON.Color3.FromHexString(color);
    else m.diffuseColor = color;
    return m;
  }

  /* ============================================================
     ROAD CREATOR
     Large flat black strips
  ============================================================ */
  function createRoad(scene, x, z, length, horizontal = true) {
    const road = BABYLON.MeshBuilder.CreateBox("road", {
      width: horizontal ? length : SETTINGS.roadWidth,
      height: 0.2,
      depth: horizontal ? SETTINGS.roadWidth : length
    }, scene);

    road.position.set(x, 0.11, z);
    road.material = createBoxMaterial(scene, SETTINGS.roadColor);

    road.physicsImpostor = new BABYLON.PhysicsImpostor(
      road,
      BABYLON.PhysicsImpostor.BoxImpostor,
      { mass: 0, friction: 1 },
      scene
    );
    return road;
  }

  /* ============================================================
     STREET LIGHT
  ============================================================ */
  function createStreetLight(scene, x, z) {
    const pole = BABYLON.MeshBuilder.CreateCylinder("pole", {
      height: 8,
      diameterTop: 0.2,
      diameterBottom: 0.4
    }, scene);
    pole.position.set(x, 4, z);
    pole.material = createBoxMaterial(scene, "#333333");

    const bulb = BABYLON.MeshBuilder.CreateSphere("bulb", { diameter: 0.6 }, scene);
    bulb.position.set(x, 8.3, z);

    const bulbMat = new BABYLON.StandardMaterial("bulbMat", scene);
    bulbMat.emissiveColor = SETTINGS.lightColor;
    bulb.material = bulbMat;

    const light = new BABYLON.PointLight("streetLight", new BABYLON.Vector3(x, 8.3, z), scene);
    light.intensity = 0.8;
    light.range = 20;

    return { pole, bulb, light };
  }

  /* ============================================================
     BUILDING (repurposed hills)
  ============================================================ */
  function createBuilding(scene, x, z) {
    const width = rnd(8, 14);
    const depth = rnd(8, 14);
    const height = rnd(10, 30);

    const b = BABYLON.MeshBuilder.CreateBox("building", {
      width,
      height,
      depth
    }, scene);

    b.position.set(x, height/2, z);
    const mat = createBoxMaterial(scene, SETTINGS.buildingColor);
    mat.emissiveColor = SETTINGS.windowColor.scale(0.15);
    b.material = mat;

    b.physicsImpostor = new BABYLON.PhysicsImpostor(
      b,
      BABYLON.PhysicsImpostor.BoxImpostor,
      { mass: 0, friction: 1 },
      scene
    );

    return b;
  }

  function createScene() {
    const scene = new BABYLON.Scene(engine);
    scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0), new BABYLON.CannonJSPlugin());

    new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene).intensity = 0.8;

    /* ---------------- GROUND ---------------- */
    const groundSize = 600; // EXPANDED WORLD

    const ground = BABYLON.MeshBuilder.CreateGround("ground", {
      width: groundSize,
      height: groundSize
    }, scene);

    ground.material = createBoxMaterial(scene, SETTINGS.groundTopColor);
    ground.physicsImpostor = new BABYLON.PhysicsImpostor(
      ground,
      BABYLON.PhysicsImpostor.BoxImpostor,
      { mass: 0 },
      scene
    );

    /* ---------------- CITY GRID ---------------- */
    const grid = SETTINGS.citySpacing;
    for (let x = -groundSize/2 + grid; x < groundSize/2; x += grid) {
      createRoad(scene, x, 0, groundSize, false);
      createRoad(scene, 0, x, groundSize, true);

      for (let z = -groundSize/2 + grid; z < groundSize/2; z += grid) {
        if (Math.random() > 0.35) {
          createBuilding(scene, x + rnd(-10,10), z + rnd(-10,10));
        }
      }
    }

    /* ---------------- STREET LIGHTS ---------------- */
    for (let x = -groundSize/2 + 20; x < groundSize/2; x += 40) {
      for (let z = -groundSize/2 + 20; z < groundSize/2; z += 40) {
        createStreetLight(scene, x, z);
      }
    }

    /* ---------------- CAMERA ---------------- */
    const camera = new BABYLON.ArcRotateCamera(
      "cam",
      Math.PI/2,
      Math.PI/3,
      120,
      new BABYLON.Vector3(0, 0, 0),
      scene
    );
    camera.attachControl(canvas, true);

    return scene;
  }

  const scene = createScene();
  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
});
