/**
 * Session scheduler (#/session): pick a plan template, then the app walks you through its
 * blocks — each game opens with the block's presets, and its end screen offers the next
 * block. Variety across tasks is the engagement mechanic AND aids transfer.
 */
import { useState } from "preact/hooks";
import {
  blockRoute,
  currentBlock,
  PLAN_TEMPLATES,
  planTotalMinutes,
  startPlan,
  type PlanTemplate,
} from "../core/plan";
import { loadPlan, savePlan } from "./presets";

const GAME_NAMES = { "signal-hunter": "Signal Hunter", "flanker-run": "Flanker Run" } as const;

export function Session() {
  const [active, setActive] = useState(loadPlan());

  function begin(t: PlanTemplate) {
    const plan = startPlan(t);
    savePlan(plan);
    location.hash = blockRoute(currentBlock(plan)!);
  }

  function abandon() {
    savePlan(null);
    setActive(null);
  }

  return (
    <div class="card">
      <h1>Training session</h1>
      {active ? (
        <section class="preflight">
          <legend>Plan in progress</legend>
          <ol>
            {active.blocks.map((b, i) => (
              <li key={i} class={i === active.index ? "" : "muted"}>
                {GAME_NAMES[b.game]} @ {b.cpd} cpd · {b.trials} trials
                {i < active.index && " ✓"}
                {i === active.index && " ← next"}
              </li>
            ))}
          </ol>
          <p>
            <a href={blockRoute(currentBlock(active)!)}><button>Continue →</button></a>{" "}
            <button onClick={abandon}>Abandon plan</button>
          </p>
        </section>
      ) : (
        <>
          <p class="muted">
            A session is a few blocks of different tasks, auto-rotated. Pick a plan; each
            game opens with the block's settings and hands you to the next one when done.
            Fatigue breaks and the daily goal ring keep working throughout.
          </p>
          {PLAN_TEMPLATES.map((t) => (
            <section key={t.id} class="preflight">
              <legend>{t.name}</legend>
              <p class="muted">{t.description}</p>
              <ol>
                {t.blocks.map((b, i) => (
                  <li key={i}>
                    {GAME_NAMES[b.game]} @ {b.cpd} cpd · {b.trials} trials · ~{b.approxMin} min
                  </li>
                ))}
              </ol>
              <p>
                <button onClick={() => begin(t)}>Start ({planTotalMinutes(t.blocks)} min)</button>
              </p>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
