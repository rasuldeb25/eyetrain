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
import { isWaveBoundary, SHIELD_MAX, waveBonus, waveIndex, WAVE_BREAK_MS } from "../core/waves";
import { GaborRenderer, type GaborParams } from "../render/gaborRenderer";
import { FxLayer } from "../render/fxLayer";
import { Sfx } from "./sfx";

const RESPONSE_WINDOW_MS = 3000;
const INTERTRIAL_MS = 600;
const CATCH_RATE = 0.1;
const CATCH_CONTRAST = 0.8;
/** Targets never appear closer to fixation than this (keeps the marker non-adjacent). */
const MIN_ECC_DEG = 1.5;
/** Frame deltas above this multiple of the display's frame interval count as dropped. */
const DROP_FACTOR = 1.5;

/** Practice trials before the first-ever real session (never logged, never staircased). */
const TUTORIAL_TRIALS = 3;
const TUTORIAL_CONTRAST = 0.8;
/** How long each practice-trial feedback message stays up. */
const TUTORIAL_FEEDBACK_MS = 3200;
/**
 * Scripted practice plan: the first two trials force a tilt/position CONFLICT (the exact
 * confusion the tutorial exists to untrain), the third is unconstrained.
 */
const TUTORIAL_PLAN: { tilt: 1 | -1; side: "left" | "right" | null }[] = [
  { tilt: -1, side: "right" }, // leans left (\) but appears on the right
  { tilt: 1, side: "left" }, //  leans right (/) but appears on the left
  { tilt: Math.random() < 0.5 ? 1 : -1, side: null },
];

const HIT_COLOR = 0x88c0d0;
const MISS_COLOR = 0xbf616a;
const BREACH_COLOR = 0xd0677a;

interface SessionResult {
  threshold: number | null;
  logCS: number | null;
  score: number;
  trials: number;
  lapses: number;
  catches: number;
  xp: number;
  totalXp: number;
  waves: number;
  totalFrames: number;
  droppedFrames: number;
}

interface WaveRecap {
  wave: number;
  hits: number;
  misses: number;
  bonus: number;
  perfect: boolean;
  breached: boolean;
}

interface TutFeedback {
  correct: boolean;
  tilt: 1 | -1;
  side: "left" | "right";
  conflict: boolean;
}

interface LiveState {
  staircase: Staircase;
  renderer: GaborRenderer;
  fx: FxLayer;
  sfx: Sfx;
  profile: ProfileRow;
  /** Practice mode: fixed high contrast, scripted placement, nothing logged or staircased. */
  tutorial: boolean;
  tutCount: number;
  tutEndAt: number | null;
  cpd: number;
  plannedTrials: number;
  maxEccDeg: number;
  scoredTrials: number;
  score: number;
  xp: number;
  combo: number;
  lapses: number;
  catches: number;
  shield: number;
  waveHits: number;
  waveMisses: number;
  wavesCleared: number;
  lastFrameAt: number | null;
  totalFrames: number;
  droppedFrames: number;
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
  const [phase, setPhase] = useState<"setup" | "tutorial" | "playing" | "done">("setup");
  const [tutMsg, setTutMsg] = useState<TutFeedback | null>(null);
  const [hud, setHud] = useState({
    score: 0, combo: 0, trial: 0, timeFrac: 1, wave: 1, shield: SHIELD_MAX,
  });
  const [banner, setBanner] = useState<WaveRecap | null>(null);
  const [soundOn, setSoundOn] = useState(() => new Sfx().enabled);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<LiveState | null>(null);
  /** Set once practice completes so the auto-tutorial doesn't re-trigger the same visit. */
  const tutorialDoneRef = useRef(false);

  useEffect(() => {
    void db.profiles.toArray().then((p) => {
      setProfiles(p);
      if (p.length > 0 && profileId === null) setProfileId(p[0]!.id!);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startTrial(s: LiveState) {
    const plan = s.tutorial ? TUTORIAL_PLAN[s.tutCount] : undefined;
    const isCatch = s.tutorial ? false : Math.random() < CATCH_RATE;
    const contrast = s.tutorial
      ? TUTORIAL_CONTRAST
      : isCatch
        ? CATCH_CONTRAST
        : s.staircase.value;
    const thetaSign: 1 | -1 = plan ? plan.tilt : Math.random() < 0.5 ? 1 : -1;
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
    // Scripted practice trials force the patch onto a given half of the screen (±45° around
    // the horizontal axis) so tilt and position can be put in deliberate conflict.
    const phi = plan?.side
      ? (plan.side === "right" ? 0 : Math.PI) + (Math.random() - 0.5) * (Math.PI / 2)
      : Math.random() * 2 * Math.PI;
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
      // Practice has no time pressure — the point is understanding, not speed.
      deadline: s.tutorial ? Number.POSITIVE_INFINITY : performance.now() + RESPONSE_WINDOW_MS,
      answered: false,
    };
    s.nextTrialAt = null;
    setBanner(null);
    setTutMsg(null);
    s.sfx.tick(); // audio-only onset cue: no location, no answer information
  }

  function settleTrial(s: LiveState, correct: boolean, rtMs: number | null) {
    const c = s.current;
    if (!c || c.answered) return;
    c.answered = true;

    if (s.tutorial) {
      // Practice: feedback only — no staircase, no log, no score/XP/shield.
      s.tutCount++;
      const side = c.gabor.xPx > s.renderer.widthPx / 2 ? "right" : "left";
      const tiltMatchesSide = (c.thetaSign === 1) === (side === "right");
      setTutMsg({ correct, tilt: c.thetaSign, side, conflict: !tiltMatchesSide });
      const dpr = window.devicePixelRatio || 1;
      if (correct) {
        s.fx.burst(c.gabor.xPx / dpr, c.gabor.yPx / dpr, HIT_COLOR);
        s.sfx.hit(1);
      } else {
        s.sfx.miss();
      }
      s.current = null;
      if (s.tutCount >= TUTORIAL_TRIALS) {
        s.tutEndAt = performance.now() + TUTORIAL_FEEDBACK_MS;
      } else {
        s.nextTrialAt = performance.now() + TUTORIAL_FEEDBACK_MS;
      }
      return;
    }

    if (c.isCatch) {
      s.catches++;
      if (!correct) s.lapses++;
    } else {
      s.staircase.update(correct);
      s.scoredTrials++;
    }
    // Fidelity note: everything below runs AFTER the trial settles — the next render()
    // clears the Gabor, so overlay effects never coincide with a live stimulus.
    const dpr = window.devicePixelRatio || 1;
    const fxX = c.gabor.xPx / dpr;
    const fxY = c.gabor.yPx / dpr;
    let gained = 0;
    if (correct) {
      s.combo++;
      gained = Math.round(100 * (1 + 0.1 * (s.combo - 1)));
      s.score += gained;
      s.waveHits++;
      s.fx.burst(fxX, fxY, HIT_COLOR);
      s.fx.pop(fxX, fxY, `+${gained}`, HIT_COLOR);
      s.sfx.hit(s.combo);
    } else {
      s.combo = 0;
      s.waveMisses++;
      const hadShield = s.shield > 0;
      s.shield = Math.max(0, s.shield - 1);
      if (hadShield && s.shield === 0) {
        s.fx.edgeFlash(BREACH_COLOR);
        s.sfx.breach();
      } else {
        s.fx.edgeFlash(MISS_COLOR);
        s.sfx.miss();
      }
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
      return;
    }
    if (isWaveBoundary(s.scoredTrials)) {
      // Wave complete: bonus, recap banner, longer pause (micro-break). Cosmetic only —
      // the staircase and trial schedule are untouched.
      const perfect = s.waveMisses === 0;
      const bonus = waveBonus(s.shield, perfect);
      s.score += bonus;
      s.wavesCleared++;
      setBanner({
        wave: s.wavesCleared,
        hits: s.waveHits,
        misses: s.waveMisses,
        bonus,
        perfect,
        breached: s.shield === 0,
      });
      s.sfx.waveClear();
      s.shield = SHIELD_MAX;
      s.waveHits = 0;
      s.waveMisses = 0;
      s.nextTrialAt = performance.now() + WAVE_BREAK_MS;
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
      waves: s.wavesCleared,
      totalFrames: s.totalFrames,
      droppedFrames: s.droppedFrames,
    });
    await db.trials.bulkAdd(s.trialLog.map((t) => ({ ...t, sessionId: sessionId as number })));
    const totalXp = (await db.sessions.toArray()).reduce((a, row) => a + (row.xp ?? 0), 0);

    s.renderer.dispose();
    s.fx.dispose();
    s.sfx.dispose();
    setBanner(null);
    setResult({
      threshold,
      logCS,
      score: s.score,
      trials: s.trialLog.length,
      lapses: s.lapses,
      catches: s.catches,
      xp: s.xp,
      totalXp,
      waves: s.wavesCleared,
      totalFrames: s.totalFrames,
      droppedFrames: s.droppedFrames,
    });
    live.current = null;
    setPhase("done");
  }

  async function start(tutorialRequested: boolean) {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile || !canvasRef.current) return;
    if (!isRenderable(cpd, profile)) {
      setError(`${cpd} cpd is beyond this display's Nyquist limit — lower the frequency.`);
      return;
    }
    setError(null);
    // First-ever session on this device: run the practice automatically.
    let tutorial = tutorialRequested;
    if (!tutorial && !tutorialDoneRef.current && (await db.sessions.count()) === 0) {
      tutorial = true;
    }
    let renderer: GaborRenderer;
    try {
      renderer = new GaborRenderer(canvasRef.current, profile.gamma);
    } catch (e) {
      setError(String(e));
      return;
    }
    const sfx = new Sfx();
    sfx.setEnabled(soundOn);
    sfx.unlock(); // we are inside the Start-button gesture
    const fx = new FxLayer();
    const host = canvasRef.current.parentElement;
    if (host) void fx.init(host); // async; effects before ready are dropped harmlessly
    const s: LiveState = {
      staircase: new Staircase({
        startValue: 0.4,
        minValue: 0.002,
        maxValue: 1,
        maxReversals: 10,
        thresholdReversals: 6,
      }),
      renderer,
      fx,
      sfx,
      profile,
      tutorial,
      tutCount: 0,
      tutEndAt: null,
      cpd,
      plannedTrials,
      maxEccDeg,
      scoredTrials: 0,
      score: 0,
      xp: 0,
      combo: 0,
      lapses: 0,
      catches: 0,
      shield: SHIELD_MAX,
      waveHits: 0,
      waveMisses: 0,
      wavesCleared: 0,
      lastFrameAt: null,
      totalFrames: 0,
      droppedFrames: 0,
      trialLog: [],
      current: null,
      nextTrialAt: performance.now() + 800,
      startedAt: new Date().toISOString(),
      raf: 0,
    };
    live.current = s;
    setPhase(tutorial ? "tutorial" : "playing");

    const loop = () => {
      const st = live.current;
      if (!st) return;
      st.renderer.resize();
      const now = performance.now();

      // Frame-timing fidelity monitor: dropped frames invalidate temporal dithering.
      if (st.lastFrameAt !== null) {
        st.totalFrames++;
        const expected = 1000 / st.profile.refreshRateHz;
        if (now - st.lastFrameAt > DROP_FACTOR * expected) st.droppedFrames++;
      }
      st.lastFrameAt = now;

      // Practice complete: tear down and hand off to the real session.
      if (st.tutorial && st.tutEndAt !== null && now >= st.tutEndAt) {
        tutorialDoneRef.current = true;
        cancelAnimationFrame(st.raf);
        st.sfx.waveClear();
        setTimeout(() => st.sfx.dispose(), 1000); // let the jingle finish first
        st.renderer.dispose();
        st.fx.dispose();
        live.current = null;
        setTutMsg(null);
        void start(false);
        return;
      }

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
          timeFrac:
            stc.current && Number.isFinite(stc.current.deadline)
              ? Math.max(0, (stc.current.deadline - now) / RESPONSE_WINDOW_MS)
              : 1,
          wave: waveIndex(stc.scoredTrials),
          shield: stc.shield,
        });
        stc.raf = requestAnimationFrame(loop);
      }
    };
    s.raf = requestAnimationFrame(loop);
  }

  // Keyboard input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "playing" && phase !== "tutorial") return;
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
        s.fx.dispose();
        s.sfx.dispose();
        live.current = null;
      }
    },
    [],
  );

  return (
    <div class={phase === "playing" || phase === "tutorial" ? "game-full" : "card"}>
      {phase === "setup" && (
        <section>
          <h1>Signal Hunter</h1>
          <p class="muted">
            Mode A: patch your <strong>left</strong> eye now. Keep your gaze on the central
            cross; a faint striped patch will appear somewhere around it.
          </p>
          <p>
            <strong>Answer the tilt, not the position.</strong> Do <strong>NOT</strong> press
            based on where the patch appears — press based only on which way its stripes
            lean: ← if they lean left (&#92;), → if they lean right (/). On touch screens tap
            the left/right half — again by lean, not location.
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
              <label>
                {" "}<input type="checkbox" checked={soundOn}
                  onChange={(e) => {
                    setSoundOn(e.currentTarget.checked);
                    new Sfx().setEnabled(e.currentTarget.checked);
                  }} /> Sound
              </label>
              <p>
                <button onClick={() => void start(false)}>Start</button>{" "}
                <button onClick={() => void start(true)}>Practice first (3 trials)</button>
              </p>
              <p class="muted">
                Your first-ever session on a device begins with the short practice
                automatically. Start low (1–3 cpd) while acuity is limited; raise frequency
                as thresholds improve across weeks.
              </p>
            </div>
          )}
          {error && <p class="warn">{error}</p>}
        </section>
      )}

      <div style={{ display: phase === "playing" || phase === "tutorial" ? "block" : "none" }}
        class="gamewrap">
        <canvas ref={canvasRef} class="gamecanvas"
          onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            answer(e.clientX - rect.left < rect.width / 2 ? -1 : 1);
          }}
        />
        <div class="fixation" aria-hidden="true">+</div>
        {/* Peripheral key reminders: answer by LEAN. Dim and at the screen edges, well
            outside the target annulus, so they never distract from a threshold stimulus. */}
        <div class="tiltzone left" aria-hidden="true">
          <span>&#92;</span><small>←</small>
        </div>
        <div class="tiltzone right" aria-hidden="true">
          <span>/</span><small>→</small>
        </div>
        {phase === "tutorial" ? (
          <div class="hud">
            <span>PRACTICE</span>
            <span>trial {Math.min((live.current?.tutCount ?? 0) + (tutMsg ? 0 : 1), TUTORIAL_TRIALS)}/{TUTORIAL_TRIALS}</span>
            <span class="muted">answer the lean, not the location</span>
          </div>
        ) : (
        <div class="hud">
          <span>wave {hud.wave}</span>
          <span class="shield" aria-label={`shield ${hud.shield} of ${SHIELD_MAX}`}>
            {Array.from({ length: SHIELD_MAX }, (_, i) => (
              <i key={i} class={i < hud.shield ? "pip on" : "pip"} />
            ))}
          </span>
          <span>score {hud.score}</span>
          <span>combo ×{hud.combo}</span>
          <span>trial {hud.trial}/{plannedTrials}</span>
          <div class="timebar"><div style={{ width: `${hud.timeFrac * 100}%` }} /></div>
        </div>
        )}
        {tutMsg && (
          <div class="wavebanner">
            <div class="wavetitle">{tutMsg.correct ? "✓ CORRECT" : "✗ NOT QUITE"}</div>
            <div class="wavestats">
              The stripes leaned <strong>{tutMsg.tilt === -1 ? "LEFT (\\)" : "RIGHT (/)"}</strong>
              {tutMsg.conflict && <> — even though the patch sat on the {tutMsg.side} side</>}
            </div>
            <div class="muted">
              {tutMsg.conflict
                ? "Position never matters. Only the lean of the stripes counts."
                : "Answer the lean of the stripes, never their location."}
            </div>
          </div>
        )}
        {banner && (
          <div class="wavebanner">
            <div class="wavetitle">
              WAVE {banner.wave} {banner.breached ? "BREACHED" : "CLEARED"}
            </div>
            <div class="wavestats">
              {banner.hits}/{banner.hits + banner.misses} signals
              {banner.perfect && <strong> · PERFECT</strong>}
              {banner.bonus > 0 && <> · bonus +{banner.bonus}</>}
            </div>
            <div class="muted">next wave incoming…</div>
          </div>
        )}
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
            <li>Waves cleared: {result.waves}</li>
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
          {result.totalFrames > 0 && result.droppedFrames / result.totalFrames > 0.01 && (
            <p class="warn">
              {result.droppedFrames} of {result.totalFrames} frames ran long (&gt;
              {((result.droppedFrames / result.totalFrames) * 100).toFixed(1)}%) — temporal
              dithering may have been degraded; close background apps and treat this
              session's threshold with caution.
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
