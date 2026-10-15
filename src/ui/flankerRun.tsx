/**
 * Flanker Run — Mode A lateral-masking / crowding game on the Polat protocol
 * (docs/phase2-math.md §6), slice-3 topology: THREE interleaved tracks per session.
 *
 *   Track 0 — Isolated baseline: no flankers, target contrast staircased.
 *   Track 1 — Collinear facilitation: flankers fixed at 3λ (facilitation peak), flanker
 *             contrast 0.50, iso-oriented/iso-phase; target contrast staircased.
 *   Track 2 — Crowding release: target contrast pinned to 2.5× the isolated track's
 *             current level (clamped 0.15–0.90), flanker contrast 0.60; the staircased
 *             variable is the SEPARATION, descending from 6λ toward the envelope-overlap
 *             floor — its threshold is the critical spacing.
 *
 * Each trial is a temporal 2-interval forced choice: two raised-cosine pulses; flankers (if
 * the track has them) appear in both, the target in exactly one. Answer which pulse held
 * the target (← first / → second). 2IFC because iso-oriented flankers would hand the answer
 * to any orientation judgment; "which interval" is criterion-free and leaks nothing.
 * σ = 0.5λ here (vs 1λ in Signal Hunter) so small separations stay physically meaningful.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { db, type EyeCondition, type ProfileRow, type TrialRow } from "../data/db";
import { InterleavedStaircases } from "../core/interleave";
import { cpdToCyclesPerPx, degToPx, isRenderable } from "../core/visualAngle";
import { interactionZone, minSeparationLambda, separationPx } from "../core/polat";
import { RAMP_MS, raisedCosine } from "../core/envelope";
import { flankerContrastFor, pulseContrasts } from "../core/ifc";
import { debugLevel } from "../debug";
import {
  dayKey,
  FATIGUE_BREAK_SECONDS,
  fatigueBreaksDue,
  levelProgress,
  sessionMinutes,
  trialXp,
} from "../core/progression";
import { isWaveBoundary, SHIELD_MAX, waveBonus, waveIndex, WAVE_BREAK_MS } from "../core/waves";
import { GaborRenderer, type GaborParams } from "../render/gaborRenderer";
import { FxLayer } from "../render/fxLayer";
import { Preflight } from "./preflight";
import { Sfx } from "./sfx";

const GAP_MS = 350;
const RESPONSE_WINDOW_MS = 2500;
/** Long enough that a trial boundary cannot be mistaken for the between-pulse gap. */
const INTERTRIAL_MS = 1200;
/** Session auto-extends past the planned count until staircases converge, up to this. */
const EXTENSION_FACTOR = 1.5;
const CATCH_RATE = 0.1;
const CATCH_CONTRAST = 0.8;
const DROP_FACTOR = 1.5;

/** σ in λ units (0.5λ) — gives usable room before the envelope-overlap spacing floor. */
const SIGMA_LAMBDA = 0.5;
/** Track 1: fixed facilitation-peak separation and flanker contrast. */
const FACILITATION_SPACING = 3;
const FLANKER_C_FACIL = 0.5;
/** Track 2: crowding-release constants. */
const FLANKER_C_CROWD = 0.6;
const CROWD_TARGET_FACTOR = 2.5;
const CROWD_TARGET_MIN = 0.15;
const CROWD_TARGET_MAX = 0.9;
const SPACING_START = 6;
const SPACING_MAX = 8;

const TRACK_NAMES = ["isolated", "3λ collinear", "crowding"] as const;

const HIT_COLOR = 0x88c0d0;
const MISS_COLOR = 0xbf616a;
const BREACH_COLOR = 0xd0677a;

interface SessionResult {
  /** [isolated contrast, 3λ contrast, critical spacing λ] — null where not converged. */
  thresholds: (number | null)[];
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

interface LiveState {
  stairs: InterleavedStaircases;
  renderer: GaborRenderer;
  fx: FxLayer;
  sfx: Sfx;
  profile: ProfileRow;
  cpd: number;
  plannedTrials: number;
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
  minutesBefore: number;
  breaksTaken: number;
  breakUntil: number | null;
  lastFrameAt: number | null;
  totalFrames: number;
  droppedFrames: number;
  trialLog: Omit<TrialRow, "sessionId" | "id">[];
  current: {
    // ---- Trial constants: fixed by the staircase track, identical in BOTH pulses ----
    targetContrast: number;
    /** null on the isolated track: no flankers in either pulse. */
    flankerContrast: number | null;
    spacingLambda: number | null;
    targetInterval: 1 | 2;
    // ---- Contrast-free geometry; contrast is applied per pulse in the loop ----
    targetGeom: Omit<GaborParams, "contrast">;
    flankerGeom: Omit<GaborParams, "contrast">[];
    isCatch: boolean;
    stair: number | null;
    /** Staircased variable on this trial (contrast for tracks 0/1, spacing λ for 2). */
    value: number;
    tStart: number;
    answered: boolean;
    respStartedAt: number | null;
    tickedI2: boolean;
    /** Last pulse whose onset was debug-logged (0 = none yet). */
    loggedPulse: 0 | 1 | 2;
  } | null;
  nextTrialAt: number | null;
  startedAt: string;
  raf: number;
}

/**
 * Pulse envelope: 50 ms up / 250 ms plateau / 50 ms down = 350 ms. Longer than Signal
 * Hunter's 250 ms so the peripheral flankers register alongside a bright target; safe here
 * because the stimulus sits AT fixation, so a longer pulse cannot invite a saccade onto it
 * (in Signal Hunter's parafoveal track it could, which is why that game stays at 250 ms).
 */
const PLATEAU_MS = 250;
const PULSE_MS = 2 * RAMP_MS + PLATEAU_MS;
const I2_START = PULSE_MS + GAP_MS;
const RESP_START = I2_START + PULSE_MS;

type TrialPhase = "i1" | "gap" | "i2" | "resp" | "over";

function trialPhase(t: number): TrialPhase {
  if (t < PULSE_MS) return "i1";
  if (t < I2_START) return "gap";
  if (t < RESP_START) return "i2";
  if (t < RESP_START + RESPONSE_WINDOW_MS) return "resp";
  return "over";
}

export function FlankerRun() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [cpd, setCpd] = useState(2);
  const [plannedTrials, setPlannedTrials] = useState(90);
  const [phase, setPhase] = useState<"setup" | "playing" | "done">("setup");
  const [hud, setHud] = useState({
    score: 0, combo: 0, trial: 0, timeFrac: 1, wave: 1, shield: SHIELD_MAX, stimOn: false,
    prompt: false, breakLeft: 0, pulse: 0,
  });
  const [banner, setBanner] = useState<WaveRecap | null>(null);
  const [soundOn, setSoundOn] = useState(() => new Sfx().enabled);
  const [eye, setEye] = useState<EyeCondition>("OD");
  const [distanceOk, setDistanceOk] = useState(false);
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
    const stair = isCatch ? null : s.stairs.pick();
    const thetaSign: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const thetaRad = (thetaSign * Math.PI) / 4;
    const sigmaPx = degToPx(SIGMA_LAMBDA / s.cpd, s.profile);
    const cyclesPerPx = cpdToCyclesPerPx(s.cpd, s.profile);
    const cx = s.renderer.widthPx / 2;
    const cy = s.renderer.heightPx / 2;

    // Per-track stimulus parameters.
    let targetContrast: number;
    let flankerContrast: number | null;
    let spacingLambda: number | null;
    let value: number;
    if (stair === null) {
      // Catch: easy isolated detection — pure lapse probe.
      targetContrast = CATCH_CONTRAST;
      flankerContrast = null;
      spacingLambda = null;
      value = CATCH_CONTRAST;
    } else if (stair === 0) {
      targetContrast = s.stairs.stairs[0]!.value;
      flankerContrast = null;
      spacingLambda = null;
      value = targetContrast;
    } else if (stair === 1) {
      targetContrast = s.stairs.stairs[1]!.value;
      flankerContrast = flankerContrastFor(FLANKER_C_FACIL, targetContrast);
      spacingLambda = FACILITATION_SPACING;
      value = targetContrast;
    } else {
      // Crowding release: spacing is the staircased variable; target rides the isolated
      // track's current level so it stays comfortably visible in isolation.
      spacingLambda = s.stairs.stairs[2]!.value;
      value = spacingLambda;
      targetContrast = Math.min(
        CROWD_TARGET_MAX,
        Math.max(CROWD_TARGET_MIN, CROWD_TARGET_FACTOR * s.stairs.stairs[0]!.value),
      );
      flankerContrast = flankerContrastFor(FLANKER_C_CROWD, targetContrast);
    }

    const common = { sigmaPx, cyclesPerPx, thetaRad, phaseRad: 0 };
    const flankerGeom: Omit<GaborParams, "contrast">[] = [];
    if (flankerContrast !== null && spacingLambda !== null) {
      // Collinear configuration: flankers along the stripe axis, iso-oriented, iso-phase.
      const sepPx = separationPx(spacingLambda, s.cpd, s.profile);
      const ux = -Math.sin(thetaRad);
      const uy = Math.cos(thetaRad);
      flankerGeom.push(
        { ...common, xPx: cx + ux * sepPx, yPx: cy + uy * sepPx },
        { ...common, xPx: cx - ux * sepPx, yPx: cy - uy * sepPx },
      );
    }
    const targetInterval: 1 | 2 = Math.random() < 0.5 ? 1 : 2;
    s.current = {
      targetContrast,
      flankerContrast,
      spacingLambda,
      targetInterval,
      targetGeom: { ...common, xPx: cx, yPx: cy },
      flankerGeom,
      isCatch,
      stair,
      value,
      tStart: performance.now(),
      answered: false,
      respStartedAt: null,
      tickedI2: false,
      loggedPulse: 0,
    };
    s.nextTrialAt = null;
    setBanner(null);
    s.sfx.tick();
    if (debugLevel() > 0) {
      const track = isCatch ? "catch" : stair === null ? "?" : TRACK_NAMES[stair];
      console.log(
        `[FlankerRun] trial ${s.trialLog.length + 1} | track ${track} | target in pulse ${targetInterval} | ` +
          `target C=${targetContrast.toFixed(4)} | flankers ${
            flankerContrast === null ? "NONE" : `C=${flankerContrast.toFixed(2)} ×2 @ ${spacingLambda}λ`
          }`,
      );
    }
  }

  function settleTrial(s: LiveState, correct: boolean, rtMs: number | null) {
    const c = s.current;
    if (!c || c.answered) return;
    c.answered = true;

    const dpr = window.devicePixelRatio || 1;
    const fxX = c.targetGeom.xPx / dpr;
    const fxY = c.targetGeom.yPx / dpr;
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
    if (c.isCatch || c.stair === null) {
      s.catches++;
      if (!correct) s.lapses++;
    } else {
      s.stairs.stairs[c.stair]!.update(correct);
      s.scoredTrials++;
    }
    s.xp += trialXp(c.targetContrast, correct, c.isCatch);
    s.trialLog.push({
      index: s.trialLog.length,
      value: c.value,
      correct,
      rtMs,
      isCatch: c.isCatch,
      thetaDeg: Math.round((c.targetGeom.thetaRad * 180) / Math.PI),
      xPx: Math.round(c.targetGeom.xPx),
      yPx: Math.round(c.targetGeom.yPx),
      eccDeg: 0,
      stair: c.stair ?? undefined,
      stimMs: PULSE_MS,
      spacingLambda: c.spacingLambda ?? undefined,
      targetContrast: c.targetContrast,
      flankerContrast: c.flankerContrast ?? undefined,
      at: new Date().toISOString(),
    });

    // The planned count is a soft target: the session extends until every staircase
    // converges, capped at EXTENSION_FACTOR × planned so a bad day still ends.
    const hardCap = Math.ceil(s.plannedTrials * EXTENSION_FACTOR);
    const finished = s.stairs.done || s.scoredTrials >= hardCap;
    s.current = null;
    if (finished) {
      void endSession(s);
      return;
    }
    if (isWaveBoundary(s.scoredTrials)) {
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
      // 20-20-20 fatigue break at each 15-min cumulative mark, between waves only.
      const elapsedMin = (Date.now() - Date.parse(s.startedAt)) / 60_000;
      if (fatigueBreaksDue(s.minutesBefore + elapsedMin) > s.breaksTaken) {
        s.breaksTaken++;
        s.breakUntil = performance.now() + FATIGUE_BREAK_SECONDS * 1000;
        s.nextTrialAt = s.breakUntil;
      }
    } else {
      s.nextTrialAt = performance.now() + INTERTRIAL_MS;
    }
  }

  /** dir -1 = "first pulse", +1 = "second pulse"; accepted only in the response phase. */
  function answer(dir: 1 | -1) {
    const s = live.current;
    if (!s || !s.current || s.current.answered) return;
    const c = s.current;
    if (trialPhase(performance.now() - c.tStart) !== "resp") return;
    const rt = c.respStartedAt !== null ? performance.now() - c.respStartedAt : null;
    settleTrial(s, (dir === -1 ? 1 : 2) === c.targetInterval, rt);
  }

  async function endSession(s: LiveState) {
    cancelAnimationFrame(s.raf);
    const thresholds = s.stairs.thresholds;
    // Headline threshold/logCS = the ISOLATED track (comparable to Signal Hunter); the
    // facilitation and crowding numbers live in `thresholds` for the clinical metrics.
    const fallbackIso = (() => {
      const vals = s.trialLog
        .filter((t) => !t.isCatch && t.stair === 0)
        .slice(-10)
        .map((t) => t.value);
      if (vals.length === 0) return null;
      const meanLog = vals.reduce((a, v) => a + Math.log10(v), 0) / vals.length;
      return Math.pow(10, meanLog);
    })();
    const isoThreshold = thresholds[0] ?? fallbackIso;
    const logCS = isoThreshold !== null ? -Math.log10(isoThreshold) : null;

    const sessionId = await db.sessions.add({
      profileId: s.profile.id!,
      game: "flanker-run",
      mode: "A-monocular",
      eyeCondition: eye,
      startedAt: s.startedAt,
      endedAt: new Date().toISOString(),
      params: {
        cpd: s.cpd,
        sigmaDeg: SIGMA_LAMBDA / s.cpd,
        plannedTrials: s.plannedTrials,
        spacingLambda: FACILITATION_SPACING,
        flankerFactor: FLANKER_C_FACIL,
      },
      threshold: isoThreshold ?? undefined,
      thresholds,
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
      thresholds,
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

  async function start() {
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
    const sfx = new Sfx();
    sfx.setEnabled(soundOn);
    sfx.unlock();
    const fx = new FxLayer();
    const host = canvasRef.current.parentElement;
    if (host) void fx.init(host);
    const today = dayKey(new Date());
    const minutesBefore = (await db.sessions.toArray())
      .filter((row) => dayKey(new Date(row.startedAt)) === today)
      .reduce((a, row) => a + sessionMinutes(row.startedAt, row.endedAt), 0);
    // Tuning from a 200-seed simulated-observer sweep (see convergence.test.ts): 0.35 log
    // early steps cross the suprathreshold gap fast, 0.1 log steps bracket the threshold;
    // 8 reversals (last 6 averaged) → ≥97% convergence within ~45 trials at moderate
    // thresholds, ~84% at deep ones (the +50% session extension covers the rest).
    const contrastCfg = {
      minValue: 0.002,
      maxValue: 1,
      stepLogInitial: 0.35,
      stepLogFinal: 0.1,
      reversalsToShrink: 2,
      maxReversals: 8,
      thresholdReversals: 6,
    };
    const s: LiveState = {
      stairs: new InterleavedStaircases([
        { ...contrastCfg, startValue: 0.4 }, //              track 0: isolated contrast
        { ...contrastCfg, startValue: 0.4 }, //              track 1: 3λ collinear contrast
        {
          // track 2: separation staircase (λ units), floored at envelope overlap.
          startValue: SPACING_START,
          minValue: Math.max(1.5, minSeparationLambda(SIGMA_LAMBDA)),
          maxValue: SPACING_MAX,
          stepLogInitial: 0.2,
          stepLogFinal: 0.08,
          reversalsToShrink: 2,
          maxReversals: 8,
          thresholdReversals: 6,
        },
      ]),
      renderer,
      fx,
      sfx,
      profile,
      cpd,
      plannedTrials,
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
      minutesBefore,
      breaksTaken: fatigueBreaksDue(minutesBefore),
      breakUntil: null,
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
    setPhase("playing");

    const loop = () => {
      const st = live.current;
      if (!st) return;
      st.renderer.resize();
      const now = performance.now();

      if (st.lastFrameAt !== null) {
        st.totalFrames++;
        const expected = 1000 / st.profile.refreshRateHz;
        if (now - st.lastFrameAt > DROP_FACTOR * expected) st.droppedFrames++;
      }
      st.lastFrameAt = now;

      if (!st.current && st.nextTrialAt !== null && now >= st.nextTrialAt) {
        startTrial(st);
      }

      let stimOn = false;
      let prompt = false;
      let timeFrac = 1;
      let pulseNow = 0;
      const c = st.current;
      if (c && !c.answered) {
        const t = now - c.tStart;
        const ph = trialPhase(t);
        if (ph === "over") {
          settleTrial(st, false, null); // timeout = miss
        } else {
          const scene: GaborParams[] = [];
          if (ph === "i1" || ph === "i2") {
            stimOn = true;
            const pulse: 1 | 2 = ph === "i1" ? 1 : 2;
            pulseNow = pulse;
            const env = raisedCosine(ph === "i1" ? t : t - I2_START, RAMP_MS, PLATEAU_MS);
            // 2IFC schedule (core/ifc, unit-tested): flanker contrast is the trial
            // constant in BOTH pulses; only the target contrast toggles (0 when absent).
            //   L = 0.5 + C_target(pulse)·E(t)·G0 + C_flank·E(t)·[G−1 + G+1]
            const pc = pulseContrasts(c, pulse);
            if (pc.flanker !== null) {
              for (const g of c.flankerGeom) scene.push({ ...g, contrast: pc.flanker * env });
            }
            scene.push({ ...c.targetGeom, contrast: pc.target * env });
            if (c.loggedPulse !== pulse && debugLevel() > 0) {
              c.loggedPulse = pulse;
              console.log(
                `[Pulse ${pulse}] Target Contrast: ${pc.target.toFixed(4)}` +
                  `${pc.target === 0 ? " (absent)" : ""}, Flanker Contrast: ${
                    pc.flanker === null ? "none" : pc.flanker.toFixed(2)
                  } ×${c.flankerGeom.length} @ ${c.spacingLambda ?? "—"}λ | envelope ramps 0→1→0 over ${PULSE_MS} ms`,
              );
            }
            if (ph === "i2" && !c.tickedI2) {
              c.tickedI2 = true;
              st.sfx.tick(true); // second-pulse cue, one-shot, higher pitch than pulse 1
            }
          }
          if (ph === "resp") {
            prompt = true;
            if (c.respStartedAt === null) c.respStartedAt = now;
            timeFrac = Math.max(0, 1 - (now - c.respStartedAt) / RESPONSE_WINDOW_MS);
          }
          st.renderer.render(scene);
        }
      } else {
        st.renderer.render([]);
      }

      const stc = live.current;
      if (stc) {
        setHud({
          score: stc.score,
          combo: stc.combo,
          trial: stc.scoredTrials,
          timeFrac,
          wave: waveIndex(stc.scoredTrials),
          shield: stc.shield,
          stimOn,
          prompt,
          pulse: pulseNow,
          breakLeft:
            stc.breakUntil !== null && now < stc.breakUntil
              ? Math.ceil((stc.breakUntil - now) / 1000)
              : 0,
        });
        stc.raf = requestAnimationFrame(loop);
      }
    };
    s.raf = requestAnimationFrame(loop);
  }

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

  const th = result?.thresholds ?? [];
  const isoT = th[0] ?? null;
  const facilT = th[1] ?? null;
  const critSpacing = th[2] ?? null;
  const fiDb =
    isoT !== null && facilT !== null ? 20 * Math.log10(isoT / facilT) : null;

  return (
    <div class={phase === "playing" ? "game-full" : "card"}>
      {phase === "setup" && (
        <section>
          <h1>Flanker Run</h1>
          <p class="muted">
            Keep your gaze on the center cross. Each gate is <strong>two brief pulses</strong>:
            pulse 1 (low tick, the left "1" marker lights up), a short gap, then pulse 2
            (higher tick, the right "2" marker lights up). On flanked gates <em>both</em>
            pulses show two bright "gate post" patches; on isolated gates there are no posts
            at all. The faint target appears in exactly <strong>ONE</strong> pulse — first or
            second, <strong>at random</strong>.
          </p>
          <p>
            <strong>Which pulse held the target?</strong><br />
            Press <strong>←</strong> (or tap the LEFT half) = it was in <strong>pulse 1</strong>.<br />
            Press <strong>→</strong> (or tap the RIGHT half) = it was in <strong>pulse 2</strong>.<br />
            Answer after pulse 2 ends. If the two pulses looked identical, guess — near your
            threshold that is normal and expected.
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
                <input type="number" min="30" max="240" step="10" value={plannedTrials}
                  onInput={(e) => setPlannedTrials(parseInt(e.currentTarget.value) || 90)} />
              </label>
              <label>
                {" "}<input type="checkbox" checked={soundOn}
                  onChange={(e) => {
                    setSoundOn(e.currentTarget.checked);
                    new Sfx().setEnabled(e.currentTarget.checked);
                  }} /> Sound
              </label>
              <p class="muted">
                One session measures three things at once (randomly interleaved): isolated
                threshold, threshold with collinear 3λ flankers (facilitation), and the
                critical spacing at which flankers start masking a visible target. If the
                staircases haven't converged at the planned count, the session extends
                automatically (up to +50%) until they do.
              </p>
              <Preflight profile={profiles.find((p) => p.id === profileId)} eye={eye}
                onEye={setEye} distanceOk={distanceOk} onDistanceOk={setDistanceOk} />
              <p>
                <button onClick={start} disabled={!distanceOk}>Start</button>
                {!distanceOk && (
                  <span class="muted"> — confirm the pre-session check first</span>
                )}
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
        {!hud.stimOn && <div class="fixation" aria-hidden="true">+</div>}
        <div class={hud.pulse === 1 ? "tiltzone left live" : "tiltzone left"} aria-hidden="true">
          <span>1</span><small>←</small>
        </div>
        <div class={hud.pulse === 2 ? "tiltzone right live" : "tiltzone right"} aria-hidden="true">
          <span>2</span><small>→</small>
        </div>
        {hud.prompt && <div class="ifcprompt" aria-hidden="true">1st or 2nd?</div>}
        <div class="hud">
          <span>wave {hud.wave}</span>
          <span class="shield" aria-label={`shield ${hud.shield} of ${SHIELD_MAX}`}>
            {Array.from({ length: SHIELD_MAX }, (_, i) => (
              <i key={i} class={i < hud.shield ? "pip on" : "pip"} />
            ))}
          </span>
          <span>score {hud.score}</span>
          <span>combo ×{hud.combo}</span>
          <span>
            gate {hud.trial}/{plannedTrials}
            {hud.trial >= plannedTrials ? "+" : ""}
          </span>
          <div class="timebar"><div style={{ width: `${hud.timeFrac * 100}%` }} /></div>
        </div>
        {hud.breakLeft > 0 && (
          <div class="wavebanner">
            <div class="wavetitle">20·20·20 BREAK</div>
            <div class="wavestats">Look at something ~20 feet (6 m) away.</div>
            <div class="muted">resuming in {hud.breakLeft}s</div>
          </div>
        )}
        {banner && hud.breakLeft === 0 && (
          <div class="wavebanner">
            <div class="wavetitle">
              CHECKPOINT {banner.wave} {banner.breached ? "BREACHED" : "CLEARED"}
            </div>
            <div class="wavestats">
              {banner.hits}/{banner.hits + banner.misses} gates
              {banner.perfect && <strong> · PERFECT</strong>}
              {banner.bonus > 0 && <> · bonus +{banner.bonus}</>}
            </div>
            <div class="muted">next stretch incoming…</div>
          </div>
        )}
      </div>

      {phase === "done" && result && (
        <section>
          <h1>Run complete</h1>
          <ul>
            <li>Score: <strong>{result.score}</strong></li>
            <li>
              Isolated threshold ({TRACK_NAMES[0]}):{" "}
              <strong>{isoT !== null ? isoT.toFixed(4) : "n/c"}</strong>
              {result.logCS !== null && <> (logCS {result.logCS.toFixed(2)})</>}
            </li>
            <li>
              {TRACK_NAMES[1]} threshold:{" "}
              <strong>{facilT !== null ? facilT.toFixed(4) : "n/c"}</strong>
              {fiDb !== null && (
                <>
                  {" "}— facilitation index <strong>{fiDb.toFixed(1)} dB</strong>
                  {fiDb > 0 ? " (flankers helped)" : " (flankers masked)"}
                </>
              )}
            </li>
            <li>
              Critical spacing ({TRACK_NAMES[2]}):{" "}
              <strong>{critSpacing !== null ? `${critSpacing.toFixed(2)}λ` : "n/c"}</strong>
              {critSpacing !== null && <> ({interactionZone(critSpacing)} zone)</>}
            </li>
            <li>Gates: {result.trials} ({result.catches} catch, {result.lapses} lapses)</li>
            <li>Checkpoints cleared: {result.waves}</li>
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
              session's thresholds with caution.
            </p>
          )}
          <p>
            <a href="#/dashboard">View progress →</a>{" "}
            <button onClick={() => { setPhase("setup"); setResult(null); }}>Run again</button>
          </p>
        </section>
      )}
    </div>
  );
}
