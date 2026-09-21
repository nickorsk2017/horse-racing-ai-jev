import type { ReactNode } from "react";
import { argmax, avgLatency, brierOf, pct } from "../lib/format.ts";
import type { LiveUpdate, PreForecast, Race } from "../types.ts";

function Verdict({ ok }: { ok: boolean }) {
  return <em className={ok ? "good" : "badc"}>{ok ? "CORRECT" : "INCORRECT"}</em>;
}

// Jev at start vs Jev at end (the last live update before the finish), against the engine winner.
interface Props {
  race: Race;
  pre: PreForecast;
  live: LiveUpdate[];
  winner: number;
  liveErrors: number;
}

export default function RaceResult({ race, pre, live, winner: w, liveErrors }: Props) {
  const name = (i: number): string => race.horses[i].name;
  const pj = argmax(pre.probs);
  const end = live.length ? live[live.length - 1] : null;

  let endBoxes: ReactNode;
  if (end) {
    const ej = argmax(end.probs);
    const d = (end.probs[w] - pre.probs[w]) * 100;
    endBoxes = (
      <>
        <div className="box">
          <small>Jev at end · leader {Math.round(end.progress * 100)}% · {end.simT.toFixed(1)}s</small>
          <strong>{name(ej)} · {pct(end.probs[ej])}</strong>
          <Verdict ok={ej === w} />
        </div>
        <div className="box">
          <small>Jev on winner: start → end</small>
          <strong>{pct(pre.probs[w])} → {pct(end.probs[w])}</strong>
          <em className={d >= 0 ? "good" : "badc"}>{d >= 0 ? "+" : ""}{d.toFixed(1)} pp</em>
        </div>
        <div className="box">
          <small>Brier: start → end (lower is better)</small>
          <strong>{brierOf(pre.probs, w).toFixed(3)} → {brierOf(end.probs, w).toFixed(3)}</strong>
        </div>
        <div className="box">
          <small>Live updates · avg latency</small>
          <strong>{live.length} · {Math.round(avgLatency(live))} ms</strong>
          {liveErrors > 0 && <em className="badc">{liveErrors} failed</em>}
        </div>
      </>
    );
  } else {
    endBoxes = (
      <div className="box wide">
        <small>Jev at end</small>
        <strong>No live updates{liveErrors ? ` · ${liveErrors} failed` : ""}</strong>
      </div>
    );
  }

  return (
    <div className="result">
      <div className="box">
        <small>Actual Winner (JavaScript)</small>
        <strong>🏆 {name(w)}</strong>
      </div>
      <div className="box">
        <small>Jev at start</small>
        <strong>{name(pj)} · {pct(pre.probs[pj])}</strong>
        <Verdict ok={pj === w} />
      </div>
      {endBoxes}
    </div>
  );
}
