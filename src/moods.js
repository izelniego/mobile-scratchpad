// ORA — moods. A mood is not a scene: it is a set of targets for the one
// universe. Switching moods crossfades every force, colour and sound.
import * as THREE from 'three/webgpu';

export const MOODS = [
  {
    name: 'NEBULA',
    tag: 'ink of the void',
    accent: '#a88bff',
    nums: {
      curl: 2.6, curlScale: 0.16, flowDrift: 0.16, damp: 1.15, maxSpd: 7,
      attract: 26, swirl: 15, stroke: 22,
      wave: 0, waveAmp: 1.3, waveFreq: 0.6, buoy: 0, align: 0, swarmSpd: 4.5,
      size: 0.080, alpha: 0.42, glow: 1.05, speedColor: 0.22, breath: 0.4,
    },
    cols: {
      colA: '#341a7d', colB: '#22c8ff', colC: '#ff5ad1',
      bgA: '#0d0724', bgB: '#010103',
    },
    audio: { root: 57, wave: 'triangle', cutoff: 2400 }, // A3 pentatonic
  },
  {
    name: 'TIDE',
    tag: 'luminous plankton',
    accent: '#3fe8cf',
    nums: {
      curl: 0.8, curlScale: 0.22, flowDrift: 0.08, damp: 2.0, maxSpd: 6,
      attract: 20, swirl: 6, stroke: 26,
      wave: 4.6, waveAmp: 1.5, waveFreq: 0.55, buoy: 0, align: 0, swarmSpd: 4.5,
      size: 0.072, alpha: 0.46, glow: 1.0, speedColor: 0.22, breath: 0.18,
    },
    cols: {
      colA: '#08306e', colB: '#2ef0d4', colC: '#baf7ec',
      bgA: '#03141f', bgB: '#000204',
    },
    audio: { root: 50, wave: 'sine', cutoff: 1600 }, // D3
  },
  {
    name: 'EMBER',
    tag: 'a pocket of fire',
    accent: '#ff9a4d',
    nums: {
      curl: 1.9, curlScale: 0.3, flowDrift: 0.5, damp: 1.0, maxSpd: 8,
      attract: 18, swirl: 22, stroke: 26,
      wave: 0, waveAmp: 1.3, waveFreq: 0.6, buoy: 3.4, align: 0, swarmSpd: 4.5,
      size: 0.066, alpha: 0.5, glow: 1.15, speedColor: 0.21, breath: 0.2,
    },
    cols: {
      colA: '#54100a', colB: '#ff7a1f', colC: '#ffd98f',
      bgA: '#170702', bgB: '#020101',
    },
    audio: { root: 48, wave: 'sawtooth', cutoff: 900 }, // C3
  },
  {
    name: 'SWARM',
    tag: 'ten thousand wings',
    accent: '#8fd8ff',
    nums: {
      curl: 0.9, curlScale: 0.2, flowDrift: 0.1, damp: 0.7, maxSpd: 9,
      attract: 30, swirl: 4, stroke: 18,
      wave: 0, waveAmp: 1.3, waveFreq: 0.6, buoy: 0, align: 1.0, swarmSpd: 4.8,
      size: 0.070, alpha: 0.42, glow: 1.0, speedColor: 0.19, breath: 0.15,
    },
    cols: {
      colA: '#0d2a4a', colB: '#66c8f5', colC: '#bfeaff',
      bgA: '#04101c', bgB: '#000103',
    },
    audio: { root: 62, wave: 'square', cutoff: 1200 }, // D4
  },
];

export class MoodMixer {
  constructor(U, onMood) {
    this.U = U;
    this.onMood = onMood;
    this.index = 0;
    this._tmp = new THREE.Color();
    this._targets = null;
    this.set(0, true);
  }

  get mood() { return MOODS[this.index]; }

  set(i, instant = false) {
    this.index = ((i % MOODS.length) + MOODS.length) % MOODS.length;
    const m = MOODS[this.index];
    this._targets = m;
    if (instant) {
      for (const [k, v] of Object.entries(m.nums)) if (this.U[k]) this.U[k].value = v;
      for (const [k, v] of Object.entries(m.cols)) if (this.U[k]) this.U[k].value.set(v);
    }
    this.onMood?.(m, this.index, instant);
  }

  next(dir = 1) { this.set(this.index + dir); }

  update(dt) {
    const m = this._targets;
    if (!m) return;
    const k = Math.min(1, dt * 2.6); // ~1s crossfade
    for (const [key, v] of Object.entries(m.nums)) {
      const u = this.U[key];
      if (u) u.value += (v - u.value) * k;
    }
    for (const [key, v] of Object.entries(m.cols)) {
      const u = this.U[key];
      if (u) u.value.lerp(this._tmp.set(v), k);
    }
  }
}
