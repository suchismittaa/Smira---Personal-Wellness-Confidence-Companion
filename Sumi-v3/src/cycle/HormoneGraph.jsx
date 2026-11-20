import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis } from "recharts";
import { HORMONES } from "./cycleTheme.js";

/* Four overlapping, translucent hormone curves. `data` has one row per day
   (k, estrogen, progesterone, lh, fsh). The x-axis is numeric 0..n-1 with
   half-a-column padding each side, so day i sits exactly at the centre of
   column i — which is how it lines up with the date strip above it.
   ILLUSTRATIVE patterns only — not measurements. */
export default function HormoneGraph({ data, width, height, colW }) {
  const rows = useMemo(() => data.map((d, k) => ({ ...d, k })), [data]); // local 0..n-1 index, so a slice of a longer series still lines up
  return (
    <AreaChart width={width} height={height} data={rows} margin={{ top: 6, right: 0, bottom: 0, left: 0 }} style={{ overflow: "visible" }}>
      <defs>
        {HORMONES.map((h) => (
          <linearGradient key={h.key} id={`cy-g-${h.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={h.color} stopOpacity={0.9} />
            <stop offset="0.6" stopColor={h.color} stopOpacity={0.32} />
            <stop offset="1" stopColor={h.color} stopOpacity={0.04} />
          </linearGradient>
        ))}
      </defs>
      <XAxis type="number" dataKey="k" domain={[0, Math.max(1, rows.length - 1)]} hide padding={{ left: colW / 2, right: colW / 2 }} />
      <YAxis hide domain={[0, 1.05]} />
      {HORMONES.map((h) => (
        <Area
          key={h.key}
          type="monotone"
          dataKey={h.key}
          stroke={h.color}
          strokeWidth={1.3}
          strokeOpacity={0.9}
          fill={`url(#cy-g-${h.key})`}
          fillOpacity={1}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
      ))}
    </AreaChart>
  );
}
