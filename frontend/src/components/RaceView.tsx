import { useRef } from "react";
import { useRace } from "../hooks/useRace.ts";
import * as Render from "../lib/render.ts";
import { avgLatency } from "../lib/format.ts";
import type { Agent } from "../hooks/useAgent.ts";
import type { RacePhase } from "../hooks/useRace.ts";
import type { LiveUpdate } from "../types.ts";
import AgentChip from "./AgentChip.tsx";
import AgentError from "./AgentError.tsx";
import EventsPanel from "./EventsPanel.tsx";
import HorseRows from "./HorseRows.tsx";
import LiveChart from "./LiveChart.tsx";
import RaceResult from "./RaceResult.tsx";

function liveStatus(live: LiveUpdate[], phase: RacePhase): string {
  if (live.length) {
    const last = live[live.length - 1];
    return `${live.length} live update${live.length === 1 ? "" : "s"} · leader at ${Math.round(last.progress * 100)}% · ${Math.round(avgLatency(live))} ms avg`;
  }
  return phase === "running" || phase === "finished" ? "Live: asking Jev…" : "Live updates start with the race.";
}

export default function RaceView({ agent, hidden }: { agent: Agent; hidden: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const r = useRace(agent, canvasRef);
  const { race } = r;

  return (
    <main className={`view${hidden ? " hidden" : ""}`}>
      <div className="racebar">
        <div className="chip">{race ? `${race.weather.icon} ${race.weather.label}` : "☀️ Sunny"}</div>
        <div className="chip">Distance: {race ? race.distance : 1200}m</div>
        <div className="chip muted">Seed {race ? race.seed : 1}</div>
        <AgentChip status={agent.status} />
        <div className="spacer" />
        <button className="btn ghost" disabled={!r.canNew} onClick={() => void r.newRace()}>New Race</button>
        <button className="btn primary" disabled={!r.canStart} onClick={r.startRace}>START RACE</button>
      </div>

      <div className="arena">
        <div className="stage"><canvas ref={canvasRef} width={Render.W} height={Render.H} /></div>
        <EventsPanel race={race} log={r.events.log} n={r.events.n} />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Win probabilities</h2>
          <div className="legend">
            <span className="sw jev" />Jev at start <span className="sw live" />Jev live <span className="sw math" />Math (engine, Monte Carlo, pre-race)
          </div>
        </div>
        <AgentError error={agent.error} />
        {race && r.placeP && <HorseRows race={race} pre={r.pre} live={r.live} placeP={r.placeP} places={r.places} log={r.events.log ? r.events.log.slice(0, r.events.n) : []} />}
        <div className="live-chart">
          <div className="panel-head">
            <h3>Jev win probability during the race <span className="h-sub">by leader progress</span></h3>
            <div className="ch-legend">
              {race?.horses.map((h, i) => (
                <span key={h.name} className="lg"><span className="lg-line" style={{ background: Render.SILKS[i] }} />{h.name}</span>
              ))}
            </div>
          </div>
          {race && <LiveChart race={race} pre={r.pre} live={r.live} winner={r.winner} />}
          <div className="note">{liveStatus(r.live, r.phase)}</div>
        </div>
        {race && r.phase === "finished" && r.pre && r.winner !== null && (
          <RaceResult race={race} pre={r.pre} live={r.live} winner={r.winner} liveErrors={r.liveErrors} />
        )}
      </section>
    </main>
  );
}
