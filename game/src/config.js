// World constants for NEON PALMS: city layout, tuning numbers and the job list.
// Everything spatial derives from the road grid below so the world builder,
// the traffic AI and the minimap all agree on where the streets are.

export const ROAD_X = [-100, -50, 0, 50, 100]; // north-south street centre lines
export const ROAD_Z = [-100, -50, 0, 50, 100]; // east-west street centre lines
export const ROAD_HALF = 6;                    // half the asphalt width
export const CITY_MIN = -128;
export const CITY_MAX = 128;
export const BEACH_Z = 116;                    // sand starts here
export const WATER_Z = 142;                    // animated water beyond here

export const SPAWN = { x: 9, z: 50 }; // standing in the z=50 street, by the spawn car
export const HOSPITAL = { x: -114, z: -114 };
export const POLICE_STATION = { x: 114, z: -114 };
export const HIDEOUT = { x: -108, z: 92 };
export const MARINA = { x: 92, z: 126 };

export const WALK_SPEED = 5.2;
export const RUN_SPEED = 8.6;
export const CAR_MAX_SPEED = 27;
export const CAR_ACCEL = 15;
export const TRAFFIC_SPEED = 10.5;

export const SAVE_KEY = 'neonpalms-save-v3';

export const REP_TITLES = ['Rookie Courier', 'Street Runner', 'Known Wheel', 'Bay Fixer', 'King of Palmera Bay'];

// The five story jobs, in order. Points sit on or beside streets so every
// objective is reachable by car and on foot.
export const MISSIONS = [
  {
    id: 'm1', name: 'First Run', pay: 150, time: 95,
    blurb: 'Prove you can drive. Hit every checkpoint across town.',
    kind: 'checkpoints',
    points: [
      { x: 50, z: 0 }, { x: 100, z: -50 }, { x: 50, z: -100 }, { x: -50, z: -50 },
    ],
  },
  {
    id: 'm2', name: 'Hot Package', pay: 300, time: 130,
    blurb: 'Pick up the package. Do not ask what is inside.',
    kind: 'deliver',
    pickup: { x: -100, z: 50 }, drop: { x: 100, z: 100 }, heatOnPickup: 2,
  },
  {
    id: 'm3', name: 'Cash Drops', pay: 400, time: 140,
    blurb: 'Three drops, three corners of the bay. Grab them all.',
    kind: 'collect',
    points: [
      { x: -50, z: 0 }, { x: 50, z: -100 }, { x: 100, z: 50 },
    ],
  },
  {
    id: 'm4', name: 'The Getaway', pay: 500, time: 170,
    blurb: 'Reach the hideout hot, then vanish. Lose every star nearby.',
    kind: 'getaway',
    point: { x: HIDEOUT.x, z: HIDEOUT.z }, heatOnStart: 3,
  },
  {
    id: 'm5', name: 'Harbor Finale', pay: 800, time: 190,
    blurb: 'One hot car, one marina, the whole bay watching. Deliver it.',
    kind: 'deliverCar',
    point: { x: MARINA.x, z: MARINA.z }, heatOnStart: 4,
  },
];

export const STORE_NAMES = [
  'PALMERA HOTEL', 'CLUB AZURE', 'DINER LUA', 'HOTEL SOL', 'LUCKY PALM',
  'SURF SHACK', 'BAY BURGERS', 'NEON MOTEL', 'TIDES CINEMA', 'PALM RADIO',
  'COCO LOCO', 'MARINA MART', 'SUNSET SHOES', 'BAY PHARMACY', 'TACO BRISA',
  'HOTEL ONDA', 'PIER PIZZA', 'VELVET LOUNGE',
];

export const CAR_COLORS = [0xff5964, 0xffc53d, 0x35c4e8, 0x7be495, 0xff8c42, 0xb388ff, 0xf5f0e6, 0x4a6fa5, 0xe86ec7, 0x9be15d];
