/**
 * Beat Align — Mode A Vernier hyperacuity game (slice 6). Two collinear vertical gratings
 * flash stacked at fixation; the bottom one is shifted LEFT or RIGHT of the top by Δv
 * arcminutes. Answer the shift direction (← / →, or tap the half). Δv runs on two
 * interleaved 3-down/1-up staircases:
 *   track 0 — uncrowded Vernier hyperacuity;
 *   track 1 — crowded Vernier: the same pair flanked left/right at 2λ by two parallel
 *             distractor gratings (contrast 0.6, zero offset) — feature crowding.
 * Contrast is fixed suprathreshold (0.8): this measures POSITIONAL acuity, not contrast.
 * Thresholds are in arcmin; the crowded/uncrowded ratio (VCR) goes to the report.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { db, type EyeCondition, type ProfileRow, type TrialRow } from "../data/db";
import { InterleavedStaircases } from "../core/interleave";
import { cpdToCyclesPerPx, degToPx, isRenderable } from "../core/visualAngle";
import { RAMP_MS, raisedCosine } from "../core/envelope";
import { vernierFlankers, vernierPair } from "../core/vernier";
import {
  dayKey,
  FATIGUE_BREAK_SECONDS,
  fatigueBreaksDue,
  levelProgress,
  sessionMinutes,
  vernierTrialXp,
} from "../core/progression";
import { isWaveBoundary, SHIELD_MAX, waveBonus, waveIndex, WAVE_BREAK_MS } from "../core/waves";
import { GaborRenderer, type GaborParams } from "../render/gaborRenderer";
import { FxLayer } from "../render/fxLayer";
import { Preflight } from "./preflight";
import { Sfx } from "./sfx";
import { readPresets } from "./presets";
import { PlanNav } from "./planNav";

const PLATEAU_MS = 250;
const STIM_MS = 2 * RAMP_MS + PLATEAU_MS; // 350 ms, at fixation → saccade-safe
const RESPONSE_WINDOW_MS = 2500;
const FIX_OFF_LEAD_MS = 100;
const INTERTRIAL_MS = 900;
const EXTENSION_FACTOR = 1.5;
const CATCH_RATE = 0.1;
const DROP_FACTOR = 1.5;

const TARGET_CONTRAST = 0.8;
const SIGMA_LAMBDA = 0.5;
const FLANKER_SPACING = 2;
const FLANKER_CONTRAST = 0.6;
const OFFSET_START = 20;
const OFFSET_MIN = 0.3;
const OFFSET_MAX = 40;

const TRACK_NAMES = ["uncrowded", "crowded (2λ)"] as const;
const HIT_COLOR = 0x88c0d0;
const MISS_COLOR = 0xbf616a;
const BREACH_COLOR = 0xd0677a;

interface SessionResult {
  thresholds: (number | null)[];
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
    /** Contrast-free geometry for every patch; contrast applied per frame via envelope. */
    pair: Omit<GaborParams, "contrast">[];
    flankers: Omit<GaborParams, "contrast">[];
    offsetArcmin: number;
    sign: 1 | -1;
    isCatch: boolean;
    stair: number | null;
    tStart: number;
    onsetAt: number;
    deadline: number;
    answered: boolean;
  } | null;
  nextTrialAt: number | null;
  startedAt: string;
  raf: number;
}

export function BeatAlign() {
  const presets = readPresets();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [cpd, setCpd] = useState(presets.cpd ?? 4);
  const [plannedTrials, setPlannedTrials] = useState(presets.trials ?? 70);
  const [phase, setPhase] = useState<"setup" | "playing" | "done">("setup");
  const [hud, setHud] = useState({
    score: 0, combo: 0, trial: 0, timeFrac: 1, wave: 1, shield: SHIELD_MAX, fixOff: false,
    breakLeft: 0,
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
    const offsetArcmin = stair === null ? OFFSET_START : s.stairs.stairs[stair]!.value;
    const sign: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const sigmaPx = degToPx(SIGMA_LAMBDA / s.cpd, s.profile);
    const common = { sigmaPx, cyclesPerPx: cpdToCyclesPerPx(s.cpd, s.profile), thetaRad: 0, phaseRad: 0 };
    const cx = s.renderer.widthPx / 2;
    const cy = s.renderer.heightPx / 2;
    const g = vernierPair(offsetArcmin, sign, sigmaPx, s.profile);
    const pair = [
      { ...common, xPx: cx + g.top.dx, yPx: cy + g.top.dy },
      { ...common, xPx: cx + g.bottom.dx, yPx: cy + g.bottom.dy },
    ];
    // Crowded track: parallel distractors at ±2λ, zero Vernier offset. Catch trials stay
    // uncrowded (pure lapse probe).
    const flankers =
      stair === 1
        ? vernierFlankers(FLANKER_SPACING, s.cpd, s.profile).map((f) => ({
            ...common,
            xPx: cx + f.dx,
            yPx: cy + f.dy,
          }))
        : [];
    const now = performance.now();
    s.current = {
      pair,
      flankers,
      offsetArcmin,
      sign,
      isCatch,
      stair,
      tStart: now,
      onsetAt: now + FIX_OFF_LEAD_MS,
      deadline: now + FIX_OFF_LEAD_MS + RESPONSE_WINDOW_MS,
      answered: false,
    };
    s.nextTrialAt = null;
    setBanner(null);
    s.sfx.tick();
  }

  function settleTrial(s: LiveState, correct: boolean, rtMs: number | null) {
    const c = s.current;
    if (!c || c.answered) return;
    c.answered = true;

    const dpr = window.devicePixelRatio || 1;
    const fxX = c.pair[1]!.xPx / dpr;
    const fxY = c.pair[1]!.yPx / dpr;
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
    s.xp += vernierTrialXp(c.offsetArcmin, correct, c.isCatch);
    s.trialLog.push({
      index: s.trialLog.length,
      value: c.offsetArcmin, // staircased variable: Vernier offset in arcmin
      correct,
      rtMs,
      isCatch: c.isCatch,
      // Encode the shift direction in the signed angle field: +90 = bottom right, −90 = left.
      thetaDeg: c.sign * 90,
      xPx: Math.round(c.pair[1]!.xPx),
      yPx: Math.round(c.pair[1]!.yPx),
      eccDeg: 0,
      stair: c.stair ?? undefined,
      stimMs: STIM_MS,
      targetContrast: TARGET_CONTRAST,
      flankerContrast: c.flankers.length > 0 ? FLANKER_CONTRAST : undefined,
      spacingLambda: c.flankers.length > 0 ? FLANKER_SPACING : undefined,
      at: new Date().toISOString(),
    });

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
      setBanner({ wave: s.wavesCleared, hits: s.waveHits, misses: s.waveMisses, bonus, perfect,
        breached: s.shield === 0 });
      s.sfx.waveClear();
      s.shield = SHIELD_MAX;
      s.waveHits = 0;
      s.waveMisses = 0;
      s.nextTrialAt = performance.now() + WAVE_BREAK_MS;
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

  /** dir −1 = "bottom shifted left", +1 = "right". */
  function answer(dir: 1 | -1) {
    const s = live.current;
    if (!s || !s.current || s.current.answered) return;
    const now = performance.now();
    if (now < s.current.onsetAt) return;
    settleTrial(s, dir === s.current.sign, now - s.current.onsetAt);
  }

  async function endSession(s: LiveState) {
    cancelAnimationFrame(s.raf);
    const thresholds = s.stairs.thresholds;
    const sessionId = await db.sessions.add({
      profileId: s.profile.id!,
      game: "beat-align",
      mode: "A-monocular",
      eyeCondition: eye,
      startedAt: s.startedAt,
      endedAt: new Date().toISOString(),
      params: {
        cpd: s.cpd,
        sigmaDeg: SIGMA_LAMBDA / s.cpd,
        plannedTrials: s.plannedTrials,
        spacingLambda: FLANKER_SPACING,
      },
      // Headline threshold = uncrowded Vernier offset in ARCMIN (not a contrast; no logCS).
      threshold: thresholds[0] ?? undefined,
      thresholds,
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
    const offsetCfg = {
      startValue: OFFSET_START,
      minValue: OFFSET_MIN,
      maxValue: OFFSET_MAX,
      stepLogInitial: 0.25,
      stepLogFinal: 0.08,
      reversalsToShrink: 2,
      maxReversals: 8,
      thresholdReversals: 6,
    };
    const s: LiveState = {
      stairs: new InterleavedStaircases([offsetCfg, offsetCfg]),
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
        if (now - st.lastFrameAt > DROP_FACTOR * (1000 / st.profile.refreshRateHz)) st.droppedFrames++;
      }
      st.lastFrameAt = now;

      if (st.current && !st.current.answered && now > st.current.deadline) {
        settleTrial(st, false, null);
      }
      if (!st.current && st.nextTrialAt !== null && now >= st.nextTrialAt) {
        startTrial(st);
      }

      let fixOff = false;
      const cur = st.current;
      if (cur && !cur.answered) {
        const env = raisedCosine(now - cur.onsetAt, RAMP_MS, PLATEAU_MS);
        fixOff = now <= cur.onsetAt + STIM_MS;
        if (env > 0) {
          const scene: GaborParams[] = cur.pair.map((g) => ({ ...g, contrast: TARGET_CONTRAST * env }));
          for (const f of cur.flankers) scene.push({ ...f, contrast: FLANKER_CONTRAST * env });
          st.renderer.render(scene);
        } else {
          st.renderer.render([]);
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
          timeFrac: stc.current
            ? Math.max(0, (stc.current.deadline - now) / RESPONSE_WINDOW_MS)
            : 1,
          wave: waveIndex(stc.scoredTrials),
          shield: stc.shield,
          fixOff,
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
  const uncrowded = th[0] ?? null;
  const crowded = th[1] ?? null;
  const vcr = uncrowded !== null && crowded !== null ? crowded / uncrowded : null;

  return (
    <div class={phase === "playing" ? "game-full" : "card"}>
      {phase === "setup" && (
        <section>
          <h1>Beat Align</h1>
          <p class="muted">
            Keep your gaze on the cross. Two short striped bars flash at the cross, one above
            the other. The <strong>bottom</strong> bar is shifted sideways relative to the top
            one — by a lot at first, then by less than a pixel. On some beats two extra bars
            sit to the left and right (crowding); ignore them.
          </p>
          <p>
            <strong>Which way is the bottom bar shifted?</strong><br />
            Press <strong>←</strong> (or tap LEFT) = bottom bar is to the LEFT of the top.<br />
            Press <strong>→</strong> (or tap RIGHT) = bottom bar is to the RIGHT of the top.
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
                <input type="number" min="1" max="12" step="0.5" value={cpd}
                  onInput={(e) => setCpd(parseFloat(e.currentTarget.value) || 4)} />
              </label>
              <label>
                {" "}Trials:{" "}
                <input type="number" min="30" max="200" step="10" value={plannedTrials}
                  onInput={(e) => setPlannedTrials(parseInt(e.currentTarget.value) || 70)} />
              </label>
              <label>
                {" "}<input type="checkbox" checked={soundOn}
                  onChange={(e) => {
                    setSoundOn(e.currentTarget.checked);
                    new Sfx().setEnabled(e.currentTarget.checked);
                  }} /> Sound
              </label>
              <p class="muted">
                Two interleaved staircases: uncrowded and crowded (2λ flankers). Offsets are in
                arcminutes; sub-pixel shifts are rendered exactly. Contrast is fixed at 0.8 —
                this measures positional acuity, not contrast.
              </p>
              <Preflight profile={profiles.find((p) => p.id === profileId)} eye={eye}
                onEye={setEye} distanceOk={distanceOk} onDistanceOk={setDistanceOk} />
              <p>
                <button onClick={() => void start()} disabled={!distanceOk}>Start</button>
                {!distanceOk && <span class="muted"> — confirm the pre-session check first</span>}
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
        {!hud.fixOff && <div class="fixation" aria-hidden="true">+</div>}
        <div class="tiltzone left" aria-hidden="true"><span>⇤</span><small>←</small></div>
        <div class="tiltzone right" aria-hidden="true"><span>⇥</span><small>→</small></div>
        <div class="hud">
          <span>wave {hud.wave}</span>
          <span class="shield" aria-label={`shield ${hud.shield} of ${SHIELD_MAX}`}>
            {Array.from({ length: SHIELD_MAX }, (_, i) => (
              <i key={i} class={i < hud.shield ? "pip on" : "pip"} />
            ))}
          </span>
          <span>score {hud.score}</span>
          <span>combo ×{hud.combo}</span>
          <span>beat {hud.trial}/{plannedTrials}{hud.trial >= plannedTrials ? "+" : ""}</span>
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
            <div class="wavetitle">BAR {banner.wave} {banner.breached ? "DROPPED" : "LANDED"}</div>
            <div class="wavestats">
              {banner.hits}/{banner.hits + banner.misses} beats
              {banner.perfect && <strong> · PERFECT</strong>}
              {banner.bonus > 0 && <> · bonus +{banner.bonus}</>}
            </div>
            <div class="muted">next bar incoming…</div>
          </div>
        )}
      </div>

      {phase === "done" && result && (
        <section>
          <h1>Set complete</h1>
          <ul>
            <li>Score: <strong>{result.score}</strong></li>
            <li>
              Vernier threshold ({TRACK_NAMES[0]}):{" "}
              <strong>{uncrowded !== null ? `${uncrowded.toFixed(2)}′` : "n/c"}</strong>
            </li>
            <li>
              Vernier threshold ({TRACK_NAMES[1]}):{" "}
              <strong>{crowded !== null ? `${crowded.toFixed(2)}′` : "n/c"}</strong>
              {vcr !== null && <> — crowding ratio <strong>{vcr.toFixed(2)}×</strong></>}
            </li>
            <li>Beats: {result.trials} ({result.catches} catch, {result.lapses} lapses)</li>
            <li>Bars landed: {result.waves}</li>
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
              Several easy-offset misses — attention or patch slippage may have contaminated
              this set.
            </p>
          )}
          {result.totalFrames > 0 && result.droppedFrames / result.totalFrames > 0.01 && (
            <p class="warn">
              {result.droppedFrames} of {result.totalFrames} frames ran long (&gt;
              {((result.droppedFrames / result.totalFrames) * 100).toFixed(1)}%) — temporal
              dithering may have been degraded; treat these thresholds with caution.
            </p>
          )}
          <p>
            <a href="#/dashboard">View progress →</a>{" "}
            <button onClick={() => { setPhase("setup"); setResult(null); }}>Play again</button>
          </p>
          <PlanNav />
        </section>
      )}
    </div>
  );
}
