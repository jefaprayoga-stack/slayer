// Tiny WebAudio synth: no audio files, every sound generated live.
// Background music is a small step sequencer over chord progressions —
// also fully procedural, no network, no samples.
let ctx = null;
let muted = false;
let musicGain = null;
let musicTimer = null;
let musicTrack = null; // 'menu' | 'battle' | null
let musicStep = 0;
let nextStepTime = 0;

export function setMuted(m) {
  muted = m;
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.05);
}
export function isMuted() { return muted; }
export function musicTrackName() { return musicTrack; }

function ac() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, dur, type = 'sine', vol = 0.12, when = 0, slide = 0) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

// ---- Background music ------------------------------------------------------
// Two looped tracks. Menu: slow calm/epic pads (Am–F–C–G). Battle: a
// driving minor pulse with an arpeggio. Music has its own gain node kept
// well under the SFX level so it never covers a kill or level-up sting.
const TRACKS = {
  menu: {
    bpm: 72, stepsPerBar: 8,
    chords: [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66], [196, 246.94, 293.66]],
    bass: [55, 43.65, 65.41, 49],
    padVol: 0.05, bassVol: 0.06,
  },
  battle: {
    bpm: 116, stepsPerBar: 8,
    chords: [[220, 261.63, 329.63], [220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]],
    bass: [55, 55, 43.65, 49],
    padVol: 0.03, bassVol: 0.07,
  },
};

function musicTone(freq, t0, dur, type, vol) {
  const c = ctx;
  if (!c || !musicGain) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g);
  g.connect(musicGain);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function scheduleStep() {
  const c = ctx;
  if (!c || !musicTrack) return;
  const tr = TRACKS[musicTrack];
  if (!tr) return;
  const stepDur = 60 / tr.bpm / 2; // eighth notes
  while (nextStepTime < c.currentTime + 0.25) {
    const bar = Math.floor(musicStep / tr.stepsPerBar) % tr.chords.length;
    const sInBar = musicStep % tr.stepsPerBar;
    const t = Math.max(nextStepTime, c.currentTime);
    if (sInBar === 0) {
      for (const f of tr.chords[bar]) musicTone(f, t, stepDur * 7, 'triangle', tr.padVol);
    }
    if (sInBar % 2 === 0) musicTone(tr.bass[bar], t, stepDur * 1.8, 'sine', tr.bassVol);
    if (musicTrack === 'battle' && sInBar % 2 === 1) {
      const arp = tr.chords[bar][(sInBar >> 1) % 3] * 2;
      musicTone(arp, t, stepDur * 0.9, 'triangle', 0.035);
    }
    if (musicTrack === 'menu' && sInBar === 4) {
      musicTone(tr.chords[bar][1] * 2, t, stepDur * 2, 'sine', 0.03);
    }
    nextStepTime += stepDur;
    musicStep++;
  }
}

// Switch track (idempotent). Called every frame from the main loop with
// the track for the current screen; starts after the first user gesture
// because the AudioContext stays suspended until then.
export function setMusic(track) {
  if (track === musicTrack) return;
  musicTrack = track;
  if (!track) { stopMusic(); return; }
  const c = ac();
  if (!c) return;
  if (!musicGain) {
    musicGain = c.createGain();
    musicGain.gain.value = muted ? 0 : 0.5;
    musicGain.connect(c.destination);
  }
  musicStep = 0;
  nextStepTime = c.currentTime + 0.1;
  if (!musicTimer) musicTimer = setInterval(scheduleStep, 100);
}

export function stopMusic() {
  musicTrack = null;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

export const sfx = {
  click() { tone(660, 0.07, 'triangle', 0.08); },
  lock() { tone(520, 0.09, 'triangle', 0.12); tone(780, 0.12, 'triangle', 0.12, 0.08); },
  ban() { tone(220, 0.15, 'sawtooth', 0.08, 0, -80); },
  pick() { tone(440, 0.08, 'triangle', 0.1); tone(660, 0.1, 'triangle', 0.1, 0.07); },
  levelUp() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'triangle', 0.1, i * 0.07)); },
  kill() { tone(392, 0.12, 'square', 0.07); tone(523, 0.16, 'square', 0.07, 0.09); },
  death() { tone(330, 0.25, 'sawtooth', 0.08, 0, -160); },
  respawn() { [392, 523, 659].forEach((f, i) => tone(f, 0.12, 'triangle', 0.09, i * 0.06)); },
  gold() { tone(1319, 0.06, 'sine', 0.07); tone(1568, 0.1, 'sine', 0.07, 0.05); },
  turret() { tone(180, 0.4, 'sawtooth', 0.12, 0, -100); tone(90, 0.4, 'sine', 0.14, 0.05); },
  victory() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.11, i * 0.11)); },
  defeat() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, 'triangle', 0.1, i * 0.13)); },
  buy() { tone(880, 0.08, 'triangle', 0.1); tone(1175, 0.12, 'triangle', 0.1, 0.06); },
  skill() { tone(740, 0.09, 'sine', 0.08, 0, 220); },
  muteToggle() { tone(440, 0.06, 'triangle', 0.07); },
  // Kill-banner sting: a rising arpeggio that grows with the tier.
  announce(tier = 0) {
    const seqs = [
      [523, 784],
      [523, 659, 880],
      [440, 554, 659, 880],
      [392, 523, 659, 784, 1047],
    ];
    const notes = seqs[Math.min(3, tier)] || seqs[0];
    notes.forEach((f, i) => tone(f, 0.18, 'triangle', 0.11, i * 0.08));
    if (tier >= 2) tone(130, 0.4, 'sawtooth', 0.08, 0, -40);
  },
};
