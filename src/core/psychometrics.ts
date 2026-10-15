/**
 * Zero-dependency 2AFC psychometrics (slice 4). The staircase's reversal average is a
 * robust-but-crude threshold; this module fits the full Weibull psychometric function to
 * every trial by maximum likelihood, yielding a threshold with a confidence interval,
 * a slope, and a lapse rate — plus a signal-detection response-bias check. Pure math.
 *
 *   Ψ(C; α, β, λ) = 0.5 + (0.5 − λ)·(1 − exp(−(C/α)^β))
 *
 * Threshold is reported at 79.4% correct to stay commensurable with the 3-down/1-up
 * staircase target.
 */

export interface PsyTrial {
  /** Stimulus intensity (Michelson contrast), > 0. */
  contrast: number;
  correct: boolean;
  isCatch?: boolean;
}

export interface WeibullFit {
  alpha: number;
  beta: number;
  lapse: number;
  /** Contrast at 79.4% correct (the staircase-equivalent threshold). */
  threshold794: number;
  logCS: number;
  nTrials: number;
  /** 95% CI on logCS from parametric bootstrap (present when `bootstrap` > 0). */
  ci95?: [number, number];
}

const LAPSE_GRID = [0, 0.025, 0.05, 0.075, 0.1];
const ALPHA_POINTS = 40;
const BETA_POINTS = 12;
const BETA_MIN = 0.5;
const BETA_MAX = 8;
const P_CLAMP = 1e-9;
const TARGET_P = 0.794;

/** Deterministic PRNG for reproducible bootstrap (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function weibull2AFC(c: number, alpha: number, beta: number, lapse: number): number {
  return 0.5 + (0.5 - lapse) * (1 - Math.exp(-Math.pow(c / alpha, beta)));
}

/** Contrast at `p` correct for the fitted parameters. */
export function weibullInverse(p: number, alpha: number, beta: number, lapse: number): number {
  const inner = (p - 0.5) / (0.5 - lapse);
  if (inner <= 0 || inner >= 1) throw new RangeError("p outside the function's range");
  return alpha * Math.pow(-Math.log(1 - inner), 1 / beta);
}

interface Level {
  contrast: number;
  n: number;
  k: number; // correct count
}

/** Collapse trials into binomial counts per unique contrast — big grid-search speedup. */
function aggregate(trials: readonly PsyTrial[]): Level[] {
  const map = new Map<number, Level>();
  for (const t of trials) {
    const lv = map.get(t.contrast);
    if (lv) {
      lv.n++;
      if (t.correct) lv.k++;
    } else {
      map.set(t.contrast, { contrast: t.contrast, n: 1, k: t.correct ? 1 : 0 });
    }
  }
  return [...map.values()];
}

function logLikelihood(levels: readonly Level[], alpha: number, beta: number, lapse: number): number {
  let ll = 0;
  for (const lv of levels) {
    const p = Math.min(1 - P_CLAMP, Math.max(P_CLAMP, weibull2AFC(lv.contrast, alpha, beta, lapse)));
    ll += lv.k * Math.log(p) + (lv.n - lv.k) * Math.log(1 - p);
  }
  return ll;
}

function gridFit(trials: readonly PsyTrial[]): { alpha: number; beta: number; lapse: number } {
  const levels = aggregate(trials);
  let cMin = Infinity;
  let cMax = 0;
  for (const lv of levels) {
    if (lv.contrast > 0) {
      cMin = Math.min(cMin, lv.contrast);
      cMax = Math.max(cMax, lv.contrast);
    }
  }
  if (!(cMin < Infinity) || cMax <= 0) throw new RangeError("no positive-contrast trials");
  const aLo = Math.log(cMin / 2);
  const aHi = Math.log(cMax * 2);
  const bLo = Math.log(BETA_MIN);
  const bHi = Math.log(BETA_MAX);
  let best = { alpha: cMax, beta: 2, lapse: 0 };
  let bestLL = -Infinity;
  for (let i = 0; i < ALPHA_POINTS; i++) {
    const alpha = Math.exp(aLo + ((aHi - aLo) * i) / (ALPHA_POINTS - 1));
    for (let j = 0; j < BETA_POINTS; j++) {
      const beta = Math.exp(bLo + ((bHi - bLo) * j) / (BETA_POINTS - 1));
      for (const lapse of LAPSE_GRID) {
        const ll = logLikelihood(levels, alpha, beta, lapse);
        if (ll > bestLL) {
          bestLL = ll;
          best = { alpha, beta, lapse };
        }
      }
    }
  }
  return best;
}

/**
 * Maximum-likelihood Weibull fit over all trials (catch trials INCLUDED — their
 * high-contrast errors are what pins the lapse rate). Optional parametric bootstrap:
 * `bootstrap` resamples give a 95% CI on logCS. Needs ≥ 20 trials.
 */
export function fitWeibull2AFC(
  trials: readonly PsyTrial[],
  opts: { bootstrap?: number; rand?: () => number } = {},
): WeibullFit {
  const usable = trials.filter((t) => t.contrast > 0);
  if (usable.length < 20) throw new RangeError("need at least 20 trials for a stable fit");
  const { alpha, beta, lapse } = gridFit(usable);
  const threshold794 = weibullInverse(TARGET_P, alpha, beta, lapse);
  const fit: WeibullFit = {
    alpha,
    beta,
    lapse,
    threshold794,
    logCS: -Math.log10(threshold794),
    nTrials: usable.length,
  };

  const B = opts.bootstrap ?? 0;
  if (B > 0) {
    const rand = opts.rand ?? Math.random;
    const logCSs: number[] = [];
    for (let b = 0; b < B; b++) {
      const resampled = usable.map((t) => ({
        contrast: t.contrast,
        correct: rand() < weibull2AFC(t.contrast, alpha, beta, lapse),
      }));
      try {
        const g = gridFit(resampled);
        logCSs.push(-Math.log10(weibullInverse(TARGET_P, g.alpha, g.beta, g.lapse)));
      } catch {
        /* degenerate resample — skip */
      }
    }
    if (logCSs.length >= 20) {
      logCSs.sort((x, y) => x - y);
      const lo = logCSs[Math.floor(0.025 * (logCSs.length - 1))]!;
      const hi = logCSs[Math.ceil(0.975 * (logCSs.length - 1))]!;
      fit.ci95 = [lo, hi];
    }
  }
  return fit;
}

/** Inverse standard-normal CDF (Acklam's rational approximation, |err| < 1.15e-9). */
export function probit(p: number): number {
  if (p <= 0 || p >= 1) throw new RangeError("p must be in (0,1)");
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269,
    -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197,
    -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373,
    4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p <= 1 - pl) {
    const q = p - 0.5;
    const r = q * q;
    return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
}

export interface BiasResult {
  /** SDT criterion c over the two stimulus classes; 0 = unbiased, |c| > 0.5 = flag. */
  c: number;
  pRespondPositiveGivenPositive: number;
  pRespondPositiveGivenNegative: number;
  n: number;
}

/**
 * Response bias between the two 2AFC stimulus classes (e.g. −45° vs +45° tilts). The
 * response on each trial is reconstructed from the stimulus class and correctness.
 */
export function responseBias(
  trials: readonly { thetaDeg: number; correct: boolean }[],
): BiasResult | null {
  const pos = trials.filter((t) => t.thetaDeg > 0);
  const neg = trials.filter((t) => t.thetaDeg < 0);
  if (pos.length < 5 || neg.length < 5) return null;
  // "Responded positive" = correct on a positive stimulus, or wrong on a negative one.
  const clampRate = (k: number, n: number) =>
    Math.min(1 - 1 / (2 * n), Math.max(1 / (2 * n), k / n));
  const h = clampRate(pos.filter((t) => t.correct).length, pos.length);
  const f = clampRate(neg.filter((t) => !t.correct).length, neg.length);
  return {
    c: -(probit(h) + probit(f)) / 2,
    pRespondPositiveGivenPositive: h,
    pRespondPositiveGivenNegative: f,
    n: trials.length,
  };
}
