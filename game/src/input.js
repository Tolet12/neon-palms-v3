// Keyboard and mouse state for the game. Held keys are exposed as a live
// set-like object; one-shot presses (E, F, R, Enter, pause) are queued as
// edge events so a tap between frames is never lost or counted twice.

const EDGE_CODES = {
  KeyE: 'interact', KeyF: 'punch', KeyR: 'retry', Enter: 'confirm',
  KeyP: 'pause', Escape: 'pause',
};

export function createInput(canvas) {
  const held = Object.create(null);
  const edges = [];
  let dragX = 0;        // accumulated mouse-drag orbit, consumed by the camera
  let dragging = false;
  let lastX = 0;

  window.addEventListener('keydown', (ev) => {
    if (ev.code === 'Space' || ev.code.startsWith('Arrow')) ev.preventDefault();
    if (!ev.repeat) {
      held[ev.code] = true;
      const action = EDGE_CODES[ev.code];
      if (action) edges.push(action);
    }
  });
  window.addEventListener('keyup', (ev) => { held[ev.code] = false; });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(held)) held[k] = false;
    dragging = false;
  });

  canvas.addEventListener('pointerdown', (ev) => { dragging = true; lastX = ev.clientX; });
  window.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    dragX += (ev.clientX - lastX) * 0.005;
    lastX = ev.clientX;
  });
  window.addEventListener('pointerup', () => { dragging = false; });

  return {
    down(...codes) { return codes.some((c) => !!held[c]); },
    // Movement axes in -1..1 (x = strafe right, z = forward).
    moveAxis() {
      const x = (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0);
      const z = (this.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.down('KeyS', 'ArrowDown') ? 1 : 0);
      return { x, z };
    },
    takeEdges() { const out = edges.slice(); edges.length = 0; return out; },
    takeDrag() { const d = dragX; dragX = 0; return d; },
    clear() { edges.length = 0; },
  };
}
