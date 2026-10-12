/**
 * Transformed up-down adaptive staircase (Levitt 1971).
 * Default 3-down/1-up converges on the 79.4% correct point.
 * Steps are applied in log10 units of the controlled variable.
 * See docs/phase2-math.md §5.
 */

export interface StaircaseConfig {
  /** Starting value in linear units (e.g. Michelson contrast 0.5). */
  startValue: number;
  /** Consecutive correct responses required to step down (harder). */
  nDown?: number;
  /** Incorrect responses required to step up (easier); 1 for n-down/1-up. */
  nUp?: number;
  /** Initial step size in log10 units. */
  stepLogInitial?: number;
  /** Step size after `reversalsToShrink` reversals. */
  stepLogFinal?: number;
  reversalsToShrink?: number;
  /** Run terminates after this many reversals. */
  maxReversals?: number;
  /** Threshold = mean of the last `thresholdReversals` reversal values (log space). */
  thresholdReversals?: number;
  minValue?: number;
  maxValue?: number;
}

export interface Trial {
  value: number;
  correct: boolean;
}

type Direction = "down" | "up";

export class Staircase {
  readonly config: Required<StaircaseConfig>;
  private logValue: number;
  private consecutiveCorrect = 0;
  private consecutiveIncorrect = 0;
  private lastDirection: Direction | null = null;
  private readonly reversalLogValues: number[] = [];
  private readonly trials: Trial[] = [];

  constructor(config: StaircaseConfig) {
    this.config = {
      nDown: 3,
      nUp: 1,
      stepLogInitial: 0.1,
      stepLogFinal: 0.05,
      reversalsToShrink: 2,
      maxReversals: 10,
      thresholdReversals: 6,
      minValue: Number.MIN_VALUE,
      maxValue: Number.MAX_VALUE,
      ...config,
    };
    if (this.config.startValue <= 0) throw new RangeError("startValue must be > 0");
    this.logValue = Math.log10(this.config.startValue);
  }

  /** Current stimulus value in linear units. */
  get value(): number {
    const v = Math.pow(10, this.logValue);
    return Math.min(this.config.maxValue, Math.max(this.config.minValue, v));
  }

  get reversalCount(): number {
    return this.reversalLogValues.length;
  }

  get trialCount(): number {
    return this.trials.length;
  }

  get done(): boolean {
    return this.reversalLogValues.length >= this.config.maxReversals;
  }

  get history(): readonly Trial[] {
    return this.trials;
  }

  private get stepLog(): number {
    return this.reversalLogValues.length >= this.config.reversalsToShrink
      ? this.config.stepLogFinal
      : this.config.stepLogInitial;
  }

  /** Record a response; steps the value per the n-down/n-up rule. */
  update(correct: boolean): void {
    if (this.done) return;
    this.trials.push({ value: this.value, correct });

    if (correct) {
      this.consecutiveCorrect++;
      this.consecutiveIncorrect = 0;
      if (this.consecutiveCorrect >= this.config.nDown) {
        this.consecutiveCorrect = 0;
        this.step("down");
      }
    } else {
      this.consecutiveIncorrect++;
      this.consecutiveCorrect = 0;
      if (this.consecutiveIncorrect >= this.config.nUp) {
        this.consecutiveIncorrect = 0;
        this.step("up");
      }
    }
  }

  private step(direction: Direction): void {
    if (this.lastDirection !== null && this.lastDirection !== direction) {
      this.reversalLogValues.push(this.logValue);
    }
    this.lastDirection = direction;
    const delta = direction === "down" ? -this.stepLog : this.stepLog;
    const next = Math.pow(10, this.logValue + delta);
    const clamped = Math.min(this.config.maxValue, Math.max(this.config.minValue, next));
    this.logValue = Math.log10(clamped);
  }

  /**
   * Threshold estimate: 10^(mean of the last `thresholdReversals` reversal values in log
   * space). Returns null until enough reversals have accumulated.
   */
  get threshold(): number | null {
    const k = this.config.thresholdReversals;
    if (this.reversalLogValues.length < k) return null;
    const tail = this.reversalLogValues.slice(-k);
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    return Math.pow(10, mean);
  }
}
