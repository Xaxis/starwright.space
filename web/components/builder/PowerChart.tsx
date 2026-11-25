"use client";
/**
 * Power over time, on one logarithmic axis read two ways: watts, and the Kardashev rating they
 * give (K is a fixed function of watts, so it is the same axis relabelled). Two series, Earth and
 * space, each labelled at its end; Type I and Type II marked. Hover or tap for a year's reading;
 * clicking moves the Builder's year there.
 */
import { format, type Model, SAGAN } from "@starwright/core";
import { useMemo, useRef, useState } from "react";

const W = 760;
const H = 320;
const M = { top: 18, right: 70, bottom: 34, left: 92 };
const LO = 12; // 1 TW
const HI = 27; // 1e27 W

interface Props {
  model: Model;
  from: number;
  to: number;
  year: number;
  onYear(y: number): void;
}

export function PowerChart({ model, from, to, year, onYear }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | undefined>(undefined);
  const x = (y: number) => M.left + ((y - from) / Math.max(1, to - from)) * (W - M.left - M.right);
  const y = (p: number) =>
    M.top + (1 - (Math.log10(Math.max(p, 10 ** LO)) - LO) / (HI - LO)) * (H - M.top - M.bottom);
  const yearAt = (px: number) => from + ((px - M.left) / (W - M.left - M.right)) * (to - from);

  // biome-ignore lint/correctness/useExhaustiveDependencies: x and y are pure functions of from and to
  const { earth, space, idx } = useMemo(() => {
    const s = model.series;
    const first = s.year[0] ?? from;
    const step = s.year.length > 1 ? (s.year[1] as number) - first : 1;
    const i0 = Math.max(0, Math.round((from - first) / step));
    const i1 = Math.min(s.year.length - 1, Math.round((to - first) / step));
    const every = Math.max(1, Math.round((i1 - i0) / 500));
    const idx: number[] = [];
    for (let i = i0; i <= i1; i += every) idx.push(i);
    const path = (arr: Float64Array) => {
      let d = "";
      let pen = false;
      for (const i of idx) {
        const v = arr[i] ?? 0;
        if (v < 10 ** LO) {
          pen = false;
          continue;
        }
        d += `${pen ? "L" : "M"}${x(s.year[i] as number).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      }
      return d;
    };
    return { earth: path(s.earth), space: path(s.space), idx };
  }, [model, from, to]);

  const read = (yr: number) => {
    const s = model.series;
    const first = s.year[0] ?? from;
    const step = s.year.length > 1 ? (s.year[1] as number) - first : 1;
    const i = Math.max(0, Math.min(s.year.length - 1, Math.round((yr - first) / step)));
    return { earth: s.earth[i] ?? 0, space: s.space[i] ?? 0, total: s.total[i] ?? 0 };
  };
  const end = idx[idx.length - 1] ?? 0;
  const endYear = model.series.year[end] ?? to;
  const ticks = [13, 15, 17, 19, 21, 23, 25, 27];
  const yearTicks: number[] = [];
  const span = to - from;
  const every = span > 400 ? 100 : span > 160 ? 50 : 25;
  for (let t = Math.ceil(from / every) * every; t <= to; t += every) yearTicks.push(t);

  const local = (e: React.PointerEvent | React.MouseEvent) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return undefined;
    return ((e.clientX - r.left) / r.width) * W;
  };
  const h = hover !== undefined ? read(hover) : undefined;

  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <span className="chart-title">Power used, by where it is used</span>
        <span className="chart-legend">
          <span className="key key-earth">Earth</span>
          <span className="key key-space">Space</span>
        </span>
      </figcaption>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the Builder's year slider is the keyboard way to pick a year */}
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Power over time from ${Math.floor(from)} to ${Math.floor(to)}: Earth's use levels off at its ceiling while space industry grows to the Sun's output.`}
        onPointerMove={(e) => {
          const px = local(e);
          if (px !== undefined && px >= M.left && px <= W - M.right) setHover(yearAt(px));
          else setHover(undefined);
        }}
        onPointerLeave={() => setHover(undefined)}
        onClick={(e) => {
          const px = local(e);
          if (px !== undefined && px >= M.left && px <= W - M.right) onYear(Math.round(yearAt(px)));
        }}
      >
        {ticks.map((t) => (
          <g key={t} className="chart-grid">
            <line x1={M.left} x2={W - M.right} y1={y(10 ** t)} y2={y(10 ** t)} />
            <text x={M.left - 8} y={y(10 ** t)} dy="0.32em" textAnchor="end">
              {format(10 ** t, "W")}
            </text>
            <text x={W - M.right + 8} y={y(10 ** t)} dy="0.32em" className="chart-k">
              K {SAGAN(10 ** t).toFixed(1)}
            </text>
          </g>
        ))}
        {[
          { p: 1e16, label: "Type I" },
          { p: 1e26, label: "Type II" },
        ].map((r) => (
          <g key={r.label} className="chart-ref">
            <line x1={M.left} x2={W - M.right} y1={y(r.p)} y2={y(r.p)} />
            <text x={M.left + 6} y={y(r.p) - 6}>
              {r.label}
            </text>
          </g>
        ))}
        {yearTicks.map((t) => (
          <text key={t} className="chart-axis" x={x(t)} y={H - M.bottom + 20} textAnchor="middle">
            {t}
          </text>
        ))}
        <path d={earth} className="line line-earth" />
        <path d={space} className="line line-space" />
        <line className="chart-now" x1={x(year)} x2={x(year)} y1={M.top} y2={H - M.bottom} />
        {/* Each line named at its end, inside the plot, clear of the K labels. */}
        <text
          className="chart-end"
          x={x(endYear) - 4}
          y={y(model.series.earth[end] ?? 1) - 8}
          textAnchor="end"
        >
          Earth
        </text>
        <text
          className="chart-end"
          x={x(endYear) - 4}
          y={y(model.series.space[end] ?? 1) + 16}
          textAnchor="end"
        >
          Space
        </text>
        {hover !== undefined && h ? (
          <g className="chart-hover">
            <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={H - M.bottom} />
            {h.earth >= 10 ** LO ? (
              <circle cx={x(hover)} cy={y(h.earth)} r={4} className="dot-earth" />
            ) : null}
            {h.space >= 10 ** LO ? (
              <circle cx={x(hover)} cy={y(h.space)} r={4} className="dot-space" />
            ) : null}
          </g>
        ) : null}
      </svg>
      {hover !== undefined && h ? (
        <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%` }} aria-hidden="true">
          <strong>{Math.floor(hover)}</strong>
          <span>
            <i className="key key-earth" /> Earth {format(h.earth, "W")}
          </span>
          <span>
            <i className="key key-space" /> Space {h.space > 0 ? format(h.space, "W") : "none yet"}
          </span>
          <span>
            Total {format(h.total, "W")}, K {SAGAN(h.total).toFixed(2)}
          </span>
        </div>
      ) : null}
    </figure>
  );
}
