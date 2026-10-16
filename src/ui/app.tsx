import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { Home } from "./home";
import { Calibrate } from "./calibrate";
import { SignalHunter } from "./signalHunter";
import { FlankerRun } from "./flankerRun";
import { Dashboard } from "./dashboard";
import { ClinicalReport } from "./clinicalReport";
import { ShaderTest } from "./shaderTest";
import { Session } from "./session";
import { BeatAlign } from "./beatAlign";
import { FusionTest } from "./fusionTest";

const ROUTES: Record<string, () => JSX.Element> = {
  "#/": Home,
  "#/calibrate": Calibrate,
  "#/session": Session,
  "#/play": SignalHunter,
  "#/flanker": FlankerRun,
  "#/beat-align": BeatAlign,
  "#/dashboard": Dashboard,
  "#/report": ClinicalReport,
  "#/shader-test": ShaderTest,
  "#/fusion-test": FusionTest,
};

export function App() {
  const [hash, setHash] = useState(location.hash || "#/");
  useEffect(() => {
    const onHash = () => setHash(location.hash || "#/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Route = hash path without query presets (e.g. "#/play?cpd=4" → "#/play").
  const route = hash.split("?")[0] ?? "#/";
  const Page = ROUTES[route] ?? Home;
  const link = (to: string, label: string) => (
    <a href={to} class={route === to ? "active" : ""}>{label}</a>
  );
  return (
    <div class="shell">
      <nav class="topnav">
        {link("#/", "EyeTrain")}
        {link("#/calibrate", "Calibrate")}
        {link("#/session", "Session")}
        {link("#/play", "Signal Hunter")}
        {link("#/flanker", "Flanker Run")}
        {link("#/beat-align", "Beat Align")}
        {link("#/dashboard", "Dashboard")}
        {link("#/report", "Report")}
      </nav>
      <main>
        {/* Keyed by the full hash so a new block on the same route remounts with its presets. */}
        <Page key={hash} />
      </main>
    </div>
  );
}
