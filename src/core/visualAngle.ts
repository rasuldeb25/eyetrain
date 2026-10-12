/**
 * Visual-angle math. All clinical stimulus parameters are specified in degrees of visual
 * angle (or arcsec) and converted to pixels at runtime from a per-device DisplayProfile.
 * See docs/phase2-math.md §1.
 */

export interface DisplayProfile {
  name: string;
  /** Horizontal resolution in physical (device) pixels. */
  horizontalResolutionPx: number;
  /** Physical width of the display area in cm (measured during calibration). */
  screenWidthCm: number;
  /** Eye-to-screen distance in cm. */
  viewingDistanceCm: number;
  refreshRateHz: number;
  /** Display gamma from visual calibration; undefined until calibrated. */
  gamma?: number;
  /** Interpupillary distance in cm (Mode B1 only). */
  ipdCm?: number;
}

const DEG_PER_RAD = 180 / Math.PI;

export function pxPerCm(p: DisplayProfile): number {
  return p.horizontalResolutionPx / p.screenWidthCm;
}

/** Exact angular size of one pixel at screen center, in degrees. */
export function degPerPx(p: DisplayProfile): number {
  const pxSizeCm = 1 / pxPerCm(p);
  return DEG_PER_RAD * 2 * Math.atan(pxSizeCm / (2 * p.viewingDistanceCm));
}

/** Pixels per degree of visual angle at screen center. */
export function pixelsPerDegree(p: DisplayProfile): number {
  return 1 / degPerPx(p);
}

/** Exact extent in pixels of a centered feature subtending `deg` degrees. */
export function degToPx(deg: number, p: DisplayProfile): number {
  return 2 * p.viewingDistanceCm * Math.tan((deg / DEG_PER_RAD) / 2) * pxPerCm(p);
}

/** Exact visual angle in degrees of a centered feature `px` pixels wide. */
export function pxToDeg(px: number, p: DisplayProfile): number {
  return DEG_PER_RAD * 2 * Math.atan(px / (2 * p.viewingDistanceCm * pxPerCm(p)));
}

export function arcsecToDeg(arcsec: number): number {
  return arcsec / 3600;
}

export function arcsecToPx(arcsec: number, p: DisplayProfile): number {
  return degToPx(arcsecToDeg(arcsec), p);
}

/** Spatial frequency in cycles/degree → cycles per pixel (shader-facing unit). */
export function cpdToCyclesPerPx(cpd: number, p: DisplayProfile): number {
  return cpd / pixelsPerDegree(p);
}

/** Grating wavelength λ in pixels for a given spatial frequency. */
export function wavelengthPx(cpd: number, p: DisplayProfile): number {
  return pixelsPerDegree(p) / cpd;
}

/**
 * Nyquist guard: a grating is renderable only if λ ≥ 2 px (cycles/px ≤ 0.5).
 * Callers must check this before presenting a stimulus.
 */
export function isRenderable(cpd: number, p: DisplayProfile): boolean {
  return cpdToCyclesPerPx(cpd, p) <= 0.5;
}
