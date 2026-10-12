/**
 * Free-fusion split-field geometry for Mode B1 (cross-fusion or septum-assisted).
 * Left eye fixates the right panel and vice versa. See docs/phase2-math.md §9.
 */

const DEG_PER_RAD = 180 / Math.PI;

export interface FusionGeometry {
  /** Center-to-center separation of the two panels, in cm. */
  panelSeparationCm: number;
  viewingDistanceCm: number;
  /** Interpupillary distance in cm (default 6.3). */
  ipdCm?: number;
}

function ipd(g: FusionGeometry): number {
  return g.ipdCm ?? 6.3;
}

/** Distance from the eyes at which the two lines of sight cross (cross-fusion), in cm. */
export function convergenceDistanceCm(g: FusionGeometry): number {
  const i = ipd(g);
  return (g.viewingDistanceCm * i) / (i + g.panelSeparationCm);
}

/** Total convergence angle at the fused fixation point, in degrees. */
export function convergenceAngleDeg(g: FusionGeometry): number {
  const i = ipd(g);
  return DEG_PER_RAD * 2 * Math.atan((i + g.panelSeparationCm) / (2 * g.viewingDistanceCm));
}

/** Extra vergence demand beyond fixating the screen plane, in degrees. */
export function vergenceDemandDeg(g: FusionGeometry): number {
  const i = ipd(g);
  const screenAngle = DEG_PER_RAD * 2 * Math.atan(i / (2 * g.viewingDistanceCm));
  return convergenceAngleDeg(g) - screenAngle;
}

/** Ergonomic ceiling for sustained extra convergence (degrees); sessions start below this. */
export const MAX_COMFORTABLE_VERGENCE_DEMAND_DEG = 8;

export function isComfortable(g: FusionGeometry): boolean {
  return vergenceDemandDeg(g) <= MAX_COMFORTABLE_VERGENCE_DEMAND_DEG;
}

/**
 * Widest panel that cannot overlap its neighbor: panel width must not exceed the separation.
 */
export function maxPanelWidthCm(g: FusionGeometry): number {
  return g.panelSeparationCm;
}
