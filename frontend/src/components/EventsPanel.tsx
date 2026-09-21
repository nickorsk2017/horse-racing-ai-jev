import { SILKS } from "../lib/render.ts";
import { ORD } from "../lib/format.ts";
import type { LogEvent, Race } from "../types.ts";

const EV: Record<LogEvent["type"], { ic: string; label: string }> = {
  start: { ic: "🐢", label: "Bad start" },
  winded: { ic: "😮‍💨", label: "Winded, slowing down" },
  stumble: { ic: "⚠️", label: "Stumbled" },
  burst: { ic: "⚡", label: "Got a second wind" },
  fall: { ic: "✕", label: "Fell, out of the race" },
  finish: { ic: "🏁", label: "" },
};

interface Props {
  race: Race | null;
  log: LogEvent[] | null;
  n: number;
}

export default function EventsPanel({ race, log, n }: Props) {
  const shown = log ? log.slice(0, n) : [];
  return (
    <aside className="events">
      <div className="events-head">
        <h2>Events</h2>
        <span className="ev-count">{shown.length || ""}</span>
      </div>
      <ul className="ev-list">
        {!shown.length && (
          <li className="ev-empty">{log ? "Race in progress…" : "Events appear here during the race."}</li>
        )}
        {race && shown.map((e, k) => ({ e, k })).reverse().map(({ e, k }) => {
          const h = race.horses[e.i];
          const label = e.type === "finish" ? `Finished ${ORD(e.place)}` : EV[e.type].label;
          return (
            <li key={k} className={`ev ${e.type}`}>
              <span className="ic">{EV[e.type].ic}</span>
              <div>
                <div className="who"><span className="silk" style={{ background: SILKS[e.i] }} />{h.name}</div>
                <div className="what">{label}</div>
                {e.type === "burst" && h.diseases.length > 0 && <div className="note">rare for a sick horse</div>}
              </div>
              <div className="at">{e.t.toFixed(1)}s<br />{e.m}m</div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
