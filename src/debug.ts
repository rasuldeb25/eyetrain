/**
 * Debug logging switch. On under `npm run dev`; in a production build enable with
 *   localStorage.setItem("eyetrain-debug", "1")   → one log per scene change (per pulse)
 *   localStorage.setItem("eyetrain-debug", "2")   → every WebGL draw call
 * and reload. Never affects stimulus math — logging only.
 */
function stored(): string | null {
  try {
    return localStorage.getItem("eyetrain-debug");
  } catch {
    return null;
  }
}

export function debugLevel(): 0 | 1 | 2 {
  const v = stored();
  if (v === "2") return 2;
  if (v === "1" || import.meta.env.DEV) return 1;
  return 0;
}
