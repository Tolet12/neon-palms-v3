// Police response: units spawn at the city edges in proportion to the
// wanted level, chase the player (in a car or on foot), ram and pin, set
// roadblocks at four stars and up, and fill the BUSTED meter when they can
// hold the player slow and close.
import { ROAD_X, ROAD_Z } from './config.js';
import { clamp, angleDelta, dist2d } from './random.js';
import { createVehicle, stepVehicle, syncVehicleMesh } from './vehicles.js';

const MAX_UNITS = 5;

export function createPolice(scene, rng, world) {
  const units = [];
  const blockers = []; // roadblock cars (parked, angled)
  let blockTimer = 0;
  let flashTime = 0;

  function spawnPos(focus) {
    // A road edge point 55–80 m from the player, snapped onto a street.
    const ang = rng.range(0, Math.PI * 2);
    const dist = rng.range(55, 80);
    let x = clamp(focus.x + Math.cos(ang) * dist, -118, 118);
    let z = clamp(focus.z + Math.sin(ang) * dist, -118, 108);
    const snapX = ROAD_X.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
    const snapZ = ROAD_Z.reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a));
    if (Math.abs(snapX - x) < Math.abs(snapZ - z)) x = snapX; else z = snapZ;
    return { x, z };
  }

  function desiredUnits(stars) {
    if (stars <= 0) return 0;
    return Math.min(MAX_UNITS, stars + 1);
  }

  function makeBlocker(x, z, heading) {
    const veh = createVehicle(scene, rng, { x, z, heading, police: true, parked: true });
    veh.isBlocker = true;
    syncVehicleMesh(veh, 0, 0);
    blockers.push(veh);
    return veh;
  }

  function clearBlockers() {
    for (const b of blockers) scene.remove(b.group);
    blockers.length = 0;
  }

  function setRoadblock(focus, headingHint) {
    clearBlockers();
    // Two cars angled across the road ahead of the player's travel.
    const ahead = 34;
    const bx = clamp(focus.x + Math.sin(headingHint) * ahead, -116, 116);
    const bz = clamp(focus.z + Math.cos(headingHint) * ahead, -116, 110);
    const snapX = ROAD_X.reduce((a, b) => (Math.abs(b - bx) < Math.abs(a - bx) ? b : a));
    const snapZ = ROAD_Z.reduce((a, b) => (Math.abs(b - bz) < Math.abs(a - bz) ? b : a));
    const onVertical = Math.abs(snapX - bx) <= Math.abs(snapZ - bz);
    if (onVertical) {
      makeBlocker(snapX - 2.6, bz, Math.PI / 2 + 0.5);
      makeBlocker(snapX + 2.6, bz, Math.PI / 2 - 0.5);
    } else {
      makeBlocker(bx, snapZ - 2.6, 0.5);
      makeBlocker(bx, snapZ + 2.6, -0.5);
    }
  }

  return {
    units,
    blockers,
    get count() { return units.length; },
    clearAll() {
      for (const u of units) scene.remove(u.group);
      units.length = 0;
      clearBlockers();
      blockTimer = 0;
    },
    clearBlockers() { clearBlockers(); blockTimer = 26; },
    // Spawn one unit right now (used by staging and by the heat response).
    spawnNow(focus) {
      const p = spawnPos(focus);
      const veh = createVehicle(scene, rng, { x: p.x, z: p.z, heading: Math.atan2(focus.x - p.x, focus.z - p.z), police: true });
      units.push(veh);
      return veh;
    },
    update(dt, focus, stars, playerSpeed, time) {
      flashTime = time;
      const want = desiredUnits(stars);
      // Trim or reinforce.
      while (units.length > want) {
        const u = units.pop();
        scene.remove(u.group);
      }
      if (units.length < want) {
        this.spawnNow(focus);
      }
      // Roadblocks at 4+ stars, refreshed periodically ahead of the player.
      blockTimer -= dt;
      if (stars >= 4) {
        if (blockTimer <= 0 && blockers.length === 0) {
          setRoadblock(focus, focus.heading || 0);
          blockTimer = 26;
        }
      } else if (blockers.length) {
        clearBlockers();
      }

      let nearest = Infinity;
      let anyClose = false;
      for (const u of units) {
        if (u.wrecked) continue;
        const d = dist2d(u.x, u.z, focus.x, focus.z);
        nearest = Math.min(nearest, d);
        if (d < 7) anyClose = true;
        // Aim slightly ahead of the target so intercepts feel deliberate.
        const lead = clamp(d * 0.03, 0, 1.2);
        const tx = focus.x + Math.sin(focus.heading || 0) * (focus.speed || 0) * lead * 0.4;
        const tz = focus.z + Math.cos(focus.heading || 0) * (focus.speed || 0) * lead * 0.4;
        const desired = Math.atan2(tx - u.x, tz - u.z);
        const delta = angleDelta(u.heading, desired);
        const steer = clamp(delta * 2.4, -1, 1);
        let throttle = 0.9;
        if (d < 5) throttle = 0.35;            // pin, don't orbit
        if (d > 90) throttle = 1;              // full chase
        if (Math.abs(delta) > 1.6 && u.speed > 6) throttle = -0.5; // turn around
        const impact = stepVehicle(u, dt, { throttle, steer, handbrake: Math.abs(delta) > 1.1 && u.speed > 8 }, world);
        if (impact > 6) u.lastRam = time;
      }
      // Light bars flash alternately.
      const phase = Math.sin(time * 10) > 0;
      for (const u of [...units, ...blockers]) {
        if (!u.lightBar) continue;
        u.lightBar.redMat.color.setHex(phase ? 0xff2222 : 0x5a0d0d);
        u.lightBar.blueMat.color.setHex(phase ? 0x2244ff : 0x0d1a5a);
        if (u.lightBar.glowR) u.lightBar.glowR.material.opacity = phase ? 1 : 0.15;
        if (u.lightBar.glowB) u.lightBar.glowB.material.opacity = phase ? 0.15 : 1;
        syncVehicleMesh(u, 0, u.steerVis);
      }
      return { nearest, anyClose, seenByPolice: nearest < 42 };
    },
  };
}

// Helper kept for callers that want a simple view of police strength.
export function policePressure(stars) {
  return stars <= 0 ? 0 : Math.min(1, 0.25 + stars * 0.16);
}
