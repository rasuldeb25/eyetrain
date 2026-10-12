/**
 * Frame-locked counterphase flicker (Mode B2): usable rates are R/(2k) so a half-cycle is an
 * integer number of frames. Phase is driven by frame count, never wall-clock time.
 * See docs/phase2-math.md §8.
 */

export interface FrameLockedRate {
  rateHz: number;
  /** Frames per half-cycle (contrast polarity flips every `framesPerHalfCycle` frames). */
  framesPerHalfCycle: number;
}

/** All frame-locked counterphase rates within [minHz, maxHz] for a given refresh rate. */
export function availableCounterphaseRates(
  refreshHz: number,
  minHz = 3,
  maxHz = 12,
): FrameLockedRate[] {
  if (refreshHz <= 0) throw new RangeError("refresh rate must be > 0");
  const rates: FrameLockedRate[] = [];
  for (let k = 1; refreshHz / (2 * k) >= minHz; k++) {
    const rateHz = refreshHz / (2 * k);
    if (rateHz <= maxHz) rates.push({ rateHz, framesPerHalfCycle: k });
  }
  return rates;
}

/** The frame-locked rate nearest the requested target. */
export function nearestFrameLockedRate(
  targetHz: number,
  refreshHz: number,
  minHz = 3,
  maxHz = 12,
): FrameLockedRate {
  const rates = availableCounterphaseRates(refreshHz, minHz, maxHz);
  if (rates.length === 0) {
    throw new RangeError(`no frame-locked rate in [${minHz}, ${maxHz}] Hz at ${refreshHz} Hz`);
  }
  let best = rates[0]!;
  for (const r of rates) {
    if (Math.abs(r.rateHz - targetHz) < Math.abs(best.rateHz - targetHz)) best = r;
  }
  return best;
}

/** Contrast polarity (+1/−1) for a given animation frame index. */
export function polarityAtFrame(frameIndex: number, framesPerHalfCycle: number): 1 | -1 {
  return Math.floor(frameIndex / framesPerHalfCycle) % 2 === 0 ? 1 : -1;
}
