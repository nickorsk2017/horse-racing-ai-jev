import { useState } from "react";
import { SILKS } from "../lib/render.ts";
import WhyModal from "./WhyModal.tsx";
import { pct } from "../lib/format.ts";
import type { Disease, LiveUpdate, LogEvent, Place, PreForecast, Race } from "../types.ts";

const DIS: Record<Disease, string> = { cold: "Cold", lameness: "Lameness", fatigue: "Fatigue" };
const pp = (p: number): string => (p >= 0.995 ? "99%" : p > 0 && p < 0.005 ? "<1%" : Math.round(p * 100) + "%");

function Bar({ label, cls, p }: { label: string; cls: string; p: number | null }) {
  return (
    <div className="bar">
      {label}
      <span className="track"><i className={cls} style={{ width: `${p == null ? 0 : p * 100}%` }} /></span>
      <b>{p == null ? "–" : pct(p)}</b>
    </div>
  );
}

// places: final places after the finish (number or "✕"), null before.
interface Props {
  race: Race;
  pre: PreForecast | null;
  live: LiveUpdate[];
  placeP: number[][];
  places: Place[] | null;
  log: LogEvent[];
}

export default function HorseRows({ race, pre, live, placeP, places, log }: Props) {
  const [why, setWhy] = useState<number | null>(null);
  const last = live.length ? live[live.length - 1] : null;
  return (
    <div className="rows">
      {race.horses.map((h, i) => (
        <div key={h.name} className={`row${places && places[i] === 1 ? " win" : ""}`}>
          <div>
            <div className="hname"><span className="silk" style={{ background: SILKS[i] }} />{h.name} <span className="num">#{i + 1}</span><button className="why-btn" onClick={() => setWhy(i)} title="Why this probability">Why?</button></div>
            <div className="meta">
              Age {h.age}{places ? (places[i] === "✕" ? " · fell" : ` · finished ${places[i]}`) : ""}
            </div>
            <div className="tags">
              {h.diseases.length
                ? h.diseases.map((d) => <span key={d} className="tag">{DIS[d]}</span>)
                : <span className="tag ok">Healthy</span>}
            </div>
            <div className="places">
              {[0, 1, 2].map((k) => (
                <span key={k} className={`pb p${k + 1}${placeP[i][k] < 0.005 ? " zero" : ""}`} title={`Math: chance to finish ${k + 1}`}>
                  <b>{k + 1}</b>{pp(placeP[i][k])}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="stat">Strength<span className="mini"><i className="s" style={{ width: `${h.strength}%` }} /></span>{h.strength}</div>
            <div className="stat">Stamina<span className="mini"><i className="t" style={{ width: `${h.stamina}%` }} /></span>{h.stamina}</div>
          </div>
          <div className="bars">
            <Bar label="Start" cls="j" p={pre ? pre.probs[i] : null} />
            <Bar label="Live" cls="l" p={last ? last.probs[i] : null} />
            <Bar label="Math" cls="m" p={placeP[i][0]} />
          </div>
        </div>
      ))}
      {why !== null && (
        <WhyModal race={race} idx={why} pre={pre} live={live} math={placeP.map((p) => p[0])} log={log} onClose={() => setWhy(null)} />
      )}
    </div>
  );
}
