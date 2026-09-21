import { useMemo, useRef, useState, type MouseEvent } from "react";
import { SILKS } from "../lib/render.ts";
import { pct } from "../lib/format.ts";
import type { LiveUpdate, PreForecast, Race } from "../types.ts";

interface Point {
  x: number;
  probs: number[];
  label: string;
  t: number;
}

interface Label {
  i: number;
  x: number;
  y: number;
  text: string;
}

// Jev win probability per horse over race progress (leader distance / race distance).
const W = 800, H = 240, L = 44, R = 120, T = 14, B = 30;
const PW = W - L - R, PH = H - T - B;
const X = (x: number): number => L + x * PW;
const Y = (p: number): number => T + (1 - p) * PH;
const GRID = [0, 0.25, 0.5, 0.75, 1];

function series(pre: PreForecast | null, live: LiveUpdate[]): Point[] {
  if (!pre) return [];
  return [{ x: 0, probs: pre.probs, label: "Start (pre-race)", t: 0 }].concat(
    live.map((u) => ({ x: u.progress, probs: u.probs, label: `Live · leader ${Math.round(u.progress * 100)}%`, t: u.simT })),
  );
}

function endLabels(race: Race, last: Point): Label[] {
  const labels: Label[] = race.horses.map((h, i) => ({ i, y: Y(last.probs[i]), x: X(last.x), text: `${h.name} ${pct(last.probs[i])}` }));
  labels.sort((a, b) => a.y - b.y);
  for (let k = 1; k < labels.length; k++) labels[k].y = Math.max(labels[k].y, labels[k - 1].y + 14);
  for (let k = labels.length - 1; k >= 0; k--) {
    const floor = k === labels.length - 1 ? T + PH : labels[k + 1].y - 14;
    labels[k].y = Math.max(T, Math.min(labels[k].y, floor));
  }
  return labels;
}

interface Props {
  race: Race;
  pre: PreForecast | null;
  live: LiveUpdate[];
  winner: number | null;
}

export default function LiveChart({ race, pre, live, winner }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ k: number; left: number } | null>(null);
  const pts = useMemo(() => series(pre, live), [pre, live]);
  const last: Point | undefined = pts[pts.length - 1];
  const labels = useMemo(() => (last ? endLabels(race, last) : []), [race, last]);

  const onMove = (ev: MouseEvent<SVGRectElement>) => {
    if (!pts.length || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W;
    const k = pts.reduce((best, p, j) => (Math.abs(X(p.x) - x) < Math.abs(X(pts[best].x) - x) ? j : best), 0);
    const left = Math.min(r.width - 170, Math.max(0, (X(pts[k].x) / W) * r.width + 12));
    setHover({ k, left });
  };

  const hp = hover && pts.length ? pts[Math.min(hover.k, pts.length - 1)] : null;
  const tipRows = hp ? race.horses.map((h, i) => ({ i, name: h.name, p: hp.probs[i] })).sort((a, b) => b.p - a.p) : [];

  return (
    <div className="chart-wrap">
      <svg id="chart" ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Jev win probability per horse over leader progress">
        {GRID.map((g) => (
          <g key={`y${g}`}>
            <line className="grid" x1={L} x2={L + PW} y1={Y(g)} y2={Y(g)} />
            <text className="axis" x={L - 8} y={Y(g) + 4} textAnchor="end">{g * 100}%</text>
          </g>
        ))}
        {GRID.map((g) => (
          <text key={`x${g}`} className="axis" x={X(g)} y={H - 8} textAnchor="middle">{g === 0 ? "start" : g * 100 + "%"}</text>
        ))}
        {last ? (
          <>
            {race.horses.map((h, i) => (
              <g key={h.name}>
                <path
                  className={`series${winner === i ? " win" : ""}`}
                  d={pts.map((p, k) => `${k ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.probs[i]).toFixed(1)}`).join(" ")}
                  stroke={SILKS[i]}
                />
                <circle className="dot" cx={X(last.x)} cy={Y(last.probs[i])} r="4" fill={SILKS[i]} />
              </g>
            ))}
            {labels.map((l) => (
              <text key={l.i} className="dlabel" x={l.x + 9} y={l.y + 4}>{l.text}</text>
            ))}
          </>
        ) : (
          <text className="axis" x={L + PW / 2} y={T + PH / 2} textAnchor="middle">Waiting for Jev…</text>
        )}
        {hp && <line className="cross" x1={X(hp.x)} x2={X(hp.x)} y1={T} y2={T + PH} />}
        <rect x={L} y={T} width={PW} height={PH} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hp && hover && (
        <div className="ch-tip" style={{ left: hover.left }}>
          <div className="tt-h">{hp.label}{hp.t ? ` · ${hp.t.toFixed(1)}s` : ""}</div>
          {tipRows.map((row) => (
            <div key={row.i} className="tt-r">
              <span className="lg-line" style={{ background: SILKS[row.i] }} />{row.name}<b>{pct(row.p)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
