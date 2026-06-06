/**
 * cinemaAudio — sound synthesis for the cinema (TournamentCinema), 100% Web
 * Audio API: no files, no dependencies, no backend (project invariant).
 *
 * Sound design: clean, "sporty/arcade" synth, not realistic. Each event has a
 * matching sound; a tension drone builds through the late rounds (quarters →
 * semis → final) for suspense.
 *
 * Browser-friendly: the AudioContext starts only after a user gesture (created
 * on demand) and can be muted.
 */

type Tension = 0 | 1 | 2 | 3 | 4; // 0 = none, 4 = final

class CinemaAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  /** Tension heartbeat: a pulsing timer that speeds up with the level. */
  private heartTimer: number | null = null;
  private tension: Tension = 0;

  private ensure(): boolean {
    if (this.muted) return false;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return true;
  }

  /**
   * Call inside a click/touch handler to unlock the AudioContext on iOS/Android.
   * Browsers require the context to be created (or resumed) within a user gesture.
   */
  warm() {
    if (this.muted) return;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (m) {
      this.stopHeart();
      if (this.master && this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    } else if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(0.6, this.ctx.currentTime, 0.05);
      this.applyTension(); // resume the heartbeat if needed
    }
  }
  isMuted() { return this.muted; }

  /** Short sound: oscillator with envelope, optional frequency glide. */
  private blip(opts: {
    type?: OscillatorType; from: number; to?: number; dur: number;
    gain?: number; delay?: number;
  }) {
    if (!this.ensure() || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.from, t0);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + opts.dur);
    const peak = opts.gain ?? 0.25;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + opts.dur + 0.02);
  }

  /** Filtered noise (for whoosh/whistle). */
  private noise(dur: number, freq: number, gain = 0.18) {
    if (!this.ensure() || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buffer;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.setValueAtTime(freq, t0);
    bp.frequency.exponentialRampToValueAtTime(freq * 2.5, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur);
  }

  // ── Game events ──────────────────────────────────────────────────

  /** Kickoff: referee's whistle (two high tones). */
  kickoff() {
    this.blip({ type: 'square', from: 1400, to: 1700, dur: 0.14, gain: 0.18 });
    this.blip({ type: 'square', from: 1700, to: 1400, dur: 0.18, gain: 0.18, delay: 0.16 });
  }

  /** Group result revealed: clean tick. */
  groupTick() {
    this.blip({ type: 'triangle', from: 660, to: 880, dur: 0.09, gain: 0.16 });
  }

  /** A team advances in the bracket: whoosh + rising note. */
  advance() {
    this.noise(0.22, 600, 0.12);
    this.blip({ type: 'sine', from: 420, to: 720, dur: 0.18, gain: 0.2 });
  }

  /** KO match decided on penalties: tension + release. */
  penalties() {
    this.blip({ type: 'sawtooth', from: 200, to: 160, dur: 0.5, gain: 0.14 });
    this.blip({ type: 'sine', from: 520, to: 900, dur: 0.22, gain: 0.22, delay: 0.42 });
  }

  /** Tension accent on a decisive match (semi/final): "thud" + reverb. */
  keyMatch(level: Tension) {
    const base = 110 + level * 18;
    this.blip({ type: 'sine', from: base, to: base * 0.6, dur: 0.4, gain: 0.22 });
    this.blip({ type: 'triangle', from: base * 4, dur: 0.3, gain: 0.06, delay: 0.02 });
  }

  /** A single "lub-dub" heartbeat (two close low thumps). */
  private heartThump() {
    if (!this.ensure() || !this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const thump = (delay: number, f: number, g: number) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t + delay);
      osc.frequency.exponentialRampToValueAtTime(f * 0.5, t + delay + 0.16);
      gain.gain.setValueAtTime(0.0001, t + delay);
      gain.gain.exponentialRampToValueAtTime(g, t + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.18);
      osc.connect(gain); gain.connect(this.master!);
      osc.start(t + delay); osc.stop(t + delay + 0.22);
    };
    const vol = [0, 0, 0.16, 0.22, 0.3][this.tension];
    thump(0, 80, vol);          // "lub"
    thump(0.16, 66, vol * 0.8); // "dub"
  }

  /** Champion: triumphant fanfare. */
  champion() {
    const notes = [523, 659, 784, 1047]; // C-E-G-C
    notes.forEach((f, i) => {
      this.blip({ type: 'sawtooth', from: f, dur: 0.55, gain: 0.16, delay: i * 0.13 });
      this.blip({ type: 'sine', from: f * 2, dur: 0.5, gain: 0.08, delay: i * 0.13 });
    });
    this.noise(0.6, 2000, 0.1); // crowd cheer-ish
    this.setTension(0);
  }

  // ── Tension HEARTBEAT (building suspense) ───────────────────────

  setTension(level: Tension) {
    if (this.tension === level) return;
    const prev = this.tension;
    this.tension = level;
    // On decisive levels (semi/final), an accent when entering the round.
    if (level > prev && level >= 3) this.keyMatch(level);
    this.applyTension();
  }

  private applyTension() {
    if (this.muted) { this.stopHeart(); return; }
    // The heartbeat starts only from the quarters on (tension ≥ 2) and speeds up
    // toward the final: the closer the title, the faster the heart beats.
    if (this.tension < 2) { this.stopHeart(); return; }
    if (!this.ensure()) return;

    const intervalMs = [0, 0, 1150, 880, 620][this.tension]; // smaller = faster
    this.stopHeart();
    this.heartThump(); // first beat right away
    this.heartTimer = window.setInterval(() => this.heartThump(), intervalMs);
  }

  private stopHeart() {
    if (this.heartTimer !== null) { window.clearInterval(this.heartTimer); this.heartTimer = null; }
  }

  dispose() {
    this.stopHeart();
    if (this.ctx) { void this.ctx.close(); this.ctx = null; this.master = null; }
  }
}

/** Singleton: a single audio instance for the session. */
export const cinemaAudio = new CinemaAudio();
