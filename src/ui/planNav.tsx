/**
 * End-of-block navigation for scheduled sessions: advances the active plan and offers the
 * next block (or declares the plan complete). Rendered on each game's done screen.
 */
import { useState } from "preact/hooks";
import { advancePlan, blockRoute, currentBlock } from "../core/plan";
import { loadPlan, readPresets, savePlan } from "./presets";

const GAME_NAMES = {
  "signal-hunter": "Signal Hunter",
  "flanker-run": "Flanker Run",
  "beat-align": "Beat Align",
} as const;

export function PlanNav() {
  // Advance exactly once per mount (this done screen = one completed block).
  const [state] = useState(() => {
    if (!readPresets().plan) return null;
    const plan = loadPlan();
    if (!plan) return null;
    const next = advancePlan(plan);
    savePlan(next);
    return { done: next === null, next, total: plan.blocks.length };
  });
  if (!state) return null;
  if (state.done || !state.next) {
    return (
      <p>
        <strong>Session plan complete</strong> — all {state.total} blocks done. Nice work.{" "}
        <a href="#/">Home</a>
      </p>
    );
  }
  const b = currentBlock(state.next)!;
  return (
    <p>
      <a href={blockRoute(b)}>
        <button>
          Next block {state.next.index + 1}/{state.total}: {GAME_NAMES[b.game]} @ {b.cpd} cpd →
        </button>
      </a>
    </p>
  );
}
