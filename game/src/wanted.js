// The wanted system: 0–5 stars, crime values, witness rules and heat decay.
// A crime only counts when someone could have seen it — a pedestrian or a
// police unit within sight range. Out of police sight, stars decay one at
// a time roughly every twelve seconds.
import { dist2d } from './random.js';

export const SIGHT_RANGE = 26;
export const DECAY_SECONDS = 12;

export const CRIMES = {
  theft: { stars: 1, label: 'Vehicle theft' },
  hitPedestrian: { stars: 2, label: 'Hit and run' },
  hitPolice: { stars: 2, label: 'Ramming the law' },
  punch: { stars: 1, label: 'Assault' },
  missionHeat: { stars: 0, label: 'Heat' }, // direct star sets, no witness needed
};

export function createWanted() {
  const wanted = {
    stars: 0,
    quietTimer: 0,     // seconds since a police unit last saw the player
    lastCrime: '',
  };

  function witnessed(x, z, witnesses) {
    for (const w of witnesses) {
      if (dist2d(x, z, w.x, w.z) < SIGHT_RANGE) return true;
    }
    return false;
  }

  return {
    get stars() { return wanted.stars; },
    get lastCrime() { return wanted.lastCrime; },
    // Report a crime at a position. Returns true when it raised the level.
    report(kind, x, z, witnesses) {
      const crime = CRIMES[kind];
      if (!crime) return false;
      if (!witnessed(x, z, witnesses)) return false;
      const before = wanted.stars;
      wanted.stars = Math.min(5, wanted.stars + crime.stars);
      wanted.lastCrime = crime.label;
      return wanted.stars > before;
    },
    // Directly set the level (mission scripts, screenshot staging).
    setStars(n) {
      wanted.stars = Math.max(0, Math.min(5, Math.round(n)));
      wanted.quietTimer = 0;
    },
    addStars(n) {
      wanted.stars = Math.max(0, Math.min(5, wanted.stars + n));
      wanted.quietTimer = 0;
    },
    clear() { wanted.stars = 0; wanted.quietTimer = 0; },
    update(dt, seenByPolice) {
      if (wanted.stars <= 0) return;
      if (seenByPolice) {
        wanted.quietTimer = 0;
        return;
      }
      wanted.quietTimer += dt;
      if (wanted.quietTimer >= DECAY_SECONDS) {
        wanted.quietTimer = 0;
        wanted.stars -= 1;
      }
    },
  };
}
