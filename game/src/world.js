// Palmera Bay itself: sky, sea, streets, buildings, palms, neon and props.
// Almost every surface is a canvas-generated texture (facades with lit
// windows, a full city-plan ground sheet with lane markings and crosswalks,
// billboards, fronds), so the city reads rich while staying fully offline
// and cheap to draw. No shadow maps — shading is faked with gradient
// textures, blob shadows and warm fog.
import * as THREE from 'three';
import {
  ROAD_X, ROAD_Z, ROAD_HALF, CITY_MIN, CITY_MAX, BEACH_Z, WATER_Z, STORE_NAMES,
} from './config.js';
import { clamp } from './random.js';
import { mergeColored, coloredMaterial } from './merge.js';

function canvasTexture(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (opts.repeat) { tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; }
  return tex;
}

function glowTexture(inner, outer) {
  return canvasTexture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.35, outer);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
}

export function makeGlowSprite(colorInner, colorOuter, scale) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(colorInner, colorOuter), blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true,
  });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(scale, scale, 1);
  return spr;
}

// ---------------------------------------------------------------- sky & sea
function buildSky(scene, rng) {
  const skyTex = canvasTexture(64, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#274b9f');
    grad.addColorStop(0.38, '#5f8fd6');
    grad.addColorStop(0.62, '#e8907c');
    grad.addColorStop(0.78, '#ffc98a');
    grad.addColorStop(1, '#ffe3ae');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(700, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  // Low golden sun with a fat glow, sitting over the sea to the south-west.
  const sun = makeGlowSprite('rgba(255,246,190,1)', 'rgba(255,160,80,0.55)', 190);
  sun.position.set(-260, 62, 430);
  sun.material.fog = false;
  scene.add(sun);
  const sunCore = new THREE.Mesh(
    new THREE.CircleGeometry(26, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2b8, fog: false }),
  );
  sunCore.position.copy(sun.position);
  sunCore.lookAt(0, 40, 0);
  scene.add(sunCore);

  // Soft billboard clouds.
  const cloudTex = canvasTexture(256, 128, (g) => {
    g.clearRect(0, 0, 256, 128);
    for (let i = 0; i < 16; i += 1) {
      const x = 30 + rng.next() * 196, y = 45 + rng.next() * 40, r = 16 + rng.next() * 26;
      const grad = g.createRadialGradient(x, y, 1, x, y, r);
      grad.addColorStop(0, 'rgba(255,244,230,0.55)');
      grad.addColorStop(1, 'rgba(255,244,230,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  });
  const clouds = [];
  for (let i = 0; i < 7; i += 1) {
    const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.85 });
    const spr = new THREE.Sprite(mat);
    const s = 120 + rng.next() * 130;
    spr.scale.set(s, s * 0.42, 1);
    spr.position.set(rng.range(-420, 420), 120 + rng.next() * 90, rng.range(-420, 300));
    scene.add(spr);
    clouds.push(spr);
  }

  // Distant skyline silhouettes: two cut-out strips per side, far enough out
  // that they parallax against the playable city.
  function skylineTexture(base, litRatio) {
    return canvasTexture(1024, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      let x = 0;
      while (x < w) {
        const bw = 28 + rng.next() * 70;
        const bh = 60 + rng.next() * 170;
        g.fillStyle = base;
        g.fillRect(x, h - bh, bw, bh);
        g.fillStyle = 'rgba(255,214,140,0.85)';
        for (let wy = h - bh + 10; wy < h - 12; wy += 13) {
          for (let wx = x + 5; wx < x + bw - 6; wx += 11) {
            if (rng.next() < litRatio) g.fillRect(wx, wy, 5, 7);
          }
        }
        x += bw + rng.next() * 14;
      }
    });
  }
  const strips = [
    { pos: [0, 0, -235], rotY: 0, col: '#2c3560', lit: 0.5, w: 620 },
    { pos: [0, 0, -300], rotY: 0, col: '#232a4e', lit: 0.35, w: 760 },
    { pos: [-245, 0, 0], rotY: Math.PI / 2, col: '#2c3560', lit: 0.45, w: 560 },
    { pos: [245, 0, 0], rotY: -Math.PI / 2, col: '#2c3560', lit: 0.45, w: 560 },
    { pos: [0, 0, 330], rotY: Math.PI, col: '#3a3a6e', lit: 0.3, w: 700 },
  ];
  for (const s of strips) {
    const mat = new THREE.MeshBasicMaterial({
      map: skylineTexture(s.col, s.lit), transparent: true, side: THREE.DoubleSide, fog: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.w * 0.25), mat);
    plane.position.set(s.pos[0], s.w * 0.125 - 4, s.pos[2]);
    plane.rotation.y = s.rotY;
    scene.add(plane);
  }
  return clouds;
}

// ------------------------------------------------------- the ground sheet
// One 2048px canvas paints the whole city plan: pavement, asphalt with
// sheen streaks, lane dashes, crosswalks, kerbs, the beach and boardwalk.
function groundTexture(rng) {
  const SIZE = 2048;
  const WORLD = 560; // metres covered, centred on 0,0 (includes sea margin)
  const px = (v) => ((v + WORLD / 2) / WORLD) * SIZE;
  const pw = (v) => (v / WORLD) * SIZE;
  return canvasTexture(SIZE, SIZE, (g) => {
    // Base: warm pavement.
    g.fillStyle = '#8d8578';
    g.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 9000; i += 1) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
      g.fillRect(rng.next() * SIZE, rng.next() * SIZE, 3, 3);
    }
    // City blocks get slightly varied slabs.
    const edges = [-128, -106, -94, -56, -44, -6, 6, 44, 56, 94, 106, 128];
    for (let i = 0; i < edges.length - 1; i += 2) {
      for (let j = 0; j < edges.length - 1; j += 2) {
        const tone = 118 + Math.floor(rng.range(-14, 14));
        g.fillStyle = `rgb(${tone + 22},${tone + 8},${tone - 12})`;
        g.fillRect(px(edges[i]), px(edges[j]), pw(edges[i + 1] - edges[i]), pw(edges[j + 1] - edges[j]));
      }
    }
    // Asphalt streets.
    const drawRoad = (vertical, at) => {
      g.fillStyle = '#33333c';
      if (vertical) g.fillRect(px(at - ROAD_HALF), 0, pw(ROAD_HALF * 2), SIZE);
      else g.fillRect(0, px(at - ROAD_HALF), SIZE, pw(ROAD_HALF * 2));
      // Specular sheen streaks down the middle of each lane.
      g.fillStyle = 'rgba(255,220,170,0.07)';
      for (const off of [-3, 3]) {
        if (vertical) g.fillRect(px(at + off - 1.1), 0, pw(2.2), SIZE);
        else g.fillRect(0, px(at + off - 1.1), SIZE, pw(2.2));
      }
      // Kerb lines.
      g.fillStyle = '#c9c2b2';
      for (const off of [-ROAD_HALF - 0.5, ROAD_HALF + 0.5]) {
        if (vertical) g.fillRect(px(at + off), 0, pw(1), SIZE);
        else g.fillRect(0, px(at + off), SIZE, pw(1));
      }
      // Dashed centre line.
      g.fillStyle = '#ffd76a';
      const dash = pw(4), gap = pw(4), total = dash + gap;
      for (let d = 0; d < SIZE; d += total) {
        if (vertical) g.fillRect(px(at - 0.22), d, pw(0.44), dash);
        else g.fillRect(d, px(at - 0.22), dash, pw(0.44));
      }
    };
    for (const x of ROAD_X) drawRoad(true, x);
    for (const z of ROAD_Z) drawRoad(false, z);
    // Crosswalks at every intersection.
    g.fillStyle = 'rgba(240,240,235,0.85)';
    for (const x of ROAD_X) {
      for (const z of ROAD_Z) {
        for (let s = -5; s <= 5; s += 2) {
          g.fillRect(px(x + s - 0.7), px(z - ROAD_HALF - 2.6), pw(1.4), pw(2));
          g.fillRect(px(x + s - 0.7), px(z + ROAD_HALF + 0.6), pw(1.4), pw(2));
          g.fillRect(px(x - ROAD_HALF - 2.6), px(z + s - 0.7), pw(2), pw(1.4));
          g.fillRect(px(x + ROAD_HALF + 0.6), px(z + s - 0.7), pw(2), pw(1.4));
        }
        // Intersection box stays clean asphalt.
        g.fillStyle = '#33333c';
        g.fillRect(px(x - ROAD_HALF), px(z - ROAD_HALF), pw(ROAD_HALF * 2), pw(ROAD_HALF * 2));
        g.fillStyle = 'rgba(240,240,235,0.85)';
      }
    }
    // Beach: sand, then a boardwalk strip of planks.
    g.fillStyle = '#ecd29a';
    g.fillRect(0, px(BEACH_Z), SIZE, px(WATER_Z) - px(BEACH_Z));
    for (let i = 0; i < 2600; i += 1) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(160,120,60,0.12)' : 'rgba(255,255,255,0.12)';
      g.fillRect(rng.next() * SIZE, px(BEACH_Z) + rng.next() * (px(WATER_Z) - px(BEACH_Z)), 3, 3);
    }
    g.fillStyle = '#a4713e';
    g.fillRect(0, px(BEACH_Z), SIZE, pw(5));
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (let x = 0; x < SIZE; x += pw(2.4)) g.fillRect(x, px(BEACH_Z), 2, pw(5));
    // Sea floor under the water plane (the plane itself is translucent).
    g.fillStyle = '#1d6f8e';
    g.fillRect(0, px(WATER_Z), SIZE, SIZE - px(WATER_Z));
  });
}

// ---------------------------------------------------------------- buildings
const FACADE_BASES = ['#e8b4a0', '#a8d8d8', '#f2e2c4', '#e89bb4', '#b4c8e8', '#f0c890', '#c4e0b4', '#d8a8e0', '#f5f0e6', '#98c8b8'];
const AWNING_COLORS = ['#ff5964', '#35c4e8', '#ffc53d', '#7be495', '#ff8c42', '#e86ec7'];

function facadeTexture(rng, base, storeName) {
  return canvasTexture(256, 512, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // Vertical shading so the face is never flat.
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.16)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    grad.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // Cornice.
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(0, 0, w, 10);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(0, 10, w, 4);
    // Window grid — many lit warm at golden hour.
    const cols = 5, rows = 9;
    const ww = w / cols, wh = (h - 130) / rows;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = c * ww + ww * 0.24, y = 26 + r * wh + wh * 0.2, iw = ww * 0.52, ih = wh * 0.58;
        const lit = rng.chance(0.55);
        g.fillStyle = lit ? (rng.chance(0.7) ? '#ffd98c' : '#bfe8ff') : '#2c3550';
        g.fillRect(x, y, iw, ih);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(x, y, iw, 3);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(x, y + ih - 3, iw, 3);
      }
    }
    // Ground floor: storefront glass, awning and the shop's name.
    const gy = h - 104;
    g.fillStyle = '#20263c';
    g.fillRect(0, gy, w, 104);
    g.fillStyle = '#9fdcec';
    for (let c = 0; c < 3; c += 1) g.fillRect(14 + c * 82, gy + 34, 66, 56);
    g.fillStyle = 'rgba(255,255,255,0.4)';
    for (let c = 0; c < 3; c += 1) g.fillRect(14 + c * 82, gy + 34, 66, 10);
    const awn = rng.pick(AWNING_COLORS);
    g.fillStyle = awn;
    g.fillRect(0, gy + 8, w, 22);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let x = 0; x < w; x += 32) g.fillRect(x, gy + 8, 16, 22);
    g.fillStyle = '#10131f';
    g.fillRect(0, gy - 26, w, 26);
    g.fillStyle = rng.chance(0.5) ? '#6ee7ff' : '#ff9ad5';
    g.font = 'bold 17px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(storeName, w / 2, gy - 7, w - 12);
  });
}

function billboardTexture(rng, text, fg, bg) {
  return canvasTexture(512, 192, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg;
    g.lineWidth = 8;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = fg;
    g.font = '900 64px system-ui, sans-serif';
    g.textAlign = 'center';
    g.shadowColor = fg;
    g.shadowBlur = 26;
    g.fillText(text, w / 2, h / 2 + 8, w - 50);
    g.font = '700 25px system-ui, sans-serif';
    g.shadowBlur = 10;
    g.fillText('★ PALMERA BAY ★', w / 2, h / 2 + 58);
  });
}

const BILLBOARDS = [
  ['HOTEL SOL', '#ffd76a', '#3a1650'], ['CLUB AZURE', '#6ee7ff', '#101c3f'],
  ['LUCKY PALM', '#7dff9a', '#12351c'], ['DINER LUA', '#ff9ad5', '#40122e'],
  ['SURF SHACK', '#ffb347', '#40260d'], ['BAY RADIO 98', '#c9a8ff', '#241040'],
];

function buildCity(scene, rng, colliders) {
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a4a42 });
  const blockEdges = [[-94, -56], [-44, -6], [6, 44], [56, 94]];
  const facades = [];
  for (let i = 0; i < 10; i += 1) {
    facades.push(new THREE.MeshLambertMaterial({ map: facadeTexture(rng, rng.pick(FACADE_BASES), rng.pick(STORE_NAMES)) }));
  }
  const boxGeoCache = new Map();
  function boxGeo(w, h, d) {
    const key = `${w}|${h}|${d}`;
    if (!boxGeoCache.has(key)) boxGeoCache.set(key, new THREE.BoxGeometry(w, h, d));
    return boxGeoCache.get(key);
  }
  let billboardIdx = 0;
  const neonSigns = [];
  const acTransforms = [];

  for (const [bx0, bx1] of blockEdges) {
    for (const [bz0, bz1] of blockEdges) {
      const bw = bx1 - bx0, bd = bz1 - bz0;
      const layout = rng.next();
      const lots = layout < 0.45
        ? [{ x: (bx0 + bx1) / 2, z: (bz0 + bz1) / 2, w: bw - 6, d: bd - 6 }]
        : layout < 0.8
          ? [
            { x: bx0 + bw * 0.27, z: (bz0 + bz1) / 2, w: bw * 0.44, d: bd - 6 },
            { x: bx0 + bw * 0.75, z: (bz0 + bz1) / 2, w: bw * 0.42, d: bd - 6 },
          ]
          : [
            { x: (bx0 + bx1) / 2, z: bz0 + bd * 0.27, w: bw - 6, d: bd * 0.44 },
            { x: (bx0 + bx1) / 2, z: bz0 + bd * 0.75, w: bw - 6, d: bd * 0.42 },
          ];
      for (const lot of lots) {
        const height = rng.range(10, 34) * (rng.chance(0.18) ? 1.5 : 1);
        const facade = rng.pick(facades);
        const mesh = new THREE.Mesh(boxGeo(Math.round(lot.w), Math.round(height), Math.round(lot.d)), facade);
        mesh.position.set(lot.x, height / 2, lot.z);
        scene.add(mesh);
        // A thin dark roof slab caps the facade texture.
        const slab = new THREE.Mesh(boxGeo(Math.round(lot.w) + 0.4, 0.5, Math.round(lot.d) + 0.4), roofMat);
        slab.position.set(lot.x, height + 0.2, lot.z);
        scene.add(slab);
        colliders.push({ x: lot.x, z: lot.z, hw: lot.w / 2, hd: lot.d / 2 });
        // Rooftop props: AC boxes (instanced later) and the odd water tower.
        if (rng.chance(0.75)) {
          acTransforms.push({
            x: lot.x + rng.range(-lot.w / 4, lot.w / 4), y: height + 1.15,
            z: lot.z + rng.range(-lot.d / 4, lot.d / 4), ry: rng.next() * Math.PI,
          });
        }
        if (height > 24 && rng.chance(0.4)) {
          const tank = new THREE.Mesh(
            new THREE.CylinderGeometry(1.7, 1.9, 3.6, 10),
            new THREE.MeshLambertMaterial({ color: 0x8a5a34 }),
          );
          tank.position.set(lot.x + lot.w / 4, height + 2.6, lot.z - lot.d / 4);
          scene.add(tank);
          const cone = new THREE.Mesh(
            new THREE.ConeGeometry(2.1, 1.4, 10),
            new THREE.MeshLambertMaterial({ color: 0x6e4525 }),
          );
          cone.position.set(tank.position.x, height + 5.1, tank.position.z);
          scene.add(cone);
        }
        // Tall buildings on street corners carry billboards.
        if (height > 26 && billboardIdx < BILLBOARDS.length && rng.chance(0.55)) {
          const [text, fg, bg] = BILLBOARDS[billboardIdx];
          billboardIdx += 1;
          const bb = new THREE.Mesh(
            new THREE.PlaneGeometry(13, 4.9),
            new THREE.MeshBasicMaterial({ map: billboardTexture(rng, text, fg, bg), side: THREE.DoubleSide }),
          );
          bb.position.set(lot.x, height + 3.4, lot.z);
          bb.rotation.y = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
          scene.add(bb);
          const post = new THREE.Mesh(boxGeo(0.5, 3, 0.5), roofMat);
          post.position.set(lot.x, height + 0.9, lot.z);
          scene.add(post);
        }
      }
    }
  }

  // Neon signs on the entertainment strip (the z = 50 street): emissive
  // planes with additive glow sprites, in pink and cyan.
  const neonNames = ['AZURE', 'PALMS', 'LUA', 'SOL', 'ONDA', 'BRISA'];
  ROAD_X.forEach((x, i) => {
    const name = neonNames[i % neonNames.length];
    const pink = i % 2 === 0;
    const tex = canvasTexture(256, 96, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.font = '900 56px system-ui, sans-serif';
      g.textAlign = 'center';
      g.shadowColor = pink ? '#ff2e9a' : '#00d5ff';
      g.shadowBlur = 22;
      g.fillStyle = pink ? '#ff9ad5' : '#aef4ff';
      g.fillText(name, w / 2, h / 2 + 20);
    });
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 3.4),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }),
    );
    sign.position.set(x + 9.5, 7.5, 43.2);
    scene.add(sign);
    neonSigns.push(sign);
    const glow = makeGlowSprite(
      pink ? 'rgba(255,80,180,0.85)' : 'rgba(80,220,255,0.85)',
      pink ? 'rgba(255,40,160,0.35)' : 'rgba(40,180,255,0.35)', 13,
    );
    glow.position.set(x + 9.5, 7.5, 43.6);
    scene.add(glow);
  });

  // All rooftop AC boxes as one instanced mesh.
  if (acTransforms.length) {
    const acMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(3, 1.6, 2.4),
      new THREE.MeshLambertMaterial({ color: 0x9aa2ae }),
      acTransforms.length,
    );
    const dummy = new THREE.Object3D();
    acTransforms.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(0, t.ry, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      acMesh.setMatrixAt(i, dummy.matrix);
    });
    scene.add(acMesh);
  }
  return neonSigns;
}

// ------------------------------------------------------------------- palms
// One InstancedMesh for every curved trunk and one for every frond fan, so
// a hundred palms cost two draw calls. Fronds sway by re-composing their
// instance matrices each frame (cheap at this count).
function buildPalms(scene, rng) {
  const spots = [];
  for (const x of ROAD_X) {
    for (let z = CITY_MIN + 6; z <= 110; z += 17) {
      if (ROAD_Z.some((rz) => Math.abs(z - rz) < 10)) continue;
      spots.push({ x: x - 8.4, z: z + rng.range(-2, 2), s: rng.range(0.85, 1.3) });
      spots.push({ x: x + 8.4, z: z + 8 + rng.range(-2, 2), s: rng.range(0.85, 1.3) });
    }
  }
  for (const z of ROAD_Z) {
    for (let x = CITY_MIN + 6; x <= CITY_MAX - 6; x += 17) {
      if (ROAD_X.some((rx) => Math.abs(x - rx) < 10)) continue;
      spots.push({ x: x + rng.range(-2, 2), z: z - 8.4, s: rng.range(0.85, 1.3) });
      spots.push({ x: x + 8 + rng.range(-2, 2), z: z + 8.4, s: rng.range(0.85, 1.3) });
    }
  }
  for (let x = CITY_MIN + 4; x <= CITY_MAX - 4; x += 13) {
    spots.push({ x: x + rng.range(-2, 2), z: 121 + rng.range(0, 5), s: rng.range(0.9, 1.4) });
  }
  const count = spots.length;

  // Bent trunk: a tapered cylinder whose rings lean further as they rise.
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.24, 4.4, 6, 5);
  trunkGeo.translate(0, 2.2, 0);
  const posAttr = trunkGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i += 1) {
    const y = posAttr.getY(i);
    posAttr.setX(i, posAttr.getX(i) + (y * y) * 0.055);
  }
  trunkGeo.computeVertexNormals();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6238 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  // Ring bands on the trunk via a second material trick is overkill; the
  // bend plus fronds sell the silhouette.

  const frondTex = canvasTexture(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.translate(128, 128);
    for (let i = 0; i < 9; i += 1) {
      const ang = (i / 9) * Math.PI * 2;
      g.save();
      g.rotate(ang);
      g.fillStyle = '#2f9e4f';
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(52, -13, 118, 16);
      g.quadraticCurveTo(52, 5, 0, 4);
      g.fill();
      g.fillStyle = '#3cb85e';
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(50, -7, 112, 10);
      g.quadraticCurveTo(50, 2, 0, 2);
      g.fill();
      g.restore();
    }
    g.fillStyle = '#6e4525';
    g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill();
  });
  const frondGeo = new THREE.PlaneGeometry(6.4, 6.4);
  frondGeo.rotateX(-Math.PI / 2);
  frondGeo.translate(0, 0.1, 0);
  const frondMat = new THREE.MeshLambertMaterial({
    map: frondTex, alphaTest: 0.35, side: THREE.DoubleSide,
  });
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, count);

  const dummy = new THREE.Object3D();
  const frondData = [];
  spots.forEach((s, i) => {
    const lean = 0.055 * 4.4 * 4.4; // top-of-trunk x offset from the bend
    const rotY = rng.next() * Math.PI * 2;
    dummy.position.set(s.x, 0, s.z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.setScalar(s.s);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    frondData.push({
      x: s.x + Math.cos(rotY) * lean * s.s, y: 4.35 * s.s,
      z: s.z - Math.sin(rotY) * lean * s.s, s: s.s, phase: rng.next() * Math.PI * 2,
    });
  });
  scene.add(trunks);
  scene.add(fronds);
  return { fronds, frondData, dummy };
}

// ------------------------------------------------------- lights and props
function buildProps(scene, rng, colliders) {
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6);
  poleGeo.translate(0, 2.7, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c414c });
  const lampSpots = [];
  for (const x of ROAD_X) for (const z of ROAD_Z) lampSpots.push([x + 7.6, z + 7.6], [x - 7.6, z - 7.6]);
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const bulbs = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0 }),
    lampSpots.length,
  );
  const dummy = new THREE.Object3D();
  lampSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 5.45, z);
    dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
    // Glow sprites only on the central lamps (they are the expensive part).
    if (i % 3 === 0) {
      const glow = makeGlowSprite('rgba(255,230,170,0.95)', 'rgba(255,190,90,0.4)', 4.6);
      glow.position.set(x, 5.5, z);
      scene.add(glow);
    }
  });
  scene.add(poles);
  scene.add(bulbs);

  // Crates, dumpsters and hydrants on the sidewalks — one instanced mesh
  // per kind, with colliders only for the bulky dumpsters.
  const propKinds = [
    { geo: new THREE.BoxGeometry(1.1, 1.1, 1.1), mat: new THREE.MeshLambertMaterial({ color: 0xb07a3e }), y: 0.55, list: [] },
    { geo: new THREE.BoxGeometry(2.2, 1.3, 1.2), mat: new THREE.MeshLambertMaterial({ color: 0x3f7d5a }), y: 0.65, list: [] },
    { geo: new THREE.CylinderGeometry(0.22, 0.26, 0.8, 8), mat: new THREE.MeshLambertMaterial({ color: 0xd84040 }), y: 0.4, list: [] },
  ];
  for (let i = 0; i < 46; i += 1) {
    const onX = rng.chance(0.5);
    const road = rng.pick(onX ? ROAD_X : ROAD_Z);
    const along = rng.range(CITY_MIN + 8, 108);
    const off = rng.pick([-1, 1]) * rng.range(7.6, 9.2);
    const x = onX ? road + off : along;
    const z = onX ? along : road + off;
    // Keep the player's spawn spot and its first car clear of props.
    if (Math.hypot(x - 9, z - 50) < 8 || Math.hypot(x - 16, z - 50) < 5) continue;
    const kind = rng.next();
    const idx = kind < 0.45 ? 0 : kind < 0.75 ? 1 : 2;
    propKinds[idx].list.push({ x, z, ry: rng.next() * Math.PI });
    if (idx === 1) colliders.push({ x, z, hw: 1.1, hd: 0.6 });
  }
  for (const kind of propKinds) {
    if (!kind.list.length) continue;
    const inst = new THREE.InstancedMesh(kind.geo, kind.mat, kind.list.length);
    kind.list.forEach((t, i) => {
      dummy.position.set(t.x, kind.y, t.z);
      dummy.rotation.set(0, t.ry, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    scene.add(inst);
  }

  // Beach umbrellas: pole + bright cone merged into one mesh each.
  const umbColors = [0xff5964, 0xffc53d, 0x35c4e8, 0xff8c42, 0xe86ec7];
  const umbMaterial = coloredMaterial();
  for (let i = 0; i < 14; i += 1) {
    const x = -112 + i * 17 + rng.range(-3, 3);
    const z = 126 + (i % 2) * 7 + rng.range(-1.5, 1.5);
    const umb = new THREE.Mesh(mergeColored([
      { geo: new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), y: 1.1, color: 0x3c414c },
      { geo: new THREE.ConeGeometry(1.9, 0.7, 10), y: 2.35, color: rng.pick(umbColors) },
    ]), umbMaterial);
    umb.position.set(x, 0, z);
    scene.add(umb);
  }
}

// ------------------------------------------------------------------- world
export function createWorld(scene, rng) {
  scene.fog = new THREE.Fog(0xf0b98a, 130, 520);
  const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x8a6a4a, 0.95);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xffd9a0, 1.6);
  sunLight.position.set(-80, 90, 140);
  scene.add(sunLight);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
  fill.position.set(60, 80, -100);
  scene.add(fill);

  const clouds = buildSky(scene, rng);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshLambertMaterial({ map: groundTexture(rng) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);

  // Animated water: a translucent plane whose foam-streak texture scrolls.
  const waterTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#2a8ab0';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i += 1) {
      g.strokeStyle = `rgba(255,255,255,${0.08 + rng.next() * 0.16})`;
      g.lineWidth = 1 + rng.next() * 2;
      const y = rng.next() * h;
      g.beginPath();
      g.moveTo(rng.next() * w * 0.5, y);
      g.lineTo(w * 0.4 + rng.next() * w * 0.6, y + rng.range(-3, 3));
      g.stroke();
    }
  }, { repeat: true });
  waterTex.repeat.set(10, 4);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 150),
    new THREE.MeshLambertMaterial({ map: waterTex, transparent: true, opacity: 0.88 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.06, WATER_Z + 70);
  scene.add(water);
  // Foam edge where sea meets sand.
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 2.6),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 0.09, WATER_Z + 0.6);
  scene.add(foam);

  const colliders = [];
  const neonSigns = buildCity(scene, rng, colliders);
  const palms = buildPalms(scene, rng);
  buildProps(scene, rng, colliders);

  // Landmark pads: hospital (NW), police station (NE), hideout, marina.
  const padMat = new THREE.MeshLambertMaterial({ color: 0xd8d2c4 });
  for (const [x, z] of [[-114, -114], [114, -114], [-108, 92], [92, 126]]) {
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(22, 18), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(x, 0.02, z);
    scene.add(pad);
  }

  function isRoad(x, z) {
    if (z > BEACH_Z) return false;
    return ROAD_X.some((rx) => Math.abs(x - rx) <= ROAD_HALF + 1.5)
      || ROAD_Z.some((rz) => Math.abs(z - rz) <= ROAD_HALF + 1.5);
  }

  // Push a circle (x, z, radius) out of every building AABB; returns true
  // when a push happened (i.e. something was hit).
  function collideCircle(pos, radius) {
    let hit = false;
    for (const c of colliders) {
      const dx = pos.x - clamp(pos.x, c.x - c.hw, c.x + c.hw);
      const dz = pos.z - clamp(pos.z, c.z - c.hd, c.z + c.hd);
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (radius - d);
        pos.z += (dz / d) * (radius - d);
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const left = pos.x - (c.x - c.hw), right = (c.x + c.hw) - pos.x;
        const top = pos.z - (c.z - c.hd), bottom = (c.z + c.hd) - pos.z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = c.x - c.hw - radius;
        else if (m === right) pos.x = c.x + c.hw + radius;
        else if (m === top) pos.z = c.z - c.hd - radius;
        else pos.z = c.z + c.hd + radius;
      }
    }
    pos.x = clamp(pos.x, CITY_MIN - 14, CITY_MAX + 14);
    pos.z = clamp(pos.z, CITY_MIN - 14, WATER_Z + 26);
    return hit;
  }

  let neonFlicker = 0;
  function update(dt, time) {
    waterTex.offset.y = (time * 0.018) % 1;
    waterTex.offset.x = Math.sin(time * 0.11) * 0.02;
    foam.material.opacity = 0.35 + Math.sin(time * 1.4) * 0.15;
    foam.position.z = WATER_Z + 0.6 + Math.sin(time * 0.7) * 0.5;
    for (const cloud of clouds) {
      cloud.position.x += dt * 1.1;
      if (cloud.position.x > 460) cloud.position.x = -460;
    }
    // Palm fronds sway in the sea breeze.
    const { fronds, frondData, dummy } = palms;
    for (let i = 0; i < frondData.length; i += 1) {
      const f = frondData[i];
      dummy.position.set(f.x, f.y, f.z);
      dummy.rotation.set(Math.sin(time * 1.3 + f.phase) * 0.045, f.phase, Math.cos(time * 1.1 + f.phase) * 0.05);
      dummy.scale.setScalar(f.s);
      dummy.updateMatrix();
      fronds.setMatrixAt(i, dummy.matrix);
    }
    fronds.instanceMatrix.needsUpdate = true;
    // Occasional neon flicker on one sign.
    neonFlicker -= dt;
    if (neonFlicker <= 0) {
      neonFlicker = rng.range(2, 6);
      const sign = rng.pick(neonSigns);
      if (sign) {
        sign.material.opacity = 0.55;
        setTimeout(() => { sign.material.opacity = 1; }, 90);
      }
    }
  }

  return { colliders, isRoad, collideCircle, update };
}
