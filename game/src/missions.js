// The five-job story chain plus free-roam cash pickups. Missions are offered
// in order at a glowing start marker near the spawn; each job is a small
// state machine (phases, timer, fail states) with a beacon pillar at the
// current objective. Events flow back to the main loop through onEvent so
// money, wanted heat and sound stay in one place.
import * as THREE from 'three';
import { MISSIONS, SPAWN } from './config.js';
import { dist2d } from './random.js';
import { makeGlowSprite } from './world.js';

export const OFFER_POS = { x: SPAWN.x - 7, z: SPAWN.z + 3 };

function beaconMesh(colorHex, inner, outer) {
  const grp = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 22, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  pillar.position.y = 11;
  grp.add(pillar);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.5, 0.16, 8, 28),
    new THREE.MeshBasicMaterial({ color: colorHex }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.25;
  grp.add(ring);
  const glow = makeGlowSprite(inner, outer, 9);
  glow.position.y = 1.6;
  grp.add(glow);
  return { grp, pillar, ring };
}

export function createMissions(scene, rng) {
  const beacon = beaconMesh(0xffd76a, 'rgba(255,215,106,0.95)', 'rgba(255,170,40,0.4)');
  scene.add(beacon.grp);
  const offer = beaconMesh(0x6ee7ff, 'rgba(110,231,255,0.95)', 'rgba(60,160,255,0.4)');
  offer.grp.position.set(OFFER_POS.x, 0, OFFER_POS.z);
  scene.add(offer.grp);

  // Small pillars for the Cash Drops job (one per drop).
  const dropBeacons = MISSIONS[2].points.map(() => {
    const b = beaconMesh(0x7dff9a, 'rgba(125,255,154,0.95)', 'rgba(60,255,120,0.4)');
    b.grp.visible = false;
    scene.add(b.grp);
    return b;
  });

  // Free-roam cash pickups: floating $ sprites that respawn around town.
  const cashTex = (() => {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 96;
    const g = c.getContext('2d');
    g.font = '900 74px system-ui, sans-serif';
    g.textAlign = 'center';
    g.shadowColor = '#39ff7a';
    g.shadowBlur = 16;
    g.fillStyle = '#a8ffc4';
    g.fillText('$', 48, 72);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const pickups = [];
  for (let i = 0; i < 8; i += 1) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: cashTex, transparent: true, depthWrite: false }));
    spr.scale.set(1.7, 1.7, 1);
    scene.add(spr);
    pickups.push({ spr, x: 0, z: 0, active: false, timer: i * 4 });
  }
  function placePickup(p) {
    p.x = rng.range(-112, 112);
    p.z = rng.range(-112, 104);
    p.active = true;
    p.spr.visible = true;
    p.spr.position.set(p.x, 1.5, p.z);
  }

  const state = {
    nextIndex: 0,
    active: null,     // { def, phase, timer, idx, got:Set, failed, failReason }
    finished: false,
    lastFailed: null,
  };

  function currentPoint() {
    const a = state.active;
    if (!a) return null;
    const def = a.def;
    switch (def.kind) {
      case 'checkpoints': return def.points[a.idx] || null;
      case 'deliver': return a.phase === 'pickup' ? def.pickup : def.drop;
      case 'collect': {
        let best = null; let bd = Infinity;
        def.points.forEach((p, i) => {
          if (a.got.has(i)) return;
          const d = dist2d(p.x, p.z, state._px || 0, state._pz || 0);
          if (d < bd) { bd = d; best = p; }
        });
        return best;
      }
      case 'getaway': return def.point;
      case 'deliverCar': return def.point;
      default: return null;
    }
  }

  function startMission(index) {
    const def = MISSIONS[index];
    if (!def) return false;
    state.active = {
      def, phase: def.kind === 'deliver' ? 'pickup' : def.kind === 'getaway' ? 'reach' : 'go',
      timer: def.time, idx: 0, got: new Set(), failed: false, failReason: '',
    };
    state.lastFailed = null;
    dropBeacons.forEach((b, i) => {
      b.grp.visible = def.kind === 'collect';
      if (def.kind === 'collect') b.grp.position.set(def.points[i].x, 0, def.points[i].z);
    });
    return def;
  }

  function endMission() {
    state.active = null;
    dropBeacons.forEach((b) => { b.grp.visible = false; });
  }

  function objective() {
    if (state.finished) return { title: 'King of Palmera Bay', text: 'Free roam — the bay is yours', point: null, dist: null };
    const a = state.active;
    if (!a) {
      const def = MISSIONS[state.nextIndex];
      if (!def) return { title: 'Free Roam', text: 'Explore Palmera Bay', point: null, dist: null };
      return {
        title: `Next job: ${def.name}`,
        text: `Go to the blue marker to start — $${def.pay}`,
        point: OFFER_POS, dist: null,
      };
    }
    const def = a.def;
    const t = Math.max(0, Math.ceil(a.timer));
    const time = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    let text = '';
    if (a.failed) text = `Failed: ${a.failReason} — press R to retry`;
    else if (def.kind === 'checkpoints') text = `Checkpoint ${a.idx + 1} of ${def.points.length} · ${time} left`;
    else if (def.kind === 'deliver') text = a.phase === 'pickup' ? `Pick up the package · ${time} left` : `Deliver the package · ${time} left`;
    else if (def.kind === 'collect') text = `Cash drops ${a.got.size} of ${def.points.length} · ${time} left`;
    else if (def.kind === 'getaway') text = a.phase === 'reach' ? `Reach the hideout · ${time} left` : `Stay near the hideout and lose the heat · ${time} left`;
    else if (def.kind === 'deliverCar') text = `Deliver a car to the marina · ${time} left`;
    const point = currentPoint();
    return { title: `${def.name} — $${def.pay}`, text, point, dist: point ? Math.round(dist2d(point.x, point.z, state._px || 0, state._pz || 0)) : null };
  }

  // Advance the active job. ctx carries the player's situation; onEvent
  // reports 'checkpoint' | 'pickup' | 'collect' | 'heat' | 'complete' | 'fail' | 'cash'.
  function update(dt, ctx, onEvent) {
    state._px = ctx.x; state._pz = ctx.z;
    const time = ctx.time;
    // Animate beacons.
    for (const b of [beacon, offer, ...dropBeacons]) {
      b.ring.rotation.z = time * 1.4;
      b.pillar.material.opacity = 0.26 + Math.sin(time * 3) * 0.08;
    }
    offer.grp.visible = !state.active && !state.finished;
    // Cash pickups bob and can be collected on foot or by car.
    for (const p of pickups) {
      if (!p.active) {
        p.timer -= dt;
        if (p.timer <= 0) placePickup(p);
        continue;
      }
      p.spr.position.y = 1.5 + Math.sin(time * 2.4 + p.x) * 0.25;
      if (dist2d(p.x, p.z, ctx.x, ctx.z) < 2.4) {
        p.active = false;
        p.spr.visible = false;
        p.timer = 18;
        onEvent({ type: 'cash', amount: 25 });
      }
    }

    const a = state.active;
    if (!a || a.failed) { beacon.grp.visible = false; return; }
    const def = a.def;
    a.timer -= dt;
    if (a.timer <= 0) {
      a.failed = true; a.failReason = 'Out of time';
      state.lastFailed = def;
      onEvent({ type: 'fail', def, reason: a.failReason });
      return;
    }
    if (ctx.vehicleWrecked) {
      a.failed = true; a.failReason = 'Your car was wrecked';
      state.lastFailed = def;
      onEvent({ type: 'fail', def, reason: a.failReason });
      return;
    }
    const point = currentPoint();
    if (!point) { beacon.grp.visible = false; return; }
    beacon.grp.visible = true;
    beacon.grp.position.set(point.x, 0, point.z);
    const d = dist2d(point.x, point.z, ctx.x, ctx.z);

    if (def.kind === 'checkpoints' && d < 7.5) {
      a.idx += 1;
      if (a.idx >= def.points.length) { onEvent({ type: 'complete', def }); endMission(); }
      else onEvent({ type: 'checkpoint', def, idx: a.idx });
    } else if (def.kind === 'deliver') {
      if (a.phase === 'pickup' && d < 5.5) {
        a.phase = 'drop';
        onEvent({ type: 'pickup', def });
        if (def.heatOnPickup) onEvent({ type: 'heat', stars: def.heatOnPickup, def });
      } else if (a.phase === 'drop' && d < 7.5) {
        onEvent({ type: 'complete', def });
        endMission();
      }
    } else if (def.kind === 'collect') {
      def.points.forEach((p, i) => {
        if (a.got.has(i)) return;
        if (dist2d(p.x, p.z, ctx.x, ctx.z) < 6.5) {
          a.got.add(i);
          dropBeacons[i].grp.visible = false;
          onEvent({ type: 'collect', def, count: a.got.size });
          onEvent({ type: 'heatRaiseTo', stars: Math.min(3, a.got.size), def });
          if (a.got.size >= def.points.length) { onEvent({ type: 'complete', def }); endMission(); }
        }
      });
    } else if (def.kind === 'getaway') {
      if (a.phase === 'reach' && d < 11) {
        a.phase = 'lose';
        onEvent({ type: 'phase', def, text: 'Now lose the heat — stay near the hideout' });
      } else if (a.phase === 'lose' && ctx.wantedStars === 0 && d < 30) {
        onEvent({ type: 'complete', def });
        endMission();
      }
    } else if (def.kind === 'deliverCar' && d < 9.5 && ctx.inVehicle) {
      onEvent({ type: 'complete', def });
      endMission();
    }
  }

  return {
    state,
    offerPos: OFFER_POS,
    startMission,
    objective,
    update,
    // Begin the heat for jobs that start hot (called by main on start).
    startHeat(def) { return def.heatOnStart || 0; },
    retryFailed() {
      if (!state.lastFailed) return false;
      const idx = MISSIONS.indexOf(state.lastFailed);
      return startMission(idx);
    },
    nearOffer(x, z) { return dist2d(x, z, OFFER_POS.x, OFFER_POS.z) < 4.5; },
    setProgress(nextIndex, finished) {
      state.nextIndex = nextIndex;
      state.finished = !!finished;
    },
  };
}
