// Cars: detailed low-poly models (shaped body, glass cabin, mirrors,
// bumpers, headlights — merged into ONE vertex-coloured mesh per car, so a
// whole car costs a handful of draw calls), steering/spinning wheels with
// rims, brake lights that brighten, damage smoke and fire, arcade driving
// physics, lane-following traffic and parked cars.
import * as THREE from 'three';
import { ROAD_X, ROAD_Z, CAR_COLORS, CAR_MAX_SPEED, CAR_ACCEL, TRAFFIC_SPEED } from './config.js';
import { clamp, angleDelta, dist2d } from './random.js';
import { makeGlowSprite } from './world.js';
import { mergeColored, coloredMaterial } from './merge.js';

const carMaterial = coloredMaterial();
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });
const shadowGeo = new THREE.PlaneGeometry(2.7, 5.1);
const tailGeo = new THREE.BoxGeometry(1.7, 0.13, 0.06);

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const BODY_PARTS = [
  { geo: box(1.9, 0.55, 4.3), y: 0.58, key: 'paint' },                 // main body
  { geo: box(1.78, 0.3, 1.15), y: 0.72, z: 1.72, rx: -0.1, key: 'paint' }, // sloped hood
  { geo: box(1.68, 0.55, 1.95), y: 1.08, z: -0.25, color: 0x18283e },  // glass cabin
  { geo: box(1.74, 0.09, 1.85), y: 1.4, z: -0.25, key: 'paint' },      // roof
  { geo: box(1.94, 0.22, 0.3), y: 0.38, z: 2.2, color: 0x2c2f36 },     // front bumper
  { geo: box(1.94, 0.22, 0.3), y: 0.38, z: -2.2, color: 0x2c2f36 },    // rear bumper
  { geo: box(0.28, 0.14, 0.1), y: 1.05, z: 0.62, x: -1.02, key: 'paint' }, // mirrors
  { geo: box(0.28, 0.14, 0.1), y: 1.05, z: 0.62, x: 1.02, key: 'paint' },
  { geo: box(0.42, 0.14, 0.06), y: 0.62, z: 2.16, x: -0.6, color: 0xfff3b0 }, // headlights
  { geo: box(0.42, 0.14, 0.06), y: 0.62, z: 2.16, x: 0.6, color: 0xfff3b0 },
  { geo: box(1.7, 0.1, 0.05), y: 0.9, z: 2.13, color: 0xd8dde6 },      // grille highlight
];
const POLICE_PARTS = [
  { geo: box(0.04, 0.3, 3.6), y: 0.62, x: -0.97, color: 0x2456c8 },    // door stripes
  { geo: box(0.04, 0.3, 3.6), y: 0.62, x: 0.97, color: 0x2456c8 },
  { geo: box(1.3, 0.12, 0.4), y: 1.5, z: -0.25, color: 0x22242c },     // light bar base
];
const wheelGeoMerged = mergeColored([
  { geo: new THREE.CylinderGeometry(0.37, 0.37, 0.3, 12), rz: Math.PI / 2, color: 0x14151a },
  { geo: new THREE.CylinderGeometry(0.2, 0.2, 0.32, 8), rz: Math.PI / 2, color: 0xc8ccd4 },
]);

function buildWheel() {
  const grp = new THREE.Group();
  const mesh = new THREE.Mesh(wheelGeoMerged, carMaterial);
  grp.add(mesh);
  return { grp, mesh };
}

export function createVehicle(scene, rng, opts) {
  const police = !!opts.police;
  const paint = police ? 0xf2f4f8 : opts.color;
  const group = new THREE.Group();

  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  const parts = BODY_PARTS.map((p) => ({ ...p, color: p.key === 'paint' ? paint : p.color }));
  if (police) parts.push(...POLICE_PARTS);
  const bodyMesh = new THREE.Mesh(mergeColored(parts), carMaterial);
  group.add(bodyMesh);

  const headGlow = makeGlowSprite('rgba(255,240,180,0.8)', 'rgba(255,210,120,0.3)', 2.6);
  headGlow.position.set(0, 0.62, 2.45);
  group.add(headGlow);

  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x7d1420 });
  const tail = new THREE.Mesh(tailGeo, brakeMat);
  tail.position.set(0, 0.66, -2.16);
  group.add(tail);

  const wheels = [];
  const wheelPos = [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]];
  for (const [wx, wz] of wheelPos) {
    const w = buildWheel();
    w.grp.position.set(wx, 0.37, wz);
    group.add(w.grp);
    wheels.push(w);
  }

  // Damage smoke (and fire at low health) over the hood.
  const smoke = makeGlowSprite('rgba(70,70,80,0.75)', 'rgba(50,50,60,0.35)', 2.2);
  smoke.material.blending = THREE.NormalBlending;
  smoke.position.set(0, 1.6, 1.6);
  smoke.visible = false;
  group.add(smoke);
  const fire = makeGlowSprite('rgba(255,170,60,0.95)', 'rgba(255,80,20,0.5)', 1.6);
  fire.position.set(0, 1.2, 1.7);
  fire.visible = false;
  group.add(fire);

  let lightBar = null;
  if (police) {
    lightBar = { redMat: new THREE.MeshBasicMaterial({ color: 0xff2222 }), blueMat: new THREE.MeshBasicMaterial({ color: 0x2244ff }) };
    const rl = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.36), lightBar.redMat);
    rl.position.set(-0.33, 1.62, -0.25); group.add(rl);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.36), lightBar.blueMat);
    bl.position.set(0.33, 1.62, -0.25); group.add(bl);
    const glowR = makeGlowSprite('rgba(255,60,60,0.9)', 'rgba(255,0,0,0.4)', 3.4);
    glowR.position.set(-0.33, 1.7, -0.25); group.add(glowR);
    const glowB = makeGlowSprite('rgba(80,120,255,0.9)', 'rgba(0,60,255,0.4)', 3.4);
    glowB.position.set(0.33, 1.7, -0.25); group.add(glowB);
    lightBar.glowR = glowR; lightBar.glowB = glowB;
  }

  group.position.set(opts.x, 0, opts.z);
  group.rotation.y = opts.heading || 0;
  scene.add(group);

  return {
    group, wheels, brakeMat, smoke, fire, lightBar,
    x: opts.x, z: opts.z, heading: opts.heading || 0,
    speed: 0, health: 100, police, wrecked: false,
    steerVis: 0, radius: 1.75, parked: !!opts.parked,
    flashPhase: rng.next() * Math.PI * 2,
  };
}

// One physics step. control = { throttle: -1..1, steer: -1..1, handbrake }.
// Returns impact speed lost to a wall hit this step (0 = no hit).
export function stepVehicle(veh, dt, control, world) {
  if (veh.wrecked) { veh.speed = 0; syncVehicleMesh(veh, dt, 0); return 0; }
  const throttle = clamp(control.throttle || 0, -1, 1);
  const steer = clamp(control.steer || 0, -1, 1);
  if (throttle > 0) veh.speed += CAR_ACCEL * throttle * dt * (1 - Math.max(0, veh.speed) / (CAR_MAX_SPEED * 1.25));
  else if (throttle < 0) {
    veh.speed += (veh.speed > 0.5 ? -22 : CAR_ACCEL * 0.55 * throttle) * dt;
  }
  veh.speed -= veh.speed * (control.handbrake ? 1.4 : 0.35) * dt;
  if (Math.abs(veh.speed) < 0.04 && throttle === 0) veh.speed = 0;
  veh.speed = clamp(veh.speed, -9, CAR_MAX_SPEED);

  const speedRatio = clamp(Math.abs(veh.speed) / 12, 0, 1);
  const turnRate = (control.handbrake ? 2.6 : 1.85) * speedRatio * (veh.speed < 0 ? -1 : 1);
  veh.heading += steer * turnRate * dt;
  veh.steerVis = steer;

  const before = Math.abs(veh.speed);
  veh.x += Math.sin(veh.heading) * veh.speed * dt;
  veh.z += Math.cos(veh.heading) * veh.speed * dt;
  const pos = { x: veh.x, z: veh.z };
  const hit = world.collideCircle(pos, veh.radius);
  veh.x = pos.x; veh.z = pos.z;
  let impact = 0;
  if (hit && before > 3.5) {
    impact = before;
    veh.health -= (before - 3) * 2.4;
    veh.speed = -veh.speed * 0.22;
    if (veh.health <= 0) { veh.health = 0; veh.wrecked = true; }
  } else if (hit) {
    veh.speed *= 0.6;
  }
  veh.brakeMat.color.setHex(throttle < 0 || control.handbrake ? 0xff2a3a : 0x7d1420);
  syncVehicleMesh(veh, dt, steer);
  return impact;
}

export function syncVehicleMesh(veh, dt, steer) {
  veh.group.position.set(veh.x, 0, veh.z);
  veh.group.rotation.y = veh.heading;
  const spin = (veh.speed * dt) / 0.37;
  veh.wheels.forEach((w, i) => {
    w.mesh.rotation.x += spin;
    if (i < 2) w.grp.rotation.y = (steer || 0) * 0.42;
  });
  const dmg = 100 - veh.health;
  veh.smoke.visible = dmg > 40;
  if (veh.smoke.visible) {
    const s = 1.6 + (dmg / 100) * 2 + Math.sin(performance.now() * 0.01) * 0.2;
    veh.smoke.scale.set(s, s, 1);
  }
  veh.fire.visible = (dmg > 72 && !veh.wrecked) || veh.wrecked;
  if (veh.fire.visible) {
    const s = 1.2 + Math.random() * 0.7;
    veh.fire.scale.set(s, s * 1.2, 1);
  }
}

// ------------------------------------------------------------- traffic AI
// Traffic cars pick the next intersection on their street, drive to it,
// then turn (or go straight) onto the crossing street. They brake for
// anything close ahead and respawn near the player when they drift far.
export function createTraffic(scene, rng, world, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const onVertical = rng.chance(0.5);
    const road = rng.pick(onVertical ? ROAD_X : ROAD_Z);
    const along = rng.range(-110, 100);
    const dir = rng.chance(0.5) ? 1 : -1;
    const lane = 3 * dir * (onVertical ? 1 : -1); // right-hand lane offset
    const x = onVertical ? road + lane : along;
    const z = onVertical ? along : road - lane;
    const heading = onVertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const veh = createVehicle(scene, rng, { x, z, heading, color: rng.pick(CAR_COLORS) });
    veh.traffic = { axis: onVertical ? 'z' : 'x', dir, target: null };
    chooseTarget(veh, rng);
    cars.push(veh);
  }

  function chooseTarget(veh, rng) {
    const t = veh.traffic;
    const lines = t.axis === 'z' ? ROAD_Z : ROAD_X;
    const here = t.axis === 'z' ? veh.z : veh.x;
    let best = null;
    for (const line of lines) {
      const d = (line - here) * t.dir;
      if (d > 4 && (best === null || d < best.d)) best = { line, d };
    }
    if (best === null) { t.dir *= -1; chooseTarget(veh, rng); return; }
    t.targetLine = best.line;
  }

  function update(dt, focus, obstacles) {
    for (const veh of cars) {
      if (veh.wrecked) continue;
      if (dist2d(veh.x, veh.z, focus.x, focus.z) > 175) {
        const ang = rng.range(0, Math.PI * 2);
        const nx = clamp(focus.x + Math.cos(ang) * 95, -115, 115);
        const nz = clamp(focus.z + Math.sin(ang) * 95, -115, 105);
        const rx = ROAD_X.reduce((a, b) => (Math.abs(b - nx) < Math.abs(a - nx) ? b : a));
        veh.x = rx + 3; veh.z = nz;
        veh.heading = rng.chance(0.5) ? 0 : Math.PI;
        veh.traffic.axis = 'z';
        veh.traffic.dir = veh.heading === 0 ? 1 : -1;
        veh.speed = 4;
        chooseTarget(veh, rng);
      }
      const t = veh.traffic;
      const laneOff = 3;
      let wx; let wz;
      if (t.axis === 'z') {
        const streetX = ROAD_X.reduce((a, b) => (Math.abs(b - veh.x) < Math.abs(a - veh.x) ? b : a));
        wx = streetX + (t.dir > 0 ? laneOff : -laneOff);
        wz = t.targetLine;
        if ((wz - veh.z) * t.dir < 3) {
          if (rng.chance(0.45)) { t.axis = 'x'; t.dir = rng.chance(0.5) ? 1 : -1; }
          chooseTarget(veh, rng);
        }
      } else {
        const streetZ = ROAD_Z.reduce((a, b) => (Math.abs(b - veh.z) < Math.abs(a - veh.z) ? b : a));
        wz = streetZ + (t.dir > 0 ? -laneOff : laneOff);
        wx = t.targetLine;
        if ((wx - veh.x) * t.dir < 3) {
          if (rng.chance(0.45)) { t.axis = 'z'; t.dir = rng.chance(0.5) ? 1 : -1; }
          chooseTarget(veh, rng);
        }
      }
      const desired = Math.atan2(wx - veh.x, wz - veh.z);
      const delta = angleDelta(veh.heading, desired);
      const steer = clamp(delta * 2.2, -1, 1);
      let throttle = veh.speed < TRAFFIC_SPEED ? 0.7 : 0;
      const fx = veh.x + Math.sin(veh.heading) * 6.5;
      const fz = veh.z + Math.cos(veh.heading) * 6.5;
      for (const ob of obstacles) {
        if (ob === veh) continue;
        if (dist2d(fx, fz, ob.x, ob.z) < 3.4) { throttle = veh.speed > 1 ? -0.7 : 0; break; }
      }
      if (Math.abs(delta) > 1.2) throttle = Math.min(throttle, 0.25);
      stepVehicle(veh, dt, { throttle, steer, handbrake: false }, world);
    }
  }

  return { cars, update };
}

// Parked cars along the kerbs — the player's usual way into a driver's seat.
export function createParkedCars(scene, rng) {
  const cars = [];
  const spots = [
    { x: -42, z: 30, heading: 0 }, { x: 8, z: -42, heading: Math.PI / 2 },
    { x: 58, z: 66, heading: Math.PI }, { x: -92, z: -8, heading: 0 },
    { x: 42, z: -92, heading: -Math.PI / 2 }, { x: -8, z: 94, heading: Math.PI / 2 },
    { x: 108, z: 20, heading: Math.PI }, { x: -58, z: -42, heading: 0 },
    { x: 20, z: 8, heading: Math.PI / 2 }, { x: -94, z: -60, heading: 0 },
  ];
  // One reliable car right by the spawn point.
  spots.push({ x: 16, z: 50, heading: Math.PI / 2 });
  for (const s of spots) {
    const veh = createVehicle(scene, rng, { x: s.x, z: s.z, heading: s.heading, color: rng.pick(CAR_COLORS), parked: true });
    syncVehicleMesh(veh, 0, 0);
    cars.push(veh);
  }
  return cars;
}
