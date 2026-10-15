/**
 * Route presets and active-plan persistence. A game route may carry query presets
 * (`#/play?cpd=4&trials=80&plan=1`) set by the session scheduler; the active plan itself
 * lives in localStorage so it survives navigation and reloads.
 */
import type { ActivePlan } from "../core/plan";

const PLAN_KEY = "eyetrain-plan";

export interface Presets {
  cpd?: number;
  trials?: number;
  /** True when this block was launched by the scheduler. */
  plan: boolean;
}

export function readPresets(hash = location.hash): Presets {
  const q = hash.split("?")[1];
  if (!q) return { plan: false };
  const p = new URLSearchParams(q);
  const cpd = parseFloat(p.get("cpd") ?? "");
  const trials = parseInt(p.get("trials") ?? "", 10);
  return {
    cpd: Number.isFinite(cpd) ? cpd : undefined,
    trials: Number.isFinite(trials) ? trials : undefined,
    plan: p.get("plan") === "1",
  };
}

export function loadPlan(): ActivePlan | null {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    return raw ? (JSON.parse(raw) as ActivePlan) : null;
  } catch {
    return null;
  }
}

export function savePlan(plan: ActivePlan | null): void {
  try {
    if (plan) localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
    else localStorage.removeItem(PLAN_KEY);
  } catch {
    /* ignore */
  }
}
