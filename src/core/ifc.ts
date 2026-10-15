/**
 * Temporal 2IFC scene composition: which patches are on screen in each pulse.
 * Flankers (when the track has them) appear in BOTH pulses; the target appears in exactly
 * one, chosen at random per trial. Pure and generic so the rule is unit-testable apart
 * from the render loop.
 */
export function pulseScene<T>(
  flankers: readonly T[],
  target: T,
  targetInterval: 1 | 2,
  pulse: 1 | 2,
): T[] {
  const scene: T[] = [...flankers];
  if (pulse === targetInterval) scene.push(target);
  return scene;
}
