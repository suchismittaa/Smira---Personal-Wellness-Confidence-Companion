// TEST-ONLY stand-in for recharts (not installable offline). Mimics the subset used by HormoneGraph:
// numeric XAxis with padding, YAxis domain, monotone-ish Areas with <defs> gradients.
import React from "react";
export const XAxis = () => null; export const YAxis = () => null; export const Area = () => null;
export function AreaChart({ width, height, data, margin = {}, children, style }) {
  const kids = React.Children.toArray(children);
  const xa = kids.find((c) => c.type === XAxis)?.props || {};
  const ya = kids.find((c) => c.type === YAxis)?.props || {};
  const pl = xa.padding?.left || 0, pr = xa.padding?.right || 0;
  const [, ymax] = ya.domain || [0, 1];
  const n = data.length, innerW = width - pl - pr, mt = margin.top || 0, h = height - mt;
  const X = (i) => pl + (i * innerW) / (n - 1), Y = (v) => mt + h - (Math.max(0, v) / ymax) * h;
  return (
    <svg width={width} height={height} style={style} data-testid="stub-chart" data-pl={pl}>
      {kids.filter((c) => c.type === "defs").map((c, i) => <React.Fragment key={i}>{c}</React.Fragment>)}
      {kids.filter((c) => c.type === Area).map((c) => {
        const { dataKey, stroke, fill } = c.props;
        const pts = data.map((d, i) => [X(i), Y(d[dataKey])]);
        const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
        return <g key={dataKey} data-key={dataKey}><path d={`${line}L${X(n - 1)} ${height}L${X(0)} ${height}Z`} fill={fill} /><path d={line} fill="none" stroke={stroke} /></g>;
      })}
    </svg>
  );
}
