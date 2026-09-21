import { useState } from "react";
import * as Engine from "../lib/engine.ts";
import * as Jev from "../lib/jev.ts";
import { brierOf, pct, toArray, toError } from "../lib/format.ts";
import type { Agent } from "../hooks/useAgent.ts";
import type { Briefing, Race, Sim, Snapshot } from "../types.ts";

interface Stats {
  win: number;
  top2: number;
  pw: number;
  brier: number;
}

// Model Lab: Jev at start vs Jev at a live checkpoint, over many seeded races.
const LAB_CHECKPOINT = 0.75;
const BATCH = 25;
const SIZES = [100, 500, 1000];
const METRICS = ["Winner accuracy", "Top-2 accuracy", "Avg probability on actual winner", "Brier score (lower is better)"];
const BASELINE = ["25.0%", "50.0%", "0.250", "0.750"];

const emptyStats = (): Stats => ({ win: 0, top2: 0, pw: 0, brier: 0 });
function score(st: Stats, probs: number[], w: number): void {
  const order = probs.map((_, i) => i).sort((a, b) => probs[b] - probs[a]);
  if (order[0] === w) st.win++;
  if (order[0] === w || order[1] === w) st.top2++;
  st.pw += probs[w];
  st.brier += brierOf(probs, w);
}
const format = (st: Stats, n: number): string[] => [pct(st.win / n), pct(st.top2 / n), (st.pw / n).toFixed(3), (st.brier / n).toFixed(3)];

export default function ModelLab({ agent, hidden }: { agent: Agent; hidden: boolean }) {
  const [seed, setSeed] = useState("42");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [cols, setCols] = useState<string[][] | null>(null);

  async function run(n: number) {
    setRunning(true);
    const base = Number(seed) || 0;
    const startSt = emptyStats(), liveSt = emptyStats(), mathSt = emptyStats();
    const t0 = performance.now();
    try {
      for (let i0 = 0; i0 < n; i0 += BATCH) {
        const items: { race: Race; sim: Sim; briefing: Briefing; snapshot: Snapshot }[] = [];
        for (let i = i0; i < Math.min(n, i0 + BATCH); i++) {
          const race = Engine.generateRace(Engine.mix(base, i));
          const sim = Engine.runRace(race);
          const snapshot = Engine.liveSnapshot(race, sim, Engine.timeAtLeaderProgress(race, sim, LAB_CHECKPOINT));
          items.push({ race, sim, briefing: Engine.publicBriefing(race), snapshot });
        }
        const queries = items.flatMap((it) => [{ briefing: it.briefing }, { briefing: it.briefing, snapshot: it.snapshot }]);
        const preds = await Jev.predictBatch(queries);
        agent.online(preds[0].model);
        items.forEach((it, k) => {
          const w = it.sim.winner;
          score(startSt, toArray(it.race, preds[2 * k].probabilities), w);
          score(liveSt, toArray(it.race, preds[2 * k + 1].probabilities), w);
          score(mathSt, Engine.mathProbabilities(it.race, 40), w);
        });
        const done = i0 + items.length;
        setProgress(done / n);
        setStatus(`${done} / ${n} races · ${done * 2} Jev calls`);
        setCols([startSt, liveSt, mathSt].map((st) => format(st, done)));
        await new Promise((r) => setTimeout(r));
      }
      setStatus(`${n} races, ${n * 2} Jev calls, done in ${((performance.now() - t0) / 1000).toFixed(1)}s · seed ${base}`);
    } catch (err) {
      agent.offline("Jev: offline");
      setStatus(`Jev AI Agent error at ${Jev.URL}: ${toError(err).message}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className={`view${hidden ? " hidden" : ""}`}>
      <section className="panel">
        <div className="panel-head">
          <h2>Model Lab</h2>
          <div className="lab-controls">
            <label>Seed <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} /></label>
            {SIZES.map((n) => (
              <button key={n} className="btn primary lab-run" disabled={running} onClick={() => run(n)}>{n} races</button>
            ))}
          </div>
        </div>
        <p className="note">
          Each race: generate, run the JavaScript simulation, ask Jev twice: at the start (briefing only) and live when the leader has covered 75% of the distance (briefing plus snapshot). Compare both with the winner. The Math column is the engine&apos;s own pre-race Monte Carlo estimate (40 runs per race) and shows the pre-race ceiling.
        </p>
        <div className="progress"><div id="lab-bar" style={{ width: `${progress * 100}%` }} /></div>
        <div className="note">{status}</div>
        <table className="lab-table">
          <thead>
            <tr><th>Metric</th><th>Jev at start</th><th>Jev live @75%</th><th>Math oracle (pre-race)</th><th>Random baseline</th></tr>
          </thead>
          <tbody>
            {METRICS.map((m, i) => (
              <tr key={m}>
                <td>{m}</td>
                {[0, 1, 2].map((c) => <td key={c}>{cols ? cols[c][i] : "–"}</td>)}
                <td>{BASELINE[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
