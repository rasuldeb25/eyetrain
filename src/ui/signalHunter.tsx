/**
 * Signal Hunter — Mode A (left eye patched) Gabor orientation-discrimination game.
 * A target Gabor appears at a staircased contrast somewhere on screen; it is tilted ±45°.
 * Answer its tilt (← / → keys, or tap the left/right half) before the timer runs out.
 * The 3-down/1-up staircase on contrast IS the difficulty curve; ~10% catch trials at high
 * contrast check lapse rate and are excluded from the staircase.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { db, type ProfileRow, type TrialRow } from "../data/db";
import { Staircase } from "../core/staircase";
import { cpdToCyclesPerPx, degToPx, isRenderable, pxToDeg } from "../core/visualAngle";
import { levelProgress, trialXp } from "../core/progression";
import { GaborRenderer, type GaborParams } from "../render/gaborRenderer";

const RESPONSE_WINDOW_MS = 3000;
const INTERTRIAL_MS = 600;
const CATCH_RATE = 0.1;
const CATCH_CONTRAST = 0.8;
/** Targets never appear closer to fixation than this (keeps the marker non-adjacent). */
const MIN_ECC_DEG = 1.5;

interface SessionResult {
  threshold: number | null;
  logCS: number | null;
  score: number;
  trials: number;
  lapses: number;
  catches: number;
  xp: number;
  totalXp: number;
}

interface LiveState {
  staircase: Staircase;
  renderer: GaborRenderer;
  profile: ProfileRow;
  cpd: number;
  plannedTrials: number;
  maxEccDeg: number;
  scoredTrials: number;
  score: number;
  xp: number;
  combo: number;
  lapses: number;
  catches: number;
  trialLog: Omit<TrialRow, "sessionId" | "id">[];
  current: {
    gabor: GaborParams;
    isCatch: boolean;
    thetaSign: 1 | -1;
    eccDeg: number;
    shownAt: number;
    deadline: number;
    answered: boolean;
  } | null;
  nextTrialAt: number | null;
  startedAt: string;
  raf: number;
}

export function SignalHunter() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [cpd, setCpd] = useState(2);
  const [plannedTrials, setPlannedTrials] = useState(40);
  const [maxEccDeg, setMaxEccDeg] = useState(8);
  const [phase, setPhase] = useState<"setup" | "playing" | "done">("setup");
  const [hud, setHud] = useState({ score: 0, combo: 0, trial: 0, timeFrac: 1 });
  const [result, setResult] = useState<SessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<LiveState | null>(null);

  useEffect(() => {
    void db.profiles.toArray().then((p) => {
      setProfiles(p);
      if (p.length > 0 && profileId === null) setProfileId(p[0]!.id!);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startTrial(s: LiveState) {
    const isCatch = Math.random() < CATCH_RATE;
    const contrast = isCatch ? CATCH_CONTRAST : s.staircase.value;
    const thetaSign: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const sigmaPx = degToPx(1 / s.cpd, s.profile); // sigma = one wavelength
    const margin = sigmaPx * 4 + 10;
    const w = s.renderer.widthPx;
    const h = s.renderer.heightPx;
    // Place the target in an annulus around central fixation: controlled eccentricity
    // (logged per trial) instead of uniform-anywhere. Radius is capped so the whole
    // envelope stays on screen; sampling is uniform over the annulus area.
    const rMaxFit = Math.max(1, Math.min(w, h) / 2 - margin);
    const rMax = Math.min(degToPx(s.maxEccDeg, s.profile), rMaxFit);
    const rMin = Math.min(degToPx(MIN_ECC_DEG, s.profile), rMax * 0.5);
    const rPx = Math.sqrt(Math.random() * (rMax * rMax - rMin * rMin) + rMin * rMin);
    const phi = Math.random() * 2 * Math.PI;
    const xPx = w / 2 + rPx * Math.cos(phi);
    const yPx = h / 2 + rPx * Math.sin(phi);
    const eccDeg = pxToDeg(rPx, s.profile);
    s.current = {
      gabor: {
        xPx,
        yPx,
        sigmaPx,
        cyclesPerPx: cpdToCyclesPerPx(s.cpd, s.profile),
        thetaRad: (thetaSign * Math.PI) / 4,
        phaseRad: Math.random() * 2 * Math.PI,
        contrast,
      },
      isCatch,
      thetaSign,
      eccDeg,
      shownAt: performance.now(),
      deadline: performance.now() + RESPONSE_WINDOW_MS,
      answered: false,
    };
    s.nextTrialAt = null;
  }

  function settleTrial(s: LiveState, correct: boolean, rtMs: number | null) {
    const c = s.current;
    if (!c || c.answered) return;
    c.answered = true;

    if (c.isCatch) {
      s.catches++;
      if (!correct) s.lapses++;
    } else {
      s.staircase.update(correct);
      s.scoredTrials++;
    }
    if (correct) {
      s.combo++;
      s.score += Math.round(100 * (1 + 0.1 * (s.combo - 1)));
    } else {
      s.combo = 0;
    }
    s.xp += trialXp(c.gabor.contrast, correct, c.isCatch);
    s.trialLog.push({
      index: s.trialLog.length,
      value: c.gabor.contrast,
      correct,
      rtMs,
      isCatch: c.isCatch,
      thetaDeg: c.thetaSign * 45,
      xPx: Math.round(c.gabor.xPx),
      yPx: Math.round(c.gabor.yPx),
      eccDeg: Math.round(c.eccDeg * 100) / 100,
      at: new Date().toISOString(),
    });

    const finished = s.staircase.done || s.scoredTrials >= s.plannedTrials;
    s.current = null;
    if (finished) {
      void endSession(s);
    } else {
      s.nextTrialAt = performance.now() + INTERTRIAL_MS;
    }
  }

  function answer(dir: 1 | -1) {
    const s = live.current;
    if (!s || !s.current || s.current.answered) return;
    const rt = performance.now() - s.current.shownAt;
    settleTrial(s, dir === s.current.thetaSign, rt);
  }

  async function endSession(s: LiveState) {
    cancelAnimationFrame(s.raf);
    const fallback = (() => {
      const vals = s.trialLog.filter((t) => !t.isCatch).slice(-10).map((t) => t.value);
      if (vals.length === 0) return null;
      const meanLog = vals.reduce((a, v) => a + Math.log10(v), 0) / vals.length;
      return Math.pow(10, meanLog);
    })();
    const threshold = s.staircase.threshold ?? fallback;
    const logCS = threshold !== null ? -Math.log10(threshold) : null;

    const sessionId = await db.sessions.add({
      profileId: s.profile.id!,
      game: "signal-hunter",
      mode: "A-monocular",
      startedAt: s.startedAt,
      endedAt: new Date().toISOString(),
      params: { cpd: s.cpd, sigmaDeg: 1 / s.cpd, plannedTrials: s.plannedTrials },
      threshold: threshold ?? undefined,
      logCS: logCS ?? undefined,
      trialCount: s.trialLog.length,
      score: s.score,
      xp: s.xp,
    });
    await db.trials.bulkAdd(s.trialLog.map((t) => ({ ...t, sessionId: sessionId as number })));
    const totalXp = (await db.sessions.toArray()).reduce((a, row) => a + (row.xp ?? 0), 0);

    s.renderer.dispose();
    setResult({
      threshold,
      logCS,
      score: s.score,
      trials: s.trialLog.length,
      lapses: s.lapses,
      catches: s.catches,
      xp: s.xp,
      totalXp,
    });
    live.current = null;
    setPhase("done");
  }

  function start() {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile || !canvasRef.current) return;
    if (!isRenderable(cpd, profile)) {
      setError(`${cpd} cpd is beyond this display's Nyquist limit — lower the frequency.`);
      return;
    }
    setError(null);
    let renderer: GaborRenderer;
    try {
      renderer = new GaborRenderer(canvasRef.current, profile.gamma);
    } catch (e) {
      setError(String(e));
      return;
    }
    const s: LiveState = {
      staircase: new Staircase({
        startValue: 0.4,
        minValue: 0.002,
        maxValue: 1,
        maxReversals: 10,
        thresholdReversals: 6,
      }),
      renderer,
      profile,
      cpd,
      plannedTrials,
      maxEccDeg,
      scoredTrials: 0,
      score: 0,
      xp: 0,
      combo: 0,
      lapses: 0,
      catches: 0,
      trialLog: [],
      current: null,
      nextTrialAt: performance.now() + 800,
      startedAt: new Date().toISOString(),
      raf: 0,
    };
    live.current = s;
    setPhase("playing");

    const loop = () => {
      const st = live.current;
      if (!st) return;
      st.renderer.resize();
      const now = performance.now();

      if (st.current && !st.current.answered && now > st.current.deadline) {
        settleTrial(st, false, null); // timeout = miss
      }
      if (!st.current && st.nextTrialAt !== null && now >= st.nextTrialAt) {
        startTrial(st);
      }
      // Re-render every frame: the dither reseeds per frame (temporal dithering).
      st.renderer.render(st.current ? [st.current.gabor] : []);

      const stc = live.current; // endSession may have nulled it inside settleTrial
      if (stc) {
        setHud({
          score: stc.score,
          combo: stc.combo,
          trial: stc.scoredTrials,
          timeFrac: stc.current
            ? Math.max(0, (stc.current.deadline - now) / RESPONSE_WINDOW_MS)
            : 1,
        });
        stc.raf = requestAnimationFrame(loop);
      }
    };
    s.raf = requestAnimationFrame(loop);
  }

  // Keyboard input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "playing") return;
      if (e.key === "ArrowLeft") answer(-1);
      if (e.key === "ArrowRight") answer(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Cleanup on unmount.
  useEffect(
    () => () => {
      const s = live.current;
      if (s) {
        cancelAnimationFrame(s.raf);
        s.renderer.dispose();
        live.current = null;
      }
    },
    [],
  );

  return (
    <div class={phase === "playing" ? "game-full" : "card"}>
      {phase === "setup" && (
        <section>
          <h1>Signal Hunter</h1>
          <p class="muted">
            Mode A: patch your <strong>left</strong> eye now. Keep your gaze on the central
            cross; a faint tilted patch will appear around it — press ← if it tilts left (\\),
            → if it tilts right (/). On touch screens tap the left/right half.
          </p>
          {profiles.length === 0 ? (
            <p>
              No calibrated device. <a href="#/calibrate">Calibrate first.</a>
            </p>
          ) : (
            <div>
              <label>
                Device:{" "}
                <select onChange={(e) => setProfileId(parseInt(e.currentTarget.value))}>
                  {profiles.map((p) => (
                    <option value={p.id} selected={p.id === profileId}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label>
                {" "}Spatial frequency (cpd):{" "}
                <input type="number" min="0.5" max="16" step="0.5" value={cpd}
                  onInput={(e) => setCpd(parseFloat(e.currentTarget.value) || 2)} />
              </label>
              <label>
                {" "}Trials:{" "}
                <input type="number" min="20" max="120" step="10" value={plannedTrials}
                  onInput={(e) => setPlannedTrials(parseInt(e.currentTarget.value) || 40)} />
              </label>
              <label>
                {" "}Max eccentricity (°):{" "}
                <input type="number" min="3" max="20" step="1" value={maxEccDeg}
                  onInput={(e) => setMaxEccDeg(parseFloat(e.currentTarget.value) || 8)} />
              </label>
              <p><button onClick={start}>Start</button></p>
              <p class="muted">
                Start low (1–3 cpd) while acuity is limited; raise frequency as thresholds
                improve across weeks.
              </p>
            </div>
          )}
          {error && <p class="warn">{error}</p>}
        </section>
      )}

      <div style={{ display: phase === "playing" ? "block" : "none" }} class="gamewrap">
        <canvas ref={canvasRef} class="gamecanvas"
          onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            answer(e.clientX - rect.left < rect.width / 2 ? -1 : 1);
          }}
        />
        <div class="fixation" aria-hidden="true">+</div>
        <div class="hud">
          <span>score {hud.score}</span>
          <span>combo ×{hud.combo}</span>
          <span>trial {hud.trial}/{plannedTrials}</span>
          <div class="timebar"><div style={{ width: `${hud.timeFrac * 100}%` }} /></div>
        </div>
      </div>

      {phase === "done" && result && (
        <section>
          <h1>Session complete</h1>
          <ul>
            <li>Score: <strong>{result.score}</strong></li>
            <li>
              Contrast threshold:{" "}
              <strong>{result.threshold !== null ? result.threshold.toFixed(4) : "n/a"}</strong>
              {result.logCS !== null && <> (logCS {result.logCS.toFixed(2)})</>}
            </li>
            <li>Trials: {result.trials} ({result.catches} catch, {result.lapses} lapses)</li>
            <li>
              XP earned: <strong>+{result.xp}</strong>{" "}
              {(() => {
                const p = levelProgress(result.totalXp);
                const before = levelProgress(result.totalXp - result.xp);
                return (
                  <>
                    — level {p.level}
                    {p.level > before.level && <strong> (level up!)</strong>}
                    , {p.intoLevel}/{p.needed} to next
                  </>
                );
              })()}
            </li>
          </ul>
          {result.lapses > 1 && (
            <p class="warn">
              Several high-contrast misses — attention or patch slippage may have contaminated
              this run.
            </p>
          )}
          <p>
            <a href="#/dashboard">View progress →</a>{" "}
            <button onClick={() => { setPhase("setup"); setResult(null); }}>Play again</button>
          </p>
        </section>
      )}
    </div>
  );
}
