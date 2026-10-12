/**
 * Phase 2 scaffold entry: runs a live self-test of the math core against a provisional
 * display profile so the dev server shows real numbers. Replaced by the calibration wizard
 * and game shell in Phase 3.
 */
import { type DisplayProfile, pixelsPerDegree, wavelengthPx } from "./core/visualAngle";
import { nearestFrameLockedRate } from "./core/flicker";
import { vergenceDemandDeg } from "./core/fusion";
import { Staircase } from "./core/staircase";
import { spacingForLevel } from "./core/polat";

function estimateRefreshRate(): Promise<number> {
  return new Promise((resolve) => {
    const samples: number[] = [];
    let last = performance.now();
    const tick = (now: number) => {
      samples.push(now - last);
      last = now;
      if (samples.length < 60) requestAnimationFrame(tick);
      else {
        const sorted = [...samples].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)]!;
        resolve(Math.round(1000 / median));
      }
    };
    requestAnimationFrame(tick);
  });
}

async function selfTest(): Promise<void> {
  const list = document.querySelector("#selftest");
  if (!list) return;

  const refreshRateHz = await estimateRefreshRate();
  // Provisional profile: real values come from the calibration wizard (Phase 3).
  const profile: DisplayProfile = {
    name: "provisional",
    horizontalResolutionPx: screen.width * devicePixelRatio,
    screenWidthCm: 59.8, // placeholder until measured
    viewingDistanceCm: 60,
    refreshRateHz,
  };

  const ppd = pixelsPerDegree(profile);
  const flicker = nearestFrameLockedRate(8, refreshRateHz);
  const demo = new Staircase({ startValue: 0.5 });
  demo.update(true); demo.update(true); demo.update(true);

  const rows = [
    `Estimated refresh rate: <code>${refreshRateHz} Hz</code>`,
    `Pixels per degree (provisional 59.8 cm @ 60 cm): <code>${ppd.toFixed(1)} px/deg</code>`,
    `4 cpd Gabor wavelength: <code>${wavelengthPx(4, profile).toFixed(1)} px</code>`,
    `Frame-locked flicker nearest 8 Hz: <code>${flicker.rateHz} Hz</code> (${flicker.framesPerHalfCycle} frames/half-cycle)`,
    `Staircase after 3 correct @ 0.5: <code>${demo.value.toFixed(4)}</code> (one 0.1 log step down)`,
    `Flanker spacing at level 0 / 12: <code>${spacingForLevel(0)}λ / ${spacingForLevel(12)}λ</code>`,
    `Mode B1 vergence demand (6 cm panels @ 60 cm): <code>${vergenceDemandDeg({ panelSeparationCm: 6, viewingDistanceCm: 60 }).toFixed(2)}°</code>`,
  ];
  list.innerHTML = rows.map((r) => `<li>${r}</li>`).join("");
}

void selfTest();
