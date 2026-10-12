/** Estimate display refresh rate from the median requestAnimationFrame interval. */
export function measureRefreshRate(samples = 120): Promise<number> {
  return new Promise((resolve) => {
    const deltas: number[] = [];
    let last = performance.now();
    const tick = (now: number) => {
      deltas.push(now - last);
      last = now;
      if (deltas.length < samples) {
        requestAnimationFrame(tick);
      } else {
        const sorted = [...deltas].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)]!;
        resolve(Math.round(1000 / median));
      }
    };
    requestAnimationFrame(tick);
  });
}
