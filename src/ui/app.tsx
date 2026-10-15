import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { Home } from "./home";
import { Calibrate } from "./calibrate";
import { SignalHunter } from "./signalHunter";
import { FlankerRun } from "./flankerRun";
import { Dashboard } from "./dashboard";

const ROUTES: Record<string, () => JSX.Element> = {
  "#/": Home,
  "#/calibrate": Calibrate,
  "#/play": SignalHunter,
  "#/flanker": FlankerRun,
  "#/dashboard": Dashboard,
};

export function App() {
  const [route, setRoute] = useState(location.hash || "#/");
  useEffect(() => {
    const onHash = () => setRoute(location.hash || "#/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const Page = ROUTES[route] ?? Home;
  return (
    <div class="shell">
      <nav class="topnav">
        <a href="#/" class={route === "#/" ? "active" : ""}>EyeTrain</a>
        <a href="#/calibrate" class={route === "#/calibrate" ? "active" : ""}>Calibrate</a>
        <a href="#/play" class={route === "#/play" ? "active" : ""}>Signal Hunter</a>
        <a href="#/flanker" class={route === "#/flanker" ? "active" : ""}>Flanker Run</a>
        <a href="#/dashboard" class={route === "#/dashboard" ? "active" : ""}>Dashboard</a>
      </nav>
      <main>
        <Page />
      </main>
    </div>
  );
}
