import { useState } from "react";
import { useAgent } from "./hooks/useAgent.ts";
import RaceView from "./components/RaceView.tsx";
import ModelLab from "./components/ModelLab.tsx";

type View = "race" | "lab";

const TABS: { id: View; label: string }[] = [
  { id: "race", label: "Race" },
  { id: "lab", label: "Model Lab" },
];

export default function App() {
  const [view, setView] = useState<View>("race");
  const agent = useAgent();

  return (
    <>
      <header className="top">
        <div className="brand">HORSE RACING <span>AI</span></div>
        <div className="tagline">Jev predicts live. JavaScript decides.</div>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={`tab${view === t.id ? " active" : ""}`} onClick={() => setView(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <RaceView agent={agent} hidden={view !== "race"} />
      <ModelLab agent={agent} hidden={view !== "lab"} />
    </>
  );
}
