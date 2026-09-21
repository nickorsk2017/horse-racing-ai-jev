import { useEffect, useMemo } from "react";
import { winFactors, type Factor } from "../lib/engine.ts";
import { SILKS } from "../lib/render.ts";
import { ORD, pct } from "../lib/format.ts";
import type { LiveUpdate, LogEvent, PreForecast, Race } from "../types.ts";

// Public rules effect of each visible incident (see RULES in engine.ts).
const INCIDENT: Record<LogEvent["type"], { ic: string; label: string; effect: string; sign: -1 | 0 | 1 }> = {
  start: { ic: "🐢", label: "Bad start", effect: "about −40% win chance", sign: -1 },
  stumble: { ic: "⚠️", label: "Stumble", effect: "about −1/3 win chance, higher winded risk", sign: -1 },
  winded: { ic: "😮‍💨", label: "Winded", effect: "keeps losing speed to the finish", sign: -1 },
  burst: { ic: "⚡", label: "Second wind", effect: "about +1/3 win chance", sign: 1 },
  fall: { ic: "✕", label: "Fall", effect: "out of the race", sign: -1 },
  finish: { ic: "🏁", label: "Finished", effect: "", sign: 0 },
};

const pp = (d: number): string => `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d * 100).toFixed(1)} pp`;

function rankOf(probs: number[], i: number): number {
  return probs.filter((p) => p > probs[i]).length + 1;
}

function FactorRow({ f, scale }: { f: Factor; scale: number }) {
  const w = scale > 0 ? (Math.abs(f.delta) / scale) * 50 : 0;
  const cls = Math.abs(f.delta) < 0.005 ? "zero" : f.delta > 0 ? "plus" : "minus";
  return (
    <div className={`wf ${cls}`}>
      <div className="wf-l">
        <b>{f.label}</b>
        <small>{f.detail}</small>
      </div>
      <div className="wf-bar">
        <span className="wf-mid" />
        <i style={f.delta >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />
      </div>
      <div className="wf-v">{pp(f.delta)}</div>
    </div>
  );
}

interface Props {
  race: Race;
  idx: number;
  pre: PreForecast | null;
  live: LiveUpdate[];
  math: number[];
  log: LogEvent[];
  onClose: () => void;
}

export default function WhyModal({ race, idx, pre, live, math, log, onClose }: Props) {
  const h = race.horses[idx];
  const br = useMemo(() => winFactors(race, idx), [race, idx]);
  const last = live.length ? live[live.length - 1] : null;
  const incidents = log.filter((e) => e.i === idx && e.type !== "finish");
  const finished = log.find((e) => e.i === idx && e.type === "finish");
  const scale = Math.max(0.01, ...br.factors.map((f) => Math.abs(f.delta)));
  const plus = br.factors.filter((f) => f.delta >= 0.005);
  const minus = br.factors.filter((f) => f.delta <= -0.005);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const jevRank = pre ? rankOf(pre.probs, idx) : null;
  const verdict = [
    jevRank === 1 ? "Jev favourite" : jevRank ? `Jev ranks ${ORD(jevRank)}` : "No Jev forecast",
    plus.length ? `main plus: ${plus[0].label.toLowerCase()} (${pp(plus[0].delta)})` : "",
    minus.length ? `main minus: ${minus[0].label.toLowerCase()} (${pp(minus[0].delta)})` : "",
  ].filter(Boolean).join(" · ");

  return (
    <div className="why-back" onClick={onClose}>
      <div className="why" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="why-head">
          <div className="hname"><span className="silk" style={{ background: SILKS[idx] }} />{h.name} <span className="num">#{idx + 1}</span></div>
          <button className="why-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="why-verdict">{verdict}</div>

        <div className="why-sum">
          <div className="box"><small>Jev at start</small><strong>{pre ? pct(pre.probs[idx]) : "–"}</strong>{jevRank && <em>{ORD(jevRank)} of {race.horses.length}</em>}</div>
          <div className="box"><small>Jev live</small><strong>{last ? pct(last.probs[idx]) : "–"}</strong>{last && pre && <em className={last.probs[idx] >= pre.probs[idx] ? "good" : "badc"}>{pp(last.probs[idx] - pre.probs[idx])} vs start</em>}</div>
          <div className="box"><small>Math</small><strong>{pct(math[idx])}</strong><em>{ORD(rankOf(math, idx))} of {race.horses.length}</em></div>
        </div>

        <h3>Pre-race factors <span className="h-sub">engine Monte Carlo, each factor switched to neutral, win chance {pct(br.base)}</span></h3>
        <div className="wf-list">
          {br.factors.map((f) => <FactorRow key={f.key} f={f} scale={scale} />)}
        </div>
        <div className="note">Factors are measured one at a time and overlap, so they do not add up to the total.</div>

        <h3>In the race <span className="h-sub">visible incidents, public rules effect</span></h3>
        {incidents.length ? (
          <div className="wi-list">
            {incidents.map((e, k) => (
              <div key={k} className={`wi ${INCIDENT[e.type].sign > 0 ? "plus" : "minus"}`}>
                <span className="ic">{INCIDENT[e.type].ic}</span>
                <b>{INCIDENT[e.type].label}</b>
                <small>{INCIDENT[e.type].effect}</small>
                <span className="at">{e.t.toFixed(1)}s · {e.m}m</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="note">{log.length ? "No incidents so far." : "Incidents appear once the race starts."}</div>
        )}
        {finished && finished.type === "finish" && <div className="note">Finished {ORD(finished.place)} at {finished.t.toFixed(1)}s.</div>}
      </div>
    </div>
  );
}
