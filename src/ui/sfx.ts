/**
 * Synthesized sound effects — pure WebAudio oscillators, no asset files. The AudioContext
 * is created/resumed from a user gesture (the Start button) to satisfy mobile autoplay
 * rules. Audio carries game feedback so the VISUAL field around a near-threshold stimulus
 * can stay quiet: the trial-onset cue is sound-only and carries no location information.
 */

const PREF_KEY = "eyetrain-sound";

export class Sfx {
  private ctx: AudioContext | null = null;
  enabled: boolean;

  constructor() {
    let pref: string | null = null;
    try {
      pref = localStorage.getItem(PREF_KEY);
    } catch {
      /* storage unavailable — default on */
    }
    this.enabled = pref !== "off";
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      localStorage.setItem(PREF_KEY, on ? "on" : "off");
    } catch {
      /* ignore */
    }
  }

  /** Call from a user gesture (Start button) — creates/resumes the context. */
  unlock(): void {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      this.ctx = null; // no audio on this device — all play calls become no-ops
    }
  }

  private tone(
    freq: number,
    durS: number,
    type: OscillatorType,
    peakGain: number,
    startS = 0,
    slideToHz?: number,
  ): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== "running") return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + startS;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideToHz !== undefined) osc.frequency.exponentialRampToValueAtTime(slideToHz, t0 + durS);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durS);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durS + 0.02);
  }

  /**
   * Pulse-onset blip (temporal cue only — no location, no answer hint). `high` marks the
   * second 2IFC pulse with a higher pitch so the two pulses are easy to count; the pitch
   * never depends on where the target is.
   */
  tick(high = false): void {
    this.tone(high ? 2217 : 1760, 0.04, "sine", 0.04);
  }

  /** Correct answer: pitch climbs one semitone per combo step (caps one octave up). */
  hit(combo: number): void {
    const f = 440 * Math.pow(2, Math.min(combo, 12) / 12);
    this.tone(f, 0.12, "triangle", 0.11);
    this.tone(f * 2, 0.08, "sine", 0.04, 0.02);
  }

  /** Miss/timeout: low descending thud. */
  miss(): void {
    this.tone(150, 0.22, "sawtooth", 0.08, 0, 65);
  }

  /** Shield fully depleted. */
  breach(): void {
    this.tone(85, 0.35, "square", 0.09, 0, 55);
  }

  /** Wave cleared: ascending arpeggio. */
  waveClear(): void {
    this.tone(523.25, 0.1, "triangle", 0.09, 0);
    this.tone(659.25, 0.1, "triangle", 0.09, 0.09);
    this.tone(783.99, 0.18, "triangle", 0.09, 0.18);
  }

  dispose(): void {
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
