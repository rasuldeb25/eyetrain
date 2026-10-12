/**
 * Display gamma model, inverse encoding, and dither quantization.
 * Model: L(v)/L_white = (v/255)^gamma. See docs/phase2-math.md §3–4.
 */

export interface GammaSample {
  /** DAC value (0–255) the user matched to the dithered reference. */
  dac: number;
  /** Known linear luminance of the reference (0–1). */
  linear: number;
}

/**
 * Least-squares fit of gamma in log-log space (regression through the origin):
 * ln(linear) = gamma * ln(dac/255).
 */
export function fitGamma(samples: readonly GammaSample[]): number {
  let num = 0;
  let den = 0;
  for (const s of samples) {
    if (s.dac <= 0 || s.dac >= 255 || s.linear <= 0 || s.linear >= 1) {
      throw new RangeError(`gamma sample out of open range: dac=${s.dac} linear=${s.linear}`);
    }
    const x = Math.log(s.dac / 255);
    const y = Math.log(s.linear);
    num += x * y;
    den += x * x;
  }
  if (den === 0) throw new RangeError("fitGamma needs at least one informative sample");
  return num / den;
}

/** Ideal continuous DAC value (0–255, float) encoding linear luminance l. */
export function linearToDac(l: number, gamma: number): number {
  const clamped = Math.min(1, Math.max(0, l));
  return 255 * Math.pow(clamped, 1 / gamma);
}

/** Linear luminance (0–1) produced by integer DAC value v. */
export function dacToLinear(v: number, gamma: number): number {
  return Math.pow(Math.min(255, Math.max(0, v)) / 255, gamma);
}

/**
 * Dither quantization: round the continuous DAC value up with probability equal to its
 * fractional part, using externally supplied noise in [0,1). With fresh noise per pixel per
 * frame, E[quantized] = vFloat — this is the TS reference for the GLSL implementation.
 */
export function quantizeWithDither(vFloat: number, noise: number): number {
  const v = Math.min(255, Math.max(0, vFloat));
  const base = Math.floor(v);
  const frac = v - base;
  const out = noise < frac ? base + 1 : base;
  return Math.min(255, out);
}

/** Inverse-gamma lookup table (linear luminance index → continuous DAC value). */
export function buildInverseLut(gamma: number, size = 1024): Float32Array {
  const lut = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    lut[i] = linearToDac(i / (size - 1), gamma);
  }
  return lut;
}
