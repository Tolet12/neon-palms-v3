// Screenshot staging for ?shot=<scene>&seed=N. Each scene puts the REAL
// game into a real gameplay state (positions, wanted level, mission phase,
// money) and lets the normal loop run with an auto-driver holding the
// throttle, so the captured frame is a live moment of the game — never a
// drawn fake. Deterministic from the seed because the whole world is.

export function stageShot(name, api) {
  const { player, wanted, police, missions, hud } = api;
  api.startGame(false);

  // Put the player into the spawn-side parked car, then wipe any theft
  // heat the seating may have raised so the scene starts clean.
  function seatInSpawnCar() {
    const veh = api.giveVehicle();
    wanted.clear();
    return veh;
  }
  function driveFrom(veh, x, z, heading, speed) {
    veh.x = x; veh.z = z; veh.heading = heading; veh.speed = speed;
    player.x = x; player.z = z; player.heading = heading;
    api.setCamYaw(heading + Math.PI);
    api.setAutoDrive(true);
  }

  switch (name) {
    case 'cover': {
      // Driving the entertainment strip at golden hour: neon signs, palms,
      // traffic, skyline ahead — first job active on the HUD. After a
      // short roll, the cruise is re-framed (car mid-strip at speed, one
      // car ahead in-lane, one oncoming) and frozen for the capture.
      const veh = seatInSpawnCar();
      driveFrom(veh, -34, 47, Math.PI / 2, 13);
      api.snapCamera();
      missions.startMission(0);
      hud.showBanner('FIRST RUN', 'Prove you can drive. Hit every checkpoint.', 60000);
      setTimeout(() => {
        veh.x = -6; veh.z = 47; veh.speed = 14; veh.health = 100; veh.wrecked = false;
        const t = api.state.trafficCars;
        if (t[0]) { t[0].x = 6; t[0].z = 47; t[0].heading = Math.PI / 2; t[0].speed = 11; }
        if (t[1]) { t[1].x = 3; t[1].z = 53; t[1].heading = -Math.PI / 2; t[1].speed = 11; }
        for (let i = 2; i < t.length; i += 1) {
          if (Math.hypot(t[i].x - veh.x, t[i].z - veh.z) < 24) { t[i].x = 103; t[i].z = -97; }
        }
        api.snapCamera();
        hud.showBanner('FIRST RUN', 'Prove you can drive. Hit every checkpoint.', 60000);
        api.setFrozen(true);
      }, 950);
      break;
    }
    case 'chase': {
      // Full heat down a palm-lined street: four stars, police glued to
      // the rear bumper, roadblock waiting further south. The formation
      // is re-staged twice during the capture window so the frame always
      // catches the chase rolling, not the pin that ends it.
      const veh = seatInSpawnCar();
      wanted.setStars(4);
      const units = [];
      for (let i = 0; i < 3; i += 1) units.push(police.spawnNow({ x: -47, z: -95 }));
      driveFrom(veh, -47, -78, 0, 17);
      api.setCamDist(13.5, 4.6); // pull back so the pursuit fits the frame
      api.snapCamera();
      // Re-form ONLY the police behind wherever the player's car has got
      // to, so the pursuit is always close in frame while the camera
      // stays locked on the car.
      const gaps = [{ dx: -2.9, dz: -7.5 }, { dx: 2.9, dz: -7.5 }, { dx: 0, dz: -12 }];
      function formation() {
        veh.health = 100; veh.wrecked = false;
        // Clear civilian traffic out of the pursuit corridor so nothing
        // parks itself between the camera and the chase.
        for (const c of api.state.trafficCars) {
          if (Math.hypot(c.x - veh.x, c.z - veh.z) < 18) {
            c.x = 103; c.z = -97; c.heading = 0; c.speed = 3;
          }
        }
        units.forEach((u, i) => {
          const g = gaps[i % gaps.length];
          u.x = veh.x + g.dx;
          u.z = veh.z + g.dz;
          u.heading = veh.heading;
          u.speed = Math.max(13, Math.abs(veh.speed) * 0.92);
          u.health = 100; u.wrecked = false;
        });
        wanted.setStars(4);
        hud.showBanner('THE HEAT IS ON', 'Lose them, courier', 60000);
        // Keep the roadblock out of this scene: the shot is the pursuit
        // itself, and a block would end it before the capture lands.
        setTimeout(() => police.clearBlockers(), 350);
      }
      formation();
      // Let the pursuit run for a moment, re-form the police once, then
      // freeze the simulation on that live chase frame for the capture.
      setTimeout(() => { formation(); api.setFrozen(true); }, 1000);
      break;
    }
    case 'mission': {
      // On foot at the blue start marker, job offer on the HUD, the city
      // moving around the player.
      api.teleport(missions.offerPos.x + 2.5, missions.offerPos.z + 1.5);
      player.heading = Math.PI * 0.8;
      api.setCamYaw(player.heading + Math.PI);
      api.snapCamera();
      break;
    }
    case 'complete': {
      // The mission-complete moment, cruising south down the central
      // street toward the beach and the sea light.
      const veh = seatInSpawnCar();
      driveFrom(veh, 3, 30, 0, 10);
      api.snapCamera();
      api.setMoney(570);
      hud.showBanner('MISSION COMPLETE', 'Hot Package +$300', 60000);
      setTimeout(() => hud.showBanner('MISSION COMPLETE', 'Hot Package +$300', 60000), 2100);
      break;
    }
    default:
      break;
  }
}
