// ORA — UI shell: splash, wordmark, mood dots, contextual hints, chips.
// No tutorial screens — hints only whisper about gestures not yet discovered.
const HINTS = [
  { id: 'hold', text: 'hold — gather the light' },
  { id: 'pinch', text: 'pinch — collapse it' },
  { id: 'double', text: 'double-tap — new mood' },
  { id: 'twist', text: 'two fingers · twist' },
  { id: 'tilt', text: 'tilt your phone', needsMotion: true },
  { id: 'shake', text: 'shake — let go', needsMotion: true },
];

export class UI {
  constructor(cb) {
    this.cb = cb; // { onDot, onSound, onMotion }
    this.$ = (id) => document.getElementById(id);
    this.splash = this.$('splash');
    this.wordmark = this.$('wordmark');
    this.moodname = this.$('moodname');
    this.dots = this.$('dots');
    this.hint = this.$('hint');
    this.chipSound = this.$('chip-sound');
    this.chipMotion = this.$('chip-motion');
    this._hintT = 0;
    this._hintIdx = 0;
    this._hintShown = false;
    this._motionAvailable = false;
    try { this.disc = new Set(JSON.parse(localStorage.getItem('ora.disc') || '[]')); }
    catch { this.disc = new Set(); }

    this.chipSound.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault(); this.cb.onSound?.();
    }, { passive: false });
    this.chipMotion.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault(); this.cb.onMotion?.();
    }, { passive: false });
  }

  buildDots(moods) {
    this.dots.innerHTML = '';
    moods.forEach((m, i) => {
      const b = document.createElement('button');
      b.className = 'dot';
      b.setAttribute('aria-label', m.name);
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault(); this.cb.onDot?.(i);
      }, { passive: false });
      this.dots.appendChild(b);
    });
  }

  setMood(m, i, instant) {
    document.documentElement.style.setProperty('--accent', m.accent);
    [...this.dots.children].forEach((d, j) => d.classList.toggle('on', j === i));
    if (!instant) {
      this.moodname.textContent = `${m.name} — ${m.tag}`;
      this.moodname.classList.remove('flash');
      void this.moodname.offsetWidth; // restart animation
      this.moodname.classList.add('flash');
    }
  }

  ready() { this.splash.classList.add('ready'); }

  dismissSplash() {
    if (this._dismissed) return;
    this._dismissed = true;
    this.splash.classList.add('hide');
    this.wordmark.classList.add('show');
    document.getElementById('hud').classList.add('show');
  }

  motionAvailable(v) { this._motionAvailable = v; }
  showMotionChip(v) { this.chipMotion.classList.toggle('show', v); }
  motionGranted() {
    this.chipMotion.classList.remove('show');
    this._motionAvailable = true;
  }
  soundState(muted) {
    this.chipSound.querySelector('span').textContent = muted ? '○' : '●';
    this.chipSound.classList.toggle('off', muted);
  }

  discovered(id) {
    if (this.disc.has(id)) return;
    this.disc.add(id);
    try { localStorage.setItem('ora.disc', JSON.stringify([...this.disc])); } catch { /* ok */ }
    if (this._hintShown) this._hideHint();
  }

  _candidates() {
    return HINTS.filter((h) => !this.disc.has(h.id) && (!h.needsMotion || this._motionAvailable));
  }

  _hideHint() { this.hint.classList.remove('show'); this._hintShown = false; this._hintT = 0; }

  interaction() { if (this._hintShown) this._hideHint(); this._hintT = 0; }

  tickHints(idleT, dt) {
    if (!this._dismissed) return;
    const cands = this._candidates();
    if (!cands.length) return;
    if (!this._hintShown && idleT > 7) {
      const h = cands[this._hintIdx++ % cands.length];
      this.hint.textContent = h.text;
      this.hint.classList.add('show');
      this._hintShown = true;
      this._hintT = 0;
    } else if (this._hintShown) {
      this._hintT += dt;
      if (this._hintT > 4.5) this._hideHint(); // rotate to the next later
    }
  }
}
