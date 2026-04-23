/**
 * GitHub-contrib style calendar heatmap (custom SVG).
 * Renders a grid of weekly columns for the last N weeks.
 *
 * @param {{
 *   data: Array<{date: string, count: number}>,
 *   weeks?: number,
 *   color?: string,
 *   loading?: boolean,
 * }} props
 */
export default function CalendarHeatmap({ data, weeks = 52, color = "#2563eb", loading = false }) {
  if (loading) return <div className="chart-placeholder">Loading…</div>;
  if (data.length === 0) return <div className="chart-empty">No data</div>;

  const countByDate = new Map(data.map((d) => [d.date, d.count]));
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  // Build grid: weeks × 7 days
  const today = new Date();
  const CELL = 12;
  const GAP = 2;

  const cells = [];
  for (let w = weeks - 1; w >= 0; w--) {
    for (let d = 0; d < 7; d++) {
      const dayOffset = w * 7 + (6 - d);
      const date = new Date(today);
      date.setDate(date.getDate() - dayOffset);
      const iso = date.toISOString().slice(0, 10);
      const count = countByDate.get(iso) ?? 0;
      const opacity = count > 0 ? 0.2 + (count / maxCount) * 0.8 : 0.05;
      const x = (weeks - 1 - w) * (CELL + GAP);
      const y = d * (CELL + GAP);
      cells.push(
        <rect
          key={iso}
          data-heatmap-date={iso}
          x={x}
          y={y}
          width={CELL}
          height={CELL}
          rx={2}
          fill={color}
          fillOpacity={opacity}
          aria-label={`${iso}: ${count}`}
        />,
      );
    }
  }

  const svgWidth = weeks * (CELL + GAP);
  const svgHeight = 7 * (CELL + GAP);

  return (
    <svg
      className="calendar-heatmap"
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      style={{ width: "100%", height: "auto" }}
      role="img"
      aria-label="Activity calendar heatmap"
    >
      {cells}
    </svg>
  );
}
