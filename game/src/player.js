// The player character and the pedestrians of Palmera Bay: articulated
// low-poly figures (head, torso, swinging arms and legs) built from boxes.
// The player walks and runs relative to the camera, sprints, punches, and
// gets in and out of cars. Pedestrians stroll the sidewalks and scatter
// when danger comes close.
import * as THREE from 'three';
import { ROAD_X, ROAD_Z, WALK_SPEED, RUN_SPEED } from './config.js';
import { clamp, angleDelta, dist2d } from './random.js';
import { mergeColored, coloredMaterial } from './merge.js';

const figureMaterial = coloredMaterial();

const SKIN_TONES = [0xf2c89b, 0xc88d5f, 0x8a5a34, 0xffe0bd];
const SHIRTS = [0xff5964, 0x35c4e8, 0xffc53d, 0x7be495, 0xff8c42, 0xe86ec7, 0xf5f0e6, 0xb388ff];
const PANTS = [0x2c3e50, 0x5a4632, 0x37474f, 0x6d4c41, 0x263238, 0x795548];

function limb(w, h, d, mat, pivotY) {
  const grp = new THREE.Group();
  grp.position.y = pivotY;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.y = -h / 2;
  grp.add(mesh);
  return grp;
}

export function buildFigure(rng, opts = {}) {
  const skinColor = opts.skin ?? rng.pick(SKIN_TONES);
  const shirtColor = opts.shirt ?? rng.pick(SHIRTS);
  const pantsColor = opts.pants ?? rng.pick(PANTS);
  const hairColor = opts.hair ?? rng.pick([0x2a1c10, 0x4a2f18, 0x111111, 0x777777, 0xb5651d]);
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: pantsColor });
  const group = new THREE.Group();

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);

  const legL = limb(0.17, 0.8, 0.19, pants, 0.82); legL.position.x = -0.11; group.add(legL);
  const legR = limb(0.17, 0.8, 0.19, pants, 0.82); legR.position.x = 0.11; group.add(legR);
  // Torso, head and hair are one merged vertex-coloured mesh.
  const torso = new THREE.Mesh(mergeColored([
    { geo: new THREE.BoxGeometry(0.52, 0.62, 0.28), y: 1.13, color: shirtColor },
    { geo: new THREE.BoxGeometry(0.3, 0.32, 0.3), y: 1.62, color: skinColor },
    { geo: new THREE.BoxGeometry(0.34, 0.1, 0.34), y: 1.8, color: hairColor },
    { geo: new THREE.BoxGeometry(0.34, 0.08, 0.2), y: 1.74, z: 0.2, color: hairColor }, // cap brim
  ]), figureMaterial);
  group.add(torso);
  const armL = limb(0.13, 0.68, 0.15, shirt, 1.4); armL.position.x = -0.34; group.add(armL);
  const armR = limb(0.13, 0.68, 0.15, shirt, 1.4); armR.position.x = 0.34; group.add(armR);

  return { group, legL, legR, armL, armR, torso, head: torso };
}

export function animateFigure(fig, phase, amount) {
  const swing = Math.sin(phase) * 0.65 * amount;
  fig.legL.rotation.x = swing;
  fig.legR.rotation.x = -swing;
  fig.armL.rotation.x = -swing * 0.8;
  fig.armR.rotation.x = swing * 0.8;
}

// ------------------------------------------------------------------ player
export function createPlayer(scene, rng, spawn) {
  const fig = buildFigure(rng, { shirt: 0xff5964, pants: 0x2c3e50, skin: 0xf2c89b, hair: 0x2a1c10 });
  scene.add(fig.group);
  const player = {
    fig,
    x: spawn.x, z: spawn.z, heading: 0, // face south (+Z) toward the sea road
    health: 100, walkPhase: 0, punchTimer: 0, punchHitDone: false,
    inVehicle: null, dead: false,
    get pos() { return { x: this.x, z: this.z }; },
  };
  fig.group.position.set(player.x, 0, player.z);
  return player;
}

// Move the on-foot player for one step. camYaw is the camera's orbit angle;
// movement is relative to it. Returns the speed actually travelled.
export function stepPlayerOnFoot(player, dt, input, camYaw, world) {
  const axis = input.moveAxis();
  const sprint = input.down('ShiftLeft', 'ShiftRight');
  const speed = sprint ? RUN_SPEED : WALK_SPEED;
  let mx = 0; let mz = 0;
  if (axis.x !== 0 || axis.z !== 0) {
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    // Camera forward on the ground plane is (-sin, -cos) for our orbit rig;
    // right is (cos, -sin). Combine with the input axes.
    mx = (-sin * axis.z) + (cos * axis.x);
    mz = (-cos * axis.z) + (-sin * axis.x);
    const len = Math.hypot(mx, mz) || 1;
    mx /= len; mz /= len;
    const targetHeading = Math.atan2(mx, mz);
    player.heading += clamp(angleDelta(player.heading, targetHeading), -12 * dt, 12 * dt);
    player.x += mx * speed * dt;
    player.z += mz * speed * dt;
    const pos = { x: player.x, z: player.z };
    world.collideCircle(pos, 0.55);
    player.x = pos.x; player.z = pos.z;
    player.walkPhase += dt * (sprint ? 13 : 10);
    animateFigure(player.fig, player.walkPhase, 1);
  } else {
    animateFigure(player.fig, 0, 0);
  }
  if (player.punchTimer > 0) {
    player.punchTimer -= dt;
    const t = 1 - Math.max(0, player.punchTimer) / 0.28;
    player.fig.armR.rotation.x = -Math.sin(t * Math.PI) * 1.7;
  }
  player.fig.group.position.set(player.x, 0, player.z);
  player.fig.group.rotation.y = player.heading;
  player.fig.group.visible = !player.inVehicle;
  return (axis.x !== 0 || axis.z !== 0) ? speed : 0;
}

export function startPunch(player) {
  if (player.punchTimer > 0 || player.inVehicle) return false;
  player.punchTimer = 0.28;
  player.punchHitDone = false;
  return true;
}

// ------------------------------------------------------------- pedestrians
export function createPedestrians(scene, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const fig = buildFigure(rng, {});
    fig.group.scale.setScalar(rng.range(0.92, 1.02));
    scene.add(fig.group);
    const onVertical = rng.chance(0.5);
    const road = rng.pick(onVertical ? ROAD_X : ROAD_Z);
    const side = rng.pick([-1, 1]) * 8.1;
    const along = rng.range(-118, 108);
    const ped = {
      fig,
      x: onVertical ? road + side : along,
      z: onVertical ? along : road + side,
      axis: onVertical ? 'z' : 'x',
      road, side,
      dir: rng.chance(0.5) ? 1 : -1,
      speed: rng.range(1.1, 1.9),
      phase: rng.next() * 10,
      flee: 0, vx: 0, vz: 0, down: 0,
    };
    peds.push(ped);
  }

  function scatterAt(x, z, radius) {
    let hit = false;
    for (const ped of peds) {
      if (ped.down > 0) continue;
      const d = dist2d(ped.x, ped.z, x, z);
      if (d < radius) {
        ped.flee = 2.2;
        const away = Math.atan2(ped.x - x, ped.z - z);
        ped.vx = Math.sin(away) * 5.4;
        ped.vz = Math.cos(away) * 5.4;
        hit = true;
      }
    }
    return hit;
  }

  function update(dt, world, threats) {
    for (const ped of peds) {
      if (ped.down > 0) {
        ped.down -= dt;
        ped.fig.group.rotation.x = -Math.PI / 2 + 0.15;
        ped.fig.group.position.set(ped.x, 0.25, ped.z);
        if (ped.down <= 0) ped.fig.group.rotation.x = 0;
        continue;
      }
      // Cars (moving ones especially) are threats: run from the closest.
      for (const t of threats) {
        const d = dist2d(ped.x, ped.z, t.x, t.z);
        if (d < 4.2 && Math.abs(t.speed || 0) > 2) {
          ped.flee = Math.max(ped.flee, 1.6);
          const away = Math.atan2(ped.x - t.x, ped.z - t.z);
          ped.vx = Math.sin(away) * 5.6;
          ped.vz = Math.cos(away) * 5.6;
        }
      }
      if (ped.flee > 0) {
        ped.flee -= dt;
        ped.x += ped.vx * dt;
        ped.z += ped.vz * dt;
        ped.vx *= (1 - 1.6 * dt); ped.vz *= (1 - 1.6 * dt);
        ped.phase += dt * 14;
      } else {
        if (ped.axis === 'z') {
          ped.z += ped.dir * ped.speed * dt;
          if (ped.z > 112 || ped.z < -120) ped.dir *= -1;
          // Cross at intersections sometimes: switch axis.
          if (ROAD_Z.some((rz) => Math.abs(ped.z - rz) < 0.4) && rng.chance(0.004)) ped.axis = 'x';
        } else {
          ped.x += ped.dir * ped.speed * dt;
          if (ped.x > 120 || ped.x < -120) ped.dir *= -1;
          if (ROAD_X.some((rx) => Math.abs(ped.x - rx) < 0.4) && rng.chance(0.004)) ped.axis = 'z';
        }
        // Stay on the sidewalk of the current street.
        if (ped.axis === 'z') ped.x += ((ped.road + ped.side) - ped.x) * Math.min(1, dt * 2);
        else ped.z += ((ped.road + ped.side) - ped.z) * Math.min(1, dt * 2);
        ped.phase += dt * 7;
      }
      const pos = { x: ped.x, z: ped.z };
      world.collideCircle(pos, 0.45);
      ped.x = pos.x; ped.z = pos.z;
      const heading = ped.flee > 0
        ? Math.atan2(ped.vx, ped.vz)
        : (ped.axis === 'z' ? (ped.dir > 0 ? 0 : Math.PI) : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2));
      ped.fig.group.position.set(ped.x, 0, ped.z);
      ped.fig.group.rotation.y = heading;
      animateFigure(ped.fig, ped.phase, ped.flee > 0 ? 1 : 0.7);
    }
  }

  return { peds, update, scatterAt };
}
