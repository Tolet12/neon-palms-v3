// NEON PALMS v2 — boot, the fixed-timestep loop, the camera, the state
// machine (title → playing → paused → busted/wasted), crime and collision
// consequences, saving, and the test/screenshot handle window.__neonPalms.
import * as THREE from 'three';
import { SPAWN, HOSPITAL, POLICE_STATION, SAVE_KEY, MISSIONS } from './config.js';
import { makeRng, clamp, angleDelta, dist2d } from './random.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createWorld } from './world.js';
import { createVehicle, createTraffic, createParkedCars, stepVehicle, syncVehicleMesh } from './vehicles.js';
import { createPlayer, stepPlayerOnFoot, startPunch, createPedestrians } from './player.js';
import { createWanted } from './wanted.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;
const shotName = params.get('shot');
const rng = makeRng(seed);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
camera.position.set(0, 40, 90);
camera.lookAt(0, 0, 0);

const world = createWorld(scene, rng);
const hud = createHud();
const audio = createAudio();
const input = createInput(canvas);

const player = createPlayer(scene, rng, SPAWN);
const pedestrians = createPedestrians(scene, rng, 20);
const traffic = createTraffic(scene, rng, world, 8);
const parkedCars = createParkedCars(scene, rng);
const wanted = createWanted();
const police = createPolice(scene, rng, world);
const missions = createMissions(scene, rng);
const extraVehicles = []; // cars the player took from traffic/police

// ------------------------------------------------------------------- state
const G = {
  mode: 'title',           // title | playing | paused | busted | wasted
  money: 120,
  missionsDone: 0,
  time: 0,
  bustedMeter: 0,
  camYaw: Math.PI,
  camFov: 62,
  damageCooldown: 0,
  lastDamageAt: -99,
  saveTimer: 0,
  started: false,
};
const repLevel = () => Math.min(5, 1 + G.missionsDone);
const payoutMult = () => 1 + 0.1 * (repLevel() - 1);

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number' || typeof data.nextMission !== 'number') return null;
    return data;
  } catch { return null; }
}
function persist() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: G.money,
      rep: repLevel(),
      nextMission: missions.state.nextIndex,
      finished: missions.state.finished,
    }));
  } catch { /* storage unavailable: play on without saving */ }
}

const titleScreen = document.getElementById('titleScreen');
const pauseScreen = document.getElementById('pauseScreen');
const endScreen = document.getElementById('endScreen');
const endTitle = document.getElementById('endTitle');
const endStats = document.getElementById('endStats');
const continueBtn = document.getElementById('continueBtn');
if (loadSave()) continueBtn.style.display = 'block';

function showScreen(name) {
  titleScreen.classList.toggle('on', name === 'title');
  pauseScreen.classList.toggle('on', name === 'paused');
  endScreen.classList.toggle('on', name === 'busted' || name === 'wasted');
  hud.setVisible(name === 'playing' || name === 'paused');
}

function startGame(useSave) {
  const save = useSave ? loadSave() : null;
  if (save) {
    G.money = save.money;
    missions.setProgress(save.nextMission, save.finished);
    G.missionsDone = save.finished ? MISSIONS.length : save.nextMission;
  } else {
    G.money = 120;
    G.missionsDone = 0;
    missions.setProgress(0, false);
  }
  G.mode = 'playing';
  G.started = true;
  audio.unlock();
  showScreen('playing');
  hud.showBanner('PALMERA BAY', missions.state.finished ? 'The bay is yours' : 'Find the blue marker to take your first job', 3200);
}

function failActiveMission(reason) {
  const a = missions.state.active;
  if (a && !a.failed) {
    a.failed = true;
    a.failReason = reason;
    missions.state.lastFailed = a.def;
  }
}

function endRun(kind) {
  G.mode = kind;
  failActiveMission(kind === 'busted' ? 'You got busted' : 'You got wasted');
  const fine = kind === 'busted' ? 150 : 100;
  G.money = Math.max(0, G.money - fine);
  endTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  endScreen.className = `screen on ${kind}`;
  endStats.innerHTML = `${kind === 'busted' ? 'The bay police impound your ride and fine you' : 'You wake up outside Palmera General'} — $${fine} gone.<br>`
    + `Money: $${G.money} · Jobs done: ${G.missionsDone} · Rep level ${repLevel()}<br>Press R to roll again.`;
  wanted.clear();
  police.clearAll();
  G.bustedMeter = 0;
  if (kind === 'busted') audio.fail();
  persist();
  showScreen(kind);
}

function respawn() {
  const spot = G.mode === 'busted' ? POLICE_STATION : HOSPITAL;
  exitVehicle(true);
  player.x = spot.x; player.z = spot.z;
  player.health = 100;
  player.fig.group.position.set(spot.x, 0, spot.z);
  G.mode = 'playing';
  showScreen('playing');
}

// ------------------------------------------------------------- car dealing
function allVehicles() {
  return [...parkedCars, ...traffic.cars, ...police.units, ...police.blockers, ...extraVehicles];
}
function focus() {
  const v = player.inVehicle;
  if (v) return { x: v.x, z: v.z, heading: v.heading, speed: v.speed };
  return { x: player.x, z: player.z, heading: player.heading, speed: 0 };
}
function witnesses() {
  const list = pedestrians.peds.map((p) => ({ x: p.x, z: p.z }));
  for (const u of police.units) list.push({ x: u.x, z: u.z });
  return list;
}

function nearestVehicle(maxDist) {
  let best = null; let bd = maxDist;
  for (const v of allVehicles()) {
    if (v.wrecked) continue;
    const d = dist2d(v.x, v.z, player.x, player.z);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

function enterVehicle(veh) {
  // Taking a car that is not yours is a crime when seen.
  const wasTraffic = traffic.cars.includes(veh);
  const wasPolice = police.units.includes(veh);
  if (wasTraffic) traffic.cars.splice(traffic.cars.indexOf(veh), 1);
  if (wasPolice) police.units.splice(police.units.indexOf(veh), 1);
  if (wasTraffic || wasPolice) extraVehicles.push(veh);
  player.inVehicle = veh;
  veh.parked = false;
  audio.door();
  if (wanted.report('theft', player.x, player.z, witnesses())) {
    hud.showBanner('VEHICLE THEFT', 'Someone saw that…', 1500);
  }
  if (wasPolice) wanted.addStars(1);
}

function exitVehicle(silent = false) {
  const veh = player.inVehicle;
  if (!veh) return;
  player.inVehicle = null;
  // Step out beside the car.
  const side = veh.heading + Math.PI / 2;
  player.x = veh.x + Math.sin(side) * 2.3;
  player.z = veh.z + Math.cos(side) * 2.3;
  const pos = { x: player.x, z: player.z };
  world.collideCircle(pos, 0.55);
  player.x = pos.x; player.z = pos.z;
  player.heading = veh.heading;
  veh.parked = true;
  veh.speed = 0;
  if (!silent) audio.door();
}

// ------------------------------------------------------------ mission glue
function onMissionEvent(ev) {
  const def = ev.def;
  switch (ev.type) {
    case 'cash':
      G.money += ev.amount;
      audio.cash();
      break;
    case 'checkpoint':
      audio.chime();
      hud.showBanner(`CHECKPOINT ${ev.idx} / ${def.points.length}`, '', 1100);
      break;
    case 'pickup':
      audio.chime();
      hud.showBanner('PACKAGE PICKED UP', 'Deliver it — the heat is coming', 2000);
      break;
    case 'collect':
      audio.cash();
      hud.showBanner(`CASH DROP ${ev.count} / ${def.points.length}`, 'Heat rising…', 1300);
      break;
    case 'heat':
      if (wanted.stars < ev.stars) wanted.setStars(ev.stars);
      break;
    case 'heatRaiseTo':
      if (wanted.stars < ev.stars) wanted.setStars(ev.stars);
      break;
    case 'phase':
      hud.showBanner(def.name.toUpperCase(), ev.text, 2200);
      break;
    case 'complete': {
      const payout = Math.round(def.pay * payoutMult());
      G.money += payout;
      G.missionsDone += 1;
      missions.state.nextIndex = G.missionsDone;
      audio.success();
      if (def.id === 'm5') {
        missions.state.finished = true;
        hud.showBanner('KING OF PALMERA BAY', `Harbor Finale complete +$${payout} — free roam is yours`, 5200);
      } else {
        hud.showBanner('MISSION COMPLETE', `${def.name} +$${payout}`, 3200);
      }
      persist();
      break;
    }
    case 'fail':
      audio.fail();
      hud.showBanner('MISSION FAILED', `${ev.reason} — press R to retry`, 3200);
      break;
    default:
      break;
  }
}

function tryStartMission() {
  if (missions.state.active || missions.state.finished) return;
  if (!missions.nearOffer(player.x, player.z) && !missions.nearOffer(focus().x, focus().z)) return;
  const def = missions.startMission(missions.state.nextIndex);
  if (!def) return;
  if (def.heatOnStart) wanted.setStars(def.heatOnStart);
  audio.chime();
  hud.showBanner(def.name.toUpperCase(), def.blurb, 3000);
}

function tryRetryMission() {
  if (!missions.state.lastFailed) return;
  const def = missions.retryFailed();
  if (!def) return;
  if (def.heatOnStart) wanted.setStars(def.heatOnStart);
  hud.showBanner(def.name.toUpperCase(), 'One more try', 1800);
}

// ------------------------------------------------------------------- step
const pendingActions = [];

function handleEdges() {
  for (const action of input.takeEdges()) {
    if (action === 'pause') {
      if (G.mode === 'playing') { G.mode = 'paused'; showScreen('paused'); }
      else if (G.mode === 'paused') { G.mode = 'playing'; showScreen('playing'); }
    } else if (action === 'confirm') {
      if (G.mode === 'title') startGame(false);
      else if (G.mode === 'busted' || G.mode === 'wasted') respawn();
    } else {
      pendingActions.push(action);
    }
  }
}

function damagePlayer(amount) {
  if (G.time - G.lastDamageAt < 0.35) return;
  G.lastDamageAt = G.time;
  player.health -= amount;
  hud.flashDamage();
  audio.thud();
  if (player.health <= 0 && G.mode === 'playing') {
    player.health = 0;
    endRun('wasted');
  }
}

function vehicleCollisions(dt) {
  const cars = allVehicles();
  const mine = player.inVehicle;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i]; const b = cars[j];
      const d = dist2d(a.x, a.z, b.x, b.z);
      if (d >= 3.4 || d === 0) continue;
      const push = (3.4 - d) / 2;
      const nx = (b.x - a.x) / d, nz = (b.z - a.z) / d;
      const aStatic = a.parked || a.wrecked, bStatic = b.parked || b.wrecked;
      if (!aStatic || a === mine) { a.x -= nx * push; a.z -= nz * push; }
      if (!bStatic || b === mine) { b.x += nx * push; b.z += nz * push; }
      // Damage only on a genuine impact: approach speed along the line
      // between the cars, and at most twice a second per car — sustained
      // pushing and shoving must not melt a car in a second.
      const aVx = Math.sin(a.heading) * a.speed, aVz = Math.cos(a.heading) * a.speed;
      const bVx = Math.sin(b.heading) * b.speed, bVz = Math.cos(b.heading) * b.speed;
      const approach = (aVx - bVx) * nx + (aVz - bVz) * nz;
      if (approach > 4) {
        if (a === mine || b === mine) {
          const other = a === mine ? b : a;
          if (G.time - (mine.lastCrashAt || -9) > 0.45) {
            mine.lastCrashAt = G.time;
            mine.health -= (approach - 3) * 2.1;
            if (other.police && Math.abs(mine.speed) > 8) {
              if (wanted.report('hitPolice', mine.x, mine.z, witnesses())) hud.showBanner('RAMMING THE LAW', '', 1200);
            }
            damagePlayer((approach - 3) * 0.8);
            if (mine.health <= 0) mine.wrecked = true;
            audio.thud();
          }
        } else if (G.time - (a.lastCrashAt || -9) > 0.45 && G.time - (b.lastCrashAt || -9) > 0.45) {
          a.lastCrashAt = G.time; b.lastCrashAt = G.time;
          a.health -= 3; b.health -= 3;
          audio.thud();
        }
        if (a === mine) a.speed *= 0.55;
        if (b === mine) b.speed *= 0.55;
      }
      syncVehicleMesh(a, 0, a.steerVis);
      syncVehicleMesh(b, 0, b.steerVis);
    }
  }
  // Cars versus pedestrians, and traffic versus the on-foot player.
  for (const car of cars) {
    if (Math.abs(car.speed) < 2.5) continue;
    for (const ped of pedestrians.peds) {
      if (ped.down > 0) continue;
      if (dist2d(car.x, car.z, ped.x, ped.z) < 1.9) {
        ped.down = 3;
        pedestrians.scatterAt(ped.x, ped.z, 6);
        if (car === mine) {
          if (wanted.report('hitPedestrian', car.x, car.z, witnesses())) hud.showBanner('HIT AND RUN', '', 1500);
          car.health -= 4;
        }
      }
    }
    if (!player.inVehicle && dist2d(car.x, car.z, player.x, player.z) < 1.8) {
      damagePlayer(11);
      const away = Math.atan2(player.x - car.x, player.z - car.z);
      player.x += Math.sin(away) * 2.4;
      player.z += Math.cos(away) * 2.4;
    }
  }
}

function step(dt) {
  G.time += dt;
  world.update(dt, G.time);

  // Queued one-shot actions.
  while (pendingActions.length) {
    const action = pendingActions.shift();
    if (G.mode !== 'playing') continue;
    if (action === 'interact') {
      if (player.inVehicle) exitVehicle();
      else {
        const veh = nearestVehicle(3.4);
        if (veh) enterVehicle(veh);
        else tryStartMission();
      }
    } else if (action === 'punch') {
      if (startPunch(player)) audio.punch();
    } else if (action === 'retry') {
      if (missions.state.active && missions.state.active.failed) tryRetryMission();
    }
  }
  if (G.mode === 'busted' || G.mode === 'wasted') {
    if (input.down('KeyR')) respawn();
    return;
  }
  if (G.mode !== 'playing' && G.mode !== 'title') return;
  const inTitle = G.mode === 'title';

  const f0 = focus();
  traffic.update(dt, f0, [...traffic.cars, ...parkedCars, ...police.units, ...(player.inVehicle ? [player.inVehicle] : [])]);
  pedestrians.update(dt, world, [...traffic.cars, ...police.units, ...(player.inVehicle ? [player.inVehicle] : [])]);

  if (inTitle) return;

  // Punch resolution, mid-swing.
  if (player.punchTimer > 0 && !player.punchHitDone && player.punchTimer < 0.18) {
    player.punchHitDone = true;
    const fx = player.x + Math.sin(player.heading) * 1.5;
    const fz = player.z + Math.cos(player.heading) * 1.5;
    if (pedestrians.scatterAt(fx, fz, 1.9)) {
      if (wanted.report('punch', player.x, player.z, witnesses())) hud.showBanner('ASSAULT', 'Witnessed!', 1200);
    }
  }

  // Player movement / driving.
  let playerSpeedAbs = 0;
  if (player.inVehicle) {
    const veh = player.inVehicle;
    const axis = input.moveAxis();
    let autoControl = null;
    if (G.autoDrive) {
      // Hold the throttle, but brake for anything close ahead (used by the
      // screenshot staging so the car cruises instead of crashing).
      let throttle = 0.8;
      const fx = veh.x + Math.sin(veh.heading) * 6.5;
      const fz = veh.z + Math.cos(veh.heading) * 6.5;
      for (const ob of allVehicles()) {
        if (ob === veh) continue;
        if (dist2d(fx, fz, ob.x, ob.z) < 3.4) { throttle = veh.speed > 1 ? -0.6 : 0; break; }
      }
      autoControl = { throttle, steer: 0, handbrake: false };
    }
    const control = autoControl || {
        throttle: axis.z,
        steer: -axis.x,
        handbrake: input.down('Space'),
      };
    const impact = stepVehicle(veh, dt, control, world);
    if (impact > 8) damagePlayer((impact - 7) * 1.1);
    player.x = veh.x; player.z = veh.z;
    player.heading = veh.heading;
    playerSpeedAbs = Math.abs(veh.speed);
    if (veh.wrecked) {
      if (missions.state.active && !missions.state.active.failed) {
        failActiveMission('Your car was wrecked');
        audio.fail();
        hud.showBanner('MISSION FAILED', 'Your car was wrecked — press R to retry', 3000);
      } else {
        hud.showBanner('WRECKED', 'That car is done — find another', 2000);
      }
      damagePlayer(8);
      exitVehicle(true);
    }
  } else {
    stepPlayerOnFoot(player, dt, input, G.camYaw, world);
  }

  vehicleCollisions(dt);

  // Police + wanted.
  const f = focus();
  const policeInfo = police.update(dt, { x: f.x, z: f.z, heading: f.heading, speed: playerSpeedAbs }, wanted.stars, playerSpeedAbs, G.time);
  wanted.update(dt, policeInfo.seenByPolice);
  if (policeInfo.anyClose && playerSpeedAbs < 2.2 && wanted.stars > 0) {
    G.bustedMeter = Math.min(1, G.bustedMeter + dt / 2.6);
    if (G.bustedMeter >= 1) { endRun('busted'); return; }
  } else {
    G.bustedMeter = Math.max(0, G.bustedMeter - dt * 0.5);
  }

  // Slow health regen when things are calm.
  if (G.time - G.lastDamageAt > 5 && player.health > 0 && player.health < 100) {
    player.health = Math.min(100, player.health + dt * 2.2);
  }

  // Missions.
  const vehWrecked = false; // wrecking your ride ends the run via exit above; fail is via timer/busted
  missions.update(dt, {
    x: f.x, z: f.z, inVehicle: !!player.inVehicle,
    vehicleWrecked: vehWrecked, wantedStars: wanted.stars, time: G.time,
  }, onMissionEvent);

  // Hints.
  if (!player.inVehicle && nearestVehicle(3.4)) hud.setHint('Press E to get in the car');
  else if (!player.inVehicle && !missions.state.active && !missions.state.finished && missions.nearOffer(player.x, player.z)) hud.setHint('Press E to start the job');
  else if (missions.state.active && missions.state.active.failed) hud.setHint('Press R to retry the job');
  else hud.setHint('');

  // Audio beds.
  const speedRatio = player.inVehicle ? clamp(Math.abs(player.inVehicle.speed) / 27, 0, 1) : 0;
  audio.update(dt, speedRatio, policeInfo.nearest < 26 && wanted.stars > 0, G.time);

  // Periodic save.
  G.saveTimer -= dt;
  if (G.saveTimer <= 0) { G.saveTimer = 5; persist(); }
}

// ----------------------------------------------------------------- camera
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  if (G.mode === 'title') {
    const t = G.time * 0.05;
    camera.position.set(Math.sin(t) * 85, 34 + Math.sin(G.time * 0.13) * 5, Math.cos(t) * 85);
    camera.lookAt(0, 4, 10);
    if (camera.fov !== 58) { camera.fov = 58; camera.updateProjectionMatrix(); }
    return;
  }
  const f = focus();
  G.camYaw += input.takeDrag();
  // Drift the camera behind whoever we are following.
  const behind = f.heading + Math.PI;
  const alignRate = player.inVehicle ? 1.6 : 0.9;
  G.camYaw += clamp(angleDelta(G.camYaw, behind), -alignRate * dt, alignRate * dt);
  const dist = G.camDistOverride?.dist ?? (player.inVehicle ? 9.6 : 7.4);
  const height = G.camDistOverride?.height ?? (player.inVehicle ? 3.35 : 3.1);
  const px = f.x + Math.sin(G.camYaw) * dist;
  const pz = f.z + Math.cos(G.camYaw) * dist;
  const pos = { x: px, z: pz };
  world.collideCircle(pos, 1.2);
  const lerpK = Math.min(1, dt * 7);
  camera.position.x += (pos.x - camera.position.x) * lerpK;
  camera.position.y += ((height) - camera.position.y) * lerpK;
  camera.position.z += (pos.z - camera.position.z) * lerpK;
  camTarget.set(f.x + Math.sin(f.heading) * 3.5, 1.5, f.z + Math.cos(f.heading) * 3.5);
  camera.lookAt(camTarget);
  const speedRatio = player.inVehicle ? clamp(Math.abs(player.inVehicle.speed) / 27, 0, 1) : 0;
  const targetFov = 62 + speedRatio * 13;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
}

// ------------------------------------------------------------------- loop
const STEP = 1 / 60;
let accumulator = 0;
let last = performance.now();
let lastCam = performance.now();
let firstFrame = true;

function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, 0.25);
  last = now;
  handleEdges();
  if (G.mode !== 'paused' && !G.frozen) {
    while (accumulator >= STEP) {
      step(STEP);
      accumulator -= STEP;
    }
  } else {
    accumulator = 0;
  }
  // The camera eases with REAL elapsed time, so it keeps up with the car
  // even when frames are slow; on a fast display this is the usual lerp.
  const camDt = Math.min((now - lastCam) / 1000, 0.1);
  lastCam = now;
  updateCamera(camDt);

  if (G.mode === 'playing' || G.mode === 'paused') {
    const f = focus();
    const obj = missions.objective();
    hud.update({
      health: player.inVehicle ? player.inVehicle.health : player.health,
      money: G.money,
      rep: repLevel(),
      stars: wanted.stars,
      objective: obj,
      speedKmh: player.inVehicle ? Math.abs(player.inVehicle.speed) * 3.6 : null,
      busted: G.bustedMeter,
      time: G.time,
      player: { x: f.x, z: f.z, heading: f.heading },
      beacon: obj.point,
      traffic: traffic.cars,
      police: police.units,
    });
  }
  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    window.__gameReady = true;
  }
}

document.getElementById('startBtn').addEventListener('click', () => startGame(false));
continueBtn.addEventListener('click', () => startGame(true));
document.getElementById('restartBtn').addEventListener('click', () => { if (G.mode === 'busted' || G.mode === 'wasted') respawn(); });

// ------------------------------------------------- test / screenshot hook
const api = {
  state: {
    get mode() { return G.mode; },
    get money() { return G.money; },
    get rep() { return repLevel(); },
    get missionsDone() { return G.missionsDone; },
    player,
    get currentVehicle() { return player.inVehicle; },
    get wantedStars() { return wanted.stars; },
    get camYaw() { return G.camYaw; },
    get health() { return player.health; },
    vehicles: allVehicles,
    trafficCars: traffic.cars,
    parkedCars,
    policeUnits: police.units,
    missionsState: missions.state,
  },
  world,
  player,
  wanted,
  police,
  missions,
  hud,
  startGame,
  setWanted: (n) => wanted.setStars(n),
  addWanted: (n) => wanted.addStars(n),
  commitCrime: () => wanted.addStars(1),
  teleport: (x, z) => {
    if (player.inVehicle) {
      player.inVehicle.x = x; player.inVehicle.z = z;
      syncVehicleMesh(player.inVehicle, 0, 0);
    }
    player.x = x; player.z = z;
    player.fig.group.position.set(x, 0, z);
  },
  enterNearestCar: () => {
    const veh = nearestVehicle(6);
    if (veh) enterVehicle(veh);
    return veh;
  },
  setCamYaw: (yaw) => { G.camYaw = yaw; },
  setAutoDrive: (on) => { G.autoDrive = !!on; },
  setFrozen: (on) => { G.frozen = !!on; },
  // Jump the camera straight to its follow position (screenshot staging,
  // where a slow lerp would still be travelling when the frame lands).
  setCamDist: (dist, height) => { G.camDistOverride = dist ? { dist, height } : null; },
  snapCamera: () => {
    const f = focus();
    const dist = G.camDistOverride?.dist ?? (player.inVehicle ? 9.6 : 7.4);
    const height = G.camDistOverride?.height ?? (player.inVehicle ? 3.35 : 3.1);
    camera.position.set(f.x + Math.sin(G.camYaw) * dist, height, f.z + Math.cos(G.camYaw) * dist);
    camTarget.set(f.x + Math.sin(f.heading) * 3.5, 1.5, f.z + Math.cos(f.heading) * 3.5);
    camera.lookAt(camTarget);
  },
  setMoney: (n) => { G.money = n; },
  giveVehicle: () => {
    const veh = parkedCars[parkedCars.length - 1];
    player.x = veh.x + 2; player.z = veh.z;
    enterVehicle(veh);
    return veh;
  },
};
window.__neonPalms = api;
window.__rendererInfo = () => renderer.info.render;
window.__camera = camera;

if (shotName) {
  stageShot(shotName, api);
}
showScreen(G.mode);
requestAnimationFrame(frame);
