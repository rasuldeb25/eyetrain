/**
 * Session plans: a training session is a sequence of game blocks, auto-rotated so variety
 * (which the perceptual-learning literature links to transfer) is built in rather than left
 * to discipline. Pure data + helpers; the UI persists the active plan in localStorage.
 */
import type { GameId } from "../data/db";

export interface PlanBlock {
  game: GameId;
  cpd: number;
  /** Planned trial count for the block (games may extend for convergence). */
  trials: number;
  /** Approximate minutes, for the plan overview only. */
  approxMin: number;
}

export interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  blocks: PlanBlock[];
}

export interface ActivePlan {
  templateId: string;
  blocks: PlanBlock[];
  /** Index of the block to play next. */
  index: number;
  startedAt: string;
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: "standard-30",
    name: "Standard (≈30 min)",
    description: "Contrast at 2 cpd → crowding → contrast at 4 cpd. The daily default.",
    blocks: [
      { game: "signal-hunter", cpd: 2, trials: 80, approxMin: 9 },
      { game: "flanker-run", cpd: 2, trials: 90, approxMin: 11 },
      { game: "signal-hunter", cpd: 4, trials: 80, approxMin: 9 },
    ],
  },
  {
    id: "contrast-focus",
    name: "Contrast focus (≈28 min)",
    description: "Three Signal Hunter blocks climbing in spatial frequency.",
    blocks: [
      { game: "signal-hunter", cpd: 2, trials: 80, approxMin: 9 },
      { game: "signal-hunter", cpd: 4, trials: 80, approxMin: 9 },
      { game: "signal-hunter", cpd: 6, trials: 80, approxMin: 9 },
    ],
  },
  {
    id: "crowding-focus",
    name: "Crowding focus (≈32 min)",
    description: "Two Flanker Run blocks around a contrast block.",
    blocks: [
      { game: "flanker-run", cpd: 2, trials: 90, approxMin: 11 },
      { game: "signal-hunter", cpd: 2, trials: 80, approxMin: 9 },
      { game: "flanker-run", cpd: 4, trials: 90, approxMin: 11 },
    ],
  },
];

export function startPlan(template: PlanTemplate, now = new Date()): ActivePlan {
  return { templateId: template.id, blocks: template.blocks, index: 0, startedAt: now.toISOString() };
}

export function currentBlock(plan: ActivePlan): PlanBlock | null {
  return plan.blocks[plan.index] ?? null;
}

/** Advance past the block just completed; returns null when the plan is finished. */
export function advancePlan(plan: ActivePlan): ActivePlan | null {
  const next = plan.index + 1;
  return next < plan.blocks.length ? { ...plan, index: next } : null;
}

export function planTotalMinutes(blocks: readonly PlanBlock[]): number {
  return blocks.reduce((a, b) => a + b.approxMin, 0);
}

/** Hash route for a block: the game's route plus preset params. */
export function blockRoute(block: PlanBlock): string {
  const base = block.game === "flanker-run" ? "#/flanker" : "#/play";
  return `${base}?cpd=${block.cpd}&trials=${block.trials}&plan=1`;
}
