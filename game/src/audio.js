// WebAudio synth only — no audio files. A tiny engine hum whose pitch follows
// speed, a two-tone siren, and short blips for game events, over a low pad
// loop. Everything is guarded: if the context is missing, suspended (as in a
// headless browser) or anything throws, the game simply plays in silence.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let padTimer = 0;
  let ok = false;

  function ensure() {
    if (ok) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      ok = true;
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo, delay = 0) {
    if (!ensure()) return;
    try {
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      gain.gain.setValueAtTime(vol || 0.15, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain); gain.connect(master);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    } catch { /* silent */ }
  }

  function noiseBurst(dur, vol, freq) {
    if (!ensure()) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(); src.buffer = buffer;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = freq || 500;
      const gain = ctx.createGain(); gain.gain.value = vol || 0.2;
      src.connect(filter); filter.connect(gain); gain.connect(master);
      src.start();
    } catch { /* silent */ }
  }

  function startEngine() {
    if (!ensure() || engineOsc) return;
    try {
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 320;
      engineGain = ctx.createGain(); engineGain.gain.value = 0.0;
      engineOsc.connect(filter); filter.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
    } catch { engineOsc = null; }
  }

  function startSiren() {
    if (!ensure() || sirenOsc) return;
    try {
      sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0.0;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start();
    } catch { sirenOsc = null; }
  }

  return {
    unlock() {
      if (!ensure()) return;
      try { if (ctx.state === 'suspended') ctx.resume(); } catch { /* silent */ }
      startEngine(); startSiren();
    },
    // Called every frame with the player's situation; levels stay subtle.
    update(dt, speedRatio, sirenNear, time) {
      if (!ok) return;
      try {
        if (engineOsc && engineGain) {
          const target = speedRatio > 0.02 ? 0.05 + speedRatio * 0.05 : 0.0;
          engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
          engineOsc.frequency.setTargetAtTime(50 + speedRatio * 130, ctx.currentTime, 0.08);
        }
        if (sirenOsc && sirenGain) {
          const target = sirenNear ? 0.028 : 0.0;
          sirenGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
          sirenOsc.frequency.value = (Math.sin(time * 5.2) > 0) ? 880 : 660;
        }
        // A slow warm pad chord drifts underneath everything.
        padTimer -= dt;
        if (padTimer <= 0) {
          padTimer = 7;
          tone(110, 6.5, 'sine', 0.035);
          tone(165, 6.5, 'sine', 0.025, null, 0.05);
          tone(220, 6.5, 'triangle', 0.018, null, 0.1);
        }
      } catch { /* silent */ }
    },
    thud() { noiseBurst(0.16, 0.3, 300); },
    punch() { noiseBurst(0.08, 0.22, 900); tone(140, 0.07, 'square', 0.08, 70); },
    chime() { tone(880, 0.16, 'sine', 0.16); tone(1318, 0.24, 'sine', 0.14, null, 0.09); },
    cash() { tone(1180, 0.1, 'square', 0.09); tone(1560, 0.16, 'square', 0.09, null, 0.07); },
    success() { tone(523, 0.16, 'triangle', 0.16); tone(659, 0.16, 'triangle', 0.16, null, 0.13); tone(784, 0.3, 'triangle', 0.18, null, 0.26); },
    fail() { tone(320, 0.25, 'sawtooth', 0.12, 160); tone(190, 0.4, 'sawtooth', 0.12, 90, 0.2); },
    door() { tone(240, 0.09, 'square', 0.1, 180); },
  };
}
