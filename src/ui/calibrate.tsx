/**
 * Calibration wizard — implements docs/calibration.md:
 * size (credit-card or ruler) → distance → refresh (auto) → visual gamma matching →
 * dither verification → save profile.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { db } from "../data/db";
import { fitGamma, type GammaSample } from "../core/gamma";
import { cpdToCyclesPerPx, degToPx, type DisplayProfile } from "../core/visualAngle";
import { GaborRenderer } from "../render/gaborRenderer";
import { measureRefreshRate } from "./measureRefresh";

const CARD_WIDTH_CM = 8.56; // ISO/IEC 7810 ID-1

type Step = "size" | "distance" | "refresh" | "gamma" | "verify" | "save";

/** Gamma matching plan: linear luminance via 0/255 duty-cycle stripes (gamma-independent). */
const GAMMA_LEVELS = [0.25, 0.5, 0.75] as const;
const REPS = 3;

function shuffledPlan(): number[] {
  const plan = GAMMA_LEVELS.flatMap((l) => Array(REPS).fill(l) as number[]);
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [plan[i], plan[j]] = [plan[j]!, plan[i]!];
  }
  return plan;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function drawStripes(canvas: HTMLCanvasElement, linear: number): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  const ctx = canvas.getContext("2d")!;
  // Duty cycle k/4 rows white: mean linear luminance = k/4 exactly (endpoints 0 and 255
  // are gamma-independent).
  const k = Math.round(linear * 4);
  const img = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    const white = y % 4 < k;
    const val = white ? 255 : 0;
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      img.data[i] = val;
      img.data[i + 1] = val;
      img.data[i + 2] = val;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function Calibrate() {
  const [step, setStep] = useState<Step>("size");

  // size
  const [useCard, setUseCard] = useState(true);
  const [cardPxCss, setCardPxCss] = useState(300);
  const [screenWidthCmInput, setScreenWidthCmInput] = useState("");
  const [screenWidthCm, setScreenWidthCm] = useState<number | null>(null);

  // distance
  const [distanceCm, setDistanceCm] = useState("60");

  // refresh
  const [refreshHz, setRefreshHz] = useState<number | null>(null);

  // gamma
  const [plan] = useState<number[]>(shuffledPlan);
  const [matchIndex, setMatchIndex] = useState(0);
  const [dac, setDac] = useState(128);
  const [samplesRaw, setSamplesRaw] = useState<{ level: number; dac: number }[]>([]);
  const [gamma, setGamma] = useState<number | null>(null);
  const stripesRef = useRef<HTMLCanvasElement>(null);

  // verify
  const verifyRef = useRef<HTMLCanvasElement>(null);

  // save
  const [name, setName] = useState("my-device");
  const [saved, setSaved] = useState(false);

  const dpr = window.devicePixelRatio || 1;

  function confirmSize() {
    if (useCard) {
      const pxPerCmMeasured = (cardPxCss * dpr) / CARD_WIDTH_CM;
      setScreenWidthCm((screen.width * dpr) / pxPerCmMeasured);
    } else {
      const v = parseFloat(screenWidthCmInput);
      if (!(v > 5)) return;
      setScreenWidthCm(v);
    }
    setStep("distance");
  }

  useEffect(() => {
    if (step === "refresh" && refreshHz === null) {
      void measureRefreshRate().then(setRefreshHz);
    }
  }, [step, refreshHz]);

  useEffect(() => {
    if (step === "gamma" && stripesRef.current && matchIndex < plan.length) {
      drawStripes(stripesRef.current, plan[matchIndex]!);
    }
  }, [step, matchIndex, plan]);

  function confirmMatch() {
    const level = plan[matchIndex]!;
    const next = [...samplesRaw, { level, dac }];
    setSamplesRaw(next);
    if (matchIndex + 1 < plan.length) {
      setMatchIndex(matchIndex + 1);
      setDac(128);
    } else {
      const samples: GammaSample[] = GAMMA_LEVELS.map((l) => ({
        linear: l,
        dac: median(next.filter((s) => s.level === l).map((s) => s.dac)),
      }));
      const g = fitGamma(samples);
      setGamma(g);
      setStep("verify");
    }
  }

  // Dither verification sweep.
  useEffect(() => {
    if (step !== "verify" || !verifyRef.current || gamma === null || refreshHz === null) return;
    const profile: DisplayProfile = {
      name: "verify",
      horizontalResolutionPx: screen.width * dpr,
      screenWidthCm: screenWidthCm ?? 60,
      viewingDistanceCm: parseFloat(distanceCm) || 60,
      refreshRateHz: refreshHz,
    };
    const r = new GaborRenderer(verifyRef.current, gamma);
    const contrasts = [0.05, 0.02, 0.01, 0.005, 0.003, 0.002];
    const sigmaPx = degToPx(0.5, profile);
    const cpp = cpdToCyclesPerPx(2, profile);
    let raf = 0;
    const loop = () => {
      r.resize();
      const w = r.widthPx;
      const h = r.heightPx;
      r.render(
        contrasts.map((c, i) => ({
          xPx: ((i + 0.5) / contrasts.length) * w,
          yPx: h / 2,
          sigmaPx,
          cyclesPerPx: cpp,
          thetaRad: Math.PI / 2,
          phaseRad: 0,
          contrast: c,
        })),
      );
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      r.dispose();
    };
  }, [step, gamma, refreshHz, screenWidthCm, distanceCm, dpr]);

  async function save() {
    await db.profiles.add({
      name,
      horizontalResolutionPx: screen.width * dpr,
      screenWidthCm: screenWidthCm!,
      viewingDistanceCm: parseFloat(distanceCm) || 60,
      refreshRateHz: refreshHz!,
      gamma: gamma!,
      calibratedAt: new Date().toISOString(),
    });
    setSaved(true);
  }

  return (
    <div class="card">
      <h1>Device calibration</h1>
      <p class="muted">
        Lock screen brightness and disable night-light/auto-brightness first — recalibrate if
        they ever change.
      </p>

      {step === "size" && (
        <section>
          <h2>1 · Screen size</h2>
          <label>
            <input type="checkbox" checked={useCard}
              onChange={(e) => setUseCard(e.currentTarget.checked)} />{" "}
            Use credit-card matching (uncheck to type a ruler measurement)
          </label>
          {useCard ? (
            <div>
              <p>Hold a bank card against the screen and match the box to its width:</p>
              <div class="cardbox" style={{ width: `${cardPxCss}px` }}>85.60 mm</div>
              <input type="range" min="100" max="800" value={cardPxCss}
                onInput={(e) => setCardPxCss(parseInt(e.currentTarget.value))} />
            </div>
          ) : (
            <label>
              Display area width (cm):{" "}
              <input type="number" value={screenWidthCmInput}
                onInput={(e) => setScreenWidthCmInput(e.currentTarget.value)} />
            </label>
          )}
          <p><button onClick={confirmSize}>Next</button></p>
        </section>
      )}

      {step === "distance" && (
        <section>
          <h2>2 · Viewing distance</h2>
          <p>Measure eye-to-screen distance at your training posture (tape measure).</p>
          <label>
            Distance (cm):{" "}
            <input type="number" value={distanceCm}
              onInput={(e) => setDistanceCm(e.currentTarget.value)} />
          </label>
          <p><button onClick={() => setStep("refresh")}>Next</button></p>
        </section>
      )}

      {step === "refresh" && (
        <section>
          <h2>3 · Refresh rate</h2>
          {refreshHz === null ? (
            <p>Measuring…</p>
          ) : (
            <div>
              <p>
                Measured <strong>{refreshHz} Hz</strong>. Confirm this matches your OS display
                settings (a mismatch usually means battery-saver 60 Hz mode or VRR is on).
              </p>
              <p>
                <button onClick={() => setStep("gamma")}>Looks right</button>{" "}
                <button onClick={() => setRefreshHz(null)}>Re-measure</button>
              </p>
            </div>
          )}
        </section>
      )}

      {step === "gamma" && (
        <section>
          <h2>4 · Gamma match {matchIndex + 1} / {plan.length}</h2>
          <p>
            Step back or defocus until the striped patch looks uniform, then adjust the right
            patch until the two match in brightness.
          </p>
          <div class="gammarow">
            <canvas ref={stripesRef} class="gammapatch" />
            <div class="gammapatch" style={{ background: `rgb(${dac},${dac},${dac})` }} />
          </div>
          <input type="range" min="1" max="254" value={dac}
            onInput={(e) => setDac(parseInt(e.currentTarget.value))} />
          <p>
            <button onClick={() => setDac(Math.max(1, dac - 1))}>−1</button>{" "}
            <button onClick={() => setDac(Math.min(254, dac + 1))}>+1</button>{" "}
            <button onClick={confirmMatch}><strong>They match</strong></button>
          </p>
        </section>
      )}

      {step === "verify" && gamma !== null && (
        <section>
          <h2>5 · Verification — γ = {gamma.toFixed(2)}</h2>
          {(gamma < 1.6 || gamma > 3.0) && (
            <p class="warn">
              γ outside the expected 1.6–3.0 range — redo the matching step (check brightness
              and night-light settings).
            </p>
          )}
          <p>
            Patches sweep from contrast 0.05 down to 0.002. They should fade out smoothly —
            any banding or hard rings means gamma is off.
          </p>
          <canvas ref={verifyRef} class="verifycanvas" />
          <p>
            <button onClick={() => setStep("save")}>Smooth — continue</button>{" "}
            <button onClick={() => { setSamplesRaw([]); setMatchIndex(0); setGamma(null); setStep("gamma"); }}>
              Redo gamma
            </button>
          </p>
        </section>
      )}

      {step === "save" && (
        <section>
          <h2>6 · Save profile</h2>
          <ul>
            <li>Screen width: {screenWidthCm?.toFixed(1)} cm</li>
            <li>Distance: {distanceCm} cm</li>
            <li>Refresh: {refreshHz} Hz</li>
            <li>γ: {gamma?.toFixed(3)}</li>
          </ul>
          <label>
            Profile name:{" "}
            <input value={name} onInput={(e) => setName(e.currentTarget.value)} />
          </label>{" "}
          <button onClick={() => void save()} disabled={saved}>Save</button>
          {saved && <p>Saved. <a href="#/play">Start a session →</a></p>}
        </section>
      )}
    </div>
  );
}
