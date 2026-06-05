/**
 * cinemaAudio — sintesi sonora per la regia (TournamentCinema), 100% Web Audio
 * API: nessun file, nessuna dipendenza, nessun backend (invariante del progetto).
 *
 * Filosofia sonora: synth pulito e "sportivo/arcade", non realistico. Ogni
 * evento ha un suono coerente; un DRONE di tensione cresce nelle fasi finali
 * (quarti → semifinali → finale) per dare suspense.
 *
 * Tutto è gentile col browser: l'AudioContext parte solo dopo un gesto utente
 * (lo creiamo on-demand) e si può silenziare.
 */

type Tension = 0 | 1 | 2 | 3 | 4; // 0 = nessuna, 4 = finale

class CinemaAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  /** Battito cardiaco di tensione: un timer che pulsa, accelerando col livello. */
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
   * Chiama dentro un gestore di click/touch per sbloccare l'AudioContext su iOS/Android.
   * Il browser richiede che il contesto venga creato (o resumed) dentro un user gesture.
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
      this.applyTension(); // riprende il battito se serve
    }
  }
  isMuted() { return this.muted; }

  /** Suono breve: oscillatore con inviluppo, opzionale glide di frequenza. */
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

  /** Filtered noise (per whoosh/fischio). */
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

  // ── Eventi di gioco ──────────────────────────────────────────────

  /** Calcio d'inizio: fischio dell'arbitro (due toni acuti). */
  kickoff() {
    this.blip({ type: 'square', from: 1400, to: 1700, dur: 0.14, gain: 0.18 });
    this.blip({ type: 'square', from: 1700, to: 1400, dur: 0.18, gain: 0.18, delay: 0.16 });
  }

  /** Risultato di girone svelato: tick pulito. */
  groupTick() {
    this.blip({ type: 'triangle', from: 660, to: 880, dur: 0.09, gain: 0.16 });
  }

  /** Una squadra avanza nel tabellone: whoosh + nota ascendente. */
  advance() {
    this.noise(0.22, 600, 0.12);
    this.blip({ type: 'sine', from: 420, to: 720, dur: 0.18, gain: 0.2 });
  }

  /** Match KO deciso ai rigori: tensione + sblocco. */
  penalties() {
    this.blip({ type: 'sawtooth', from: 200, to: 160, dur: 0.5, gain: 0.14 });
    this.blip({ type: 'sine', from: 520, to: 900, dur: 0.22, gain: 0.22, delay: 0.42 });
  }

  /** Accento di tensione su un match decisivo (semi/finale): "tonfo" + riverbero. */
  keyMatch(level: Tension) {
    const base = 110 + level * 18;
    this.blip({ type: 'sine', from: base, to: base * 0.6, dur: 0.4, gain: 0.22 });
    this.blip({ type: 'triangle', from: base * 4, dur: 0.3, gain: 0.06, delay: 0.02 });
  }

  /** Un singolo "lub-dub" di battito cardiaco (due colpi gravi ravvicinati). */
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

  /** Campione: fanfara trionfale. */
  champion() {
    const notes = [523, 659, 784, 1047]; // do-mi-sol-do
    notes.forEach((f, i) => {
      this.blip({ type: 'sawtooth', from: f, dur: 0.55, gain: 0.16, delay: i * 0.13 });
      this.blip({ type: 'sine', from: f * 2, dur: 0.5, gain: 0.08, delay: i * 0.13 });
    });
    this.noise(0.6, 2000, 0.1); // crowd cheer-ish
    this.setTension(0);
  }

  // ── BATTITO CARDIACO di tensione (suspense crescente) ───────────

  setTension(level: Tension) {
    if (this.tension === level) return;
    const prev = this.tension;
    this.tension = level;
    // Sui livelli decisivi (semi/finale), un accento all'ingresso nella fase.
    if (level > prev && level >= 3) this.keyMatch(level);
    this.applyTension();
  }

  private applyTension() {
    if (this.muted) { this.stopHeart(); return; }
    // Il battito parte solo dai quarti in poi (tension ≥ 2) e accelera verso
    // la finale: più si avvicina il titolo, più il cuore batte veloce.
    if (this.tension < 2) { this.stopHeart(); return; }
    if (!this.ensure()) return;

    const intervalMs = [0, 0, 1150, 880, 620][this.tension]; // più alto = più veloce
    this.stopHeart();
    this.heartThump(); // primo colpo subito
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

/** Singleton: una sola istanza audio per la sessione. */
export const cinemaAudio = new CinemaAudio();
