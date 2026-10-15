/**
 * One-page printable optometrist report (#/report). Everything is computed from the raw
 * trial log at render time: Weibull fits with bootstrap CIs per spatial frequency
 * (core/psychometrics), composite metrics (core/clinicalMetrics), compliance from the
 * session log. Print CSS strips the app chrome to clean black-on-white for a single
 * A4/Letter page — "Print → Save as PDF" is the handoff for the 6-week check.
 */
import { useEffect, useState } from "preact/hooks";
import { db, type ProfileRow, type SessionRow, type TrialRow } from "../data/db";
import { fitWeibull2AFC, responseBias, type WeibullFit } from "../core/psychometrics";
import {
  aulcsf,
  criticalSpacingDeg,
  facilitationIndexDb,
  interocularRatio,
  median,
  type CsfPoint,
} from "../core/clinicalMetrics";
import {
  DAILY_CAP_MIN,
  DAILY_GOAL_MIN,
  dayKey,
  sessionMinutes,
  WEEKLY_GOAL_DAYS,
} from "../core/progression";
import { pixelsPerDegree } from "../core/visualAngle";

const BOOTSTRAP = 200;
const WEEK_MS = 7 * 86_400_000;

interface CsfSeries {
  label: string;
  cls: string;
  points: { cpd: number; fit: WeibullFit }[];
  aulcsf: number | null;
}

interface ReportData {
  profile: ProfileRow | null;
  firstDay: string;
  lastDay: string;
  trainingDays: number;
  weeksSpanned: number;
  avgDaysPerWeek: number;
  medianMinPerDay: number | null;
  fidelityPassRate: number | null;
  series: CsfSeries[];
  trend: { cpd: number; points: { day: string; logCS: number }[] }[];
  latestFit: { cpd: number; fit: WeibullFit } | null;
  flanker: {
    cpd: number;
    day: string;
    iso: number | null;
    facil: number | null;
    fiDb: number | null;
    critLambda: number | null;
    critDeg: number | null;
  }[];
  medianRtMs: number | null;
  bias: { c: number } | null;
  totalSessions: number;
}

/** Group signal-hunter trials by cpd and fit each group with enough data. */
function fitByCpd(
  trials: { cpd: number; value: number; correct: boolean }[],
): { cpd: number; fit: WeibullFit }[] {
  const byCpd = new Map<number, { value: number; correct: boolean }[]>();
  for (const t of trials) {
    if (!byCpd.has(t.cpd)) byCpd.set(t.cpd, []);
    byCpd.get(t.cpd)!.push(t);
  }
  const out: { cpd: number; fit: WeibullFit }[] = [];
  for (const [cpd, ts] of byCpd) {
    if (ts.length < 30) continue;
    try {
      out.push({
        cpd,
        fit: fitWeibull2AFC(
          ts.map((t) => ({ contrast: t.value, correct: t.correct })),
          { bootstrap: BOOTSTRAP },
        ),
      });
    } catch {
      /* not fittable — skip */
    }
  }
  return out.sort((a, b) => a.cpd - b.cpd);
}

async function buildReport(): Promise<ReportData> {
  const [profiles, sessions, trials] = await Promise.all([
    db.profiles.toArray(),
    db.sessions.toArray(),
    db.trials.toArray(),
  ]);
  const sessById = new Map(sessions.map((s) => [s.id!, s]));
  const sorted = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const firstDay = sorted[0]?.startedAt.slice(0, 10) ?? "—";
  const lastDay = sorted[sorted.length - 1]?.startedAt.slice(0, 10) ?? "—";

  // Compliance.
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    const d = dayKey(new Date(s.startedAt));
    byDay.set(d, (byDay.get(d) ?? 0) + sessionMinutes(s.startedAt, s.endedAt));
  }
  const trainingDays = byDay.size;
  const spanMs = sorted.length > 0
    ? Date.parse(sorted[sorted.length - 1]!.startedAt) - Date.parse(sorted[0]!.startedAt)
    : 0;
  const weeksSpanned = Math.max(1, spanMs / WEEK_MS);
  const monitored = sessions.filter((s) => (s.totalFrames ?? 0) > 0);
  const fidelityPassRate = monitored.length > 0
    ? monitored.filter((s) => (s.droppedFrames ?? 0) / s.totalFrames! <= 0.01).length /
      monitored.length
    : null;

  // Joined trial rows (non-catch) with session context.
  const joined = trials
    .filter((t) => !t.isCatch)
    .map((t) => {
      const s = sessById.get(t.sessionId);
      return s
        ? {
            t,
            game: s.game,
            eye: s.eyeCondition ?? "OD",
            cpd: s.params.cpd,
            at: Date.parse(s.startedAt),
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const hunter = joined.filter((x) => x.game === "signal-hunter");
  const now = Date.now();
  const t0 = sorted.length > 0 ? Date.parse(sorted[0]!.startedAt) : now;
  const pick = (xs: typeof hunter) =>
    xs.map((x) => ({ cpd: x.cpd, value: x.t.value, correct: x.t.correct }));

  const seriesDefs: { label: string; cls: string; rows: typeof hunter }[] = [
    {
      label: "OD week 1 (baseline)",
      cls: "s-base",
      rows: hunter.filter((x) => x.eye === "OD" && x.at < t0 + WEEK_MS),
    },
    {
      label: "OD current (last 7 days)",
      cls: "s-cur",
      rows: hunter.filter((x) => x.eye === "OD" && x.at > now - WEEK_MS),
    },
    { label: "OS fellow eye", cls: "s-os", rows: hunter.filter((x) => x.eye === "OS") },
  ];
  const series: CsfSeries[] = seriesDefs
    .map((d) => {
      const points = fitByCpd(pick(d.rows));
      const csf: CsfPoint[] = points.map((p) => ({ cpd: p.cpd, logCS: p.fit.logCS }));
      return { label: d.label, cls: d.cls, points, aulcsf: aulcsf(csf) };
    })
    .filter((s) => s.points.length > 0);

  // Longitudinal per-session logCS by cpd (OD signal-hunter sessions with a threshold).
  const trendMap = new Map<number, { day: string; logCS: number }[]>();
  for (const s of sorted) {
    if (s.game !== "signal-hunter" || (s.eyeCondition ?? "OD") !== "OD") continue;
    if (s.logCS === undefined) continue;
    if (!trendMap.has(s.params.cpd)) trendMap.set(s.params.cpd, []);
    trendMap.get(s.params.cpd)!.push({ day: s.startedAt.slice(5, 10), logCS: s.logCS });
  }
  const trend = [...trendMap.entries()]
    .map(([cpd, points]) => ({ cpd, points }))
    .sort((a, b) => a.cpd - b.cpd);

  // Latest overall OD fit for slope/lapse annotation (most-trained cpd, recent window).
  const curSeries = series.find((s) => s.cls === "s-cur") ?? series[0] ?? null;
  const latestFit = curSeries?.points[0] ?? null;

  // Flanker summary: latest OD flanker sessions (one row per session, newest first).
  const flanker = sorted
    .filter((s) => s.game === "flanker-run" && (s.eyeCondition ?? "OD") === "OD")
    .slice(-4)
    .reverse()
    .map((s) => {
      const [iso, facil, crit] = [
        s.thresholds?.[0] ?? null,
        s.thresholds?.[1] ?? null,
        s.thresholds?.[2] ?? null,
      ];
      return {
        cpd: s.params.cpd,
        day: s.startedAt.slice(0, 10),
        iso,
        facil,
        fiDb: iso !== null && facil !== null ? facilitationIndexDb(iso, facil) : null,
        critLambda: crit,
        critDeg: crit !== null ? criticalSpacingDeg(crit, s.params.cpd).deg : null,
      };
    });

  const rts = joined
    .filter((x) => x.t.rtMs !== null && x.at > now - 2 * WEEK_MS)
    .map((x) => x.t.rtMs!);
  const biasTrials = hunter
    .filter((x) => x.at > now - 2 * WEEK_MS && Math.abs(x.t.thetaDeg) === 45)
    .map((x) => ({ thetaDeg: x.t.thetaDeg, correct: x.t.correct }));

  return {
    profile: profiles[0] ?? null,
    firstDay,
    lastDay,
    trainingDays,
    weeksSpanned,
    avgDaysPerWeek: trainingDays / weeksSpanned,
    medianMinPerDay: median([...byDay.values()]),
    fidelityPassRate,
    series,
    trend,
    latestFit,
    flanker,
    medianRtMs: median(rts),
    bias: responseBias(biasTrials),
    totalSessions: sessions.length,
  };
}

function CsfChart({ series }: { series: CsfSeries[] }) {
  const w = 460;
  const h = 220;
  const pad = 40;
  const allCpd = series.flatMap((s) => s.points.map((p) => p.cpd));
  const allY = series.flatMap((s) =>
    s.points.flatMap((p) => [p.fit.logCS, ...(p.fit.ci95 ?? [])]),
  );
  if (allCpd.length === 0) return <p class="muted">Not enough fitted data yet.</p>;
  const xMin = Math.log10(Math.min(...allCpd)) - 0.15;
  const xMax = Math.log10(Math.max(...allCpd)) + 0.15;
  const yMin = Math.min(0, ...allY) - 0.1;
  const yMax = Math.max(...allY) + 0.15;
  const x = (cpd: number) => pad + ((Math.log10(cpd) - xMin) / (xMax - xMin)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - yMin) / (yMax - yMin)) * (h - 2 * pad);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} class="chart rchart" role="img" aria-label="logCSF curves">
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} class="axis" />
      <line x1={pad} y1={pad - 10} x2={pad} y2={h - pad} class="axis" />
      <text x={w / 2} y={h - 6} class="chartlabel" text-anchor="middle">
        spatial frequency (cpd, log scale)
      </text>
      <text x={12} y={pad - 16} class="chartlabel">logCS</text>
      {[...new Set(allCpd)].map((c) => (
        <text x={x(c)} y={h - pad + 14} class="chartlabel" text-anchor="middle">{c}</text>
      ))}
      {series.map((s) => (
        <g class={s.cls}>
          <path
            fill="none"
            class="line"
            d={s.points
              .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.cpd).toFixed(1)},${y(p.fit.logCS).toFixed(1)}`)
              .join(" ")}
          />
          {s.points.map((p) => (
            <g>
              {p.fit.ci95 && (
                <line
                  x1={x(p.cpd)} x2={x(p.cpd)}
                  y1={y(p.fit.ci95[0])} y2={y(p.fit.ci95[1])}
                  class="ci"
                />
              )}
              <circle cx={x(p.cpd)} cy={y(p.fit.logCS)} r="3.5" class="dot" />
            </g>
          ))}
        </g>
      ))}
      {series.map((s, i) => (
        <g class={s.cls}>
          <circle cx={w - pad - 150} cy={pad - 8 + i * 14} r="3.5" class="dot" />
          <text x={w - pad - 140} y={pad - 4 + i * 14} class="chartlabel">
            {s.label}
            {s.aulcsf !== null && ` · AULCSF ${s.aulcsf.toFixed(2)}`}
          </text>
        </g>
      ))}
    </svg>
  );
}

function TrendChart({ trend }: { trend: ReportData["trend"] }) {
  const w = 460;
  const h = 170;
  const pad = 40;
  const n = Math.max(...trend.map((s) => s.points.length), 0);
  if (n < 2) return <p class="muted">The trend appears after two sessions per frequency.</p>;
  const allY = trend.flatMap((s) => s.points.map((p) => p.logCS));
  const yMin = Math.min(...allY) - 0.1;
  const yMax = Math.max(...allY) + 0.1;
  const y = (v: number) => h - pad - ((v - yMin) / (yMax - yMin)) * (h - 2 * pad);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} class="chart rchart" role="img"
      aria-label="Session-by-session logCS">
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} class="axis" />
      <line x1={pad} y1={pad - 10} x2={pad} y2={h - pad} class="axis" />
      <text x={12} y={pad - 16} class="chartlabel">logCS per session (OD)</text>
      {trend.map((s, si) => {
        const x = (i: number) =>
          pad + (s.points.length > 1 ? (i / (s.points.length - 1)) * (w - 2 * pad) : 0);
        return (
          <g class={`t-${si % 3}`}>
            <path fill="none" class="line"
              d={s.points
                .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.logCS).toFixed(1)}`)
                .join(" ")} />
            {s.points.map((p, i) => (
              <circle cx={x(i)} cy={y(p.logCS)} r="3" class="dot">
                <title>{p.day}: {p.logCS.toFixed(2)}</title>
              </circle>
            ))}
            <text x={w - pad + 2} y={y(s.points[s.points.length - 1]!.logCS) + 3}
              class="chartlabel">{s.cpd}cpd</text>
          </g>
        );
      })}
    </svg>
  );
}

export function ClinicalReport() {
  const [data, setData] = useState<ReportData | null>(null);
  useEffect(() => {
    void buildReport().then(setData);
  }, []);

  if (data === null) return <div class="card"><p class="muted">Fitting psychometrics…</p></div>;
  const p = data.profile;

  return (
    <div class="card report">
      <div class="noprint">
        <button onClick={() => window.print()}>Print / save as PDF</button>{" "}
        <span class="muted">One page, black on white. Bring it to the 6-week check.</span>
      </div>

      <h1>EyeTrain — clinical progress report</h1>
      <p class="rmeta">
        Adult refractive amblyopia, OD (right, −15 D contact-corrected), OS −2.5 D; deep
        suppression, no strabismus. Home perceptual-learning training, patched (OD) unless
        noted. Period <strong>{data.firstDay} → {data.lastDay}</strong> ·{" "}
        {data.totalSessions} sessions · experimental tool, not a medical device.
      </p>

      <table class="rtable">
        <tbody>
          <tr>
            <th>Compliance</th>
            <td>
              {data.trainingDays} training days ({data.avgDaysPerWeek.toFixed(1)}/wk vs{" "}
              {WEEKLY_GOAL_DAYS} prescribed) · median{" "}
              {data.medianMinPerDay !== null ? Math.round(data.medianMinPerDay) : "—"} min/day
              (target {DAILY_GOAL_MIN}–{DAILY_CAP_MIN})
            </td>
          </tr>
          <tr>
            <th>Display</th>
            <td>
              {p
                ? `${p.name}: ${pixelsPerDegree(p).toFixed(1)} px/deg, γ=${p.gamma.toFixed(2)},
                   ${p.refreshRateHz} Hz, ${p.viewingDistanceCm} cm`
                : "no calibrated profile"}
              {data.fidelityPassRate !== null &&
                ` · frame-fidelity pass ${(data.fidelityPassRate * 100).toFixed(0)}% of sessions`}
            </td>
          </tr>
          <tr>
            <th>Psychometrics</th>
            <td>
              {data.latestFit
                ? `current Weibull fit @ ${data.latestFit.cpd} cpd: slope β=${data.latestFit.fit.beta.toFixed(1)},
                   lapse ${(data.latestFit.fit.lapse * 100).toFixed(1)}%, n=${data.latestFit.fit.nTrials}`
                : "insufficient trials for a fit"}
              {data.medianRtMs !== null && ` · median RT ${Math.round(data.medianRtMs)} ms`}
              {data.bias &&
                ` · response bias c=${data.bias.c.toFixed(2)}${Math.abs(data.bias.c) > 0.5 ? " ⚠" : ""}`}
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Contrast sensitivity function (Weibull 79.4% thresholds, 95% CI)</h2>
      <CsfChart series={data.series} />
      {data.series.length >= 2 && (() => {
        const base = data.series.find((s) => s.cls === "s-base");
        const cur = data.series.find((s) => s.cls === "s-cur");
        const os = data.series.find((s) => s.cls === "s-os");
        const sharedIor = cur && os
          ? cur.points
              .map((cp) => {
                const op = os.points.find((o) => o.cpd === cp.cpd);
                return op
                  ? `${cp.cpd} cpd: ${interocularRatio(cp.fit.threshold794, op.fit.threshold794).toFixed(1)}×`
                  : null;
              })
              .filter((x): x is string => x !== null)
          : [];
        return (
          <p class="rmeta">
            {base?.aulcsf != null && cur?.aulcsf != null && (
              <>ΔAULCSF (current − baseline): <strong>{(cur.aulcsf - base.aulcsf).toFixed(2)}</strong>. </>
            )}
            {sharedIor.length > 0 && <>Interocular threshold ratio (OD/OS): {sharedIor.join(", ")}.</>}
          </p>
        );
      })()}

      <h2>Session-by-session progression</h2>
      <TrendChart trend={data.trend} />

      <h2>Lateral interactions &amp; crowding (Flanker Run, OD)</h2>
      {data.flanker.length === 0 ? (
        <p class="muted">No flanker sessions yet.</p>
      ) : (
        <table class="rtable">
          <thead>
            <tr>
              <th>date</th><th>cpd</th><th>isolated α</th><th>3λ collinear α</th>
              <th>FI (dB)</th><th>critical spacing</th>
            </tr>
          </thead>
          <tbody>
            {data.flanker.map((f) => (
              <tr>
                <td>{f.day}</td>
                <td>{f.cpd}</td>
                <td>{f.iso !== null ? f.iso.toFixed(4) : "n/c"}</td>
                <td>{f.facil !== null ? f.facil.toFixed(4) : "n/c"}</td>
                <td>{f.fiDb !== null ? f.fiDb.toFixed(1) : "—"}</td>
                <td>
                  {f.critLambda !== null && f.critDeg !== null
                    ? `${f.critLambda.toFixed(2)}λ = ${f.critDeg.toFixed(2)}° (${(f.critDeg * 60).toFixed(0)}′)`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p class="rmeta">
        FI &gt; 0: collinear flankers at 3λ lowered the detection threshold (facilitation —
        the trained effect). Critical spacing: separation at which flankers begin masking a
        suprathreshold target (smaller = less crowding). Catch-trial lapse rate is folded
        into every Weibull fit. Thresholds are 2AFC/2IFC at 79.4% correct, staircase and
        maximum-likelihood estimates agree unless flagged.
      </p>
    </div>
  );
}
