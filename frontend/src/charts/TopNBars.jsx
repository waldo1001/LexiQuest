/**
 * Horizontal bar list for struggle list or any top-N ranking.
 *
 * @param {{
 *   items: Array<{label: string, value: number}>,
 *   color?: string,
 *   loading?: boolean,
 * }} props
 */
export default function TopNBars({ items, color = "#2563eb", loading = false }) {
  if (loading) return <div className="chart-placeholder">Loading…</div>;
  if (items.length === 0) return <div className="chart-empty">No data</div>;

  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className="topn-bars">
      {items.map((item) => (
        <li key={item.label} className="topn-bar-row">
          <span className="topn-label">{item.label}</span>
          <span className="topn-track">
            <span
              className="topn-fill"
              style={{ width: `${(item.value / max) * 100}%`, background: color }}
            />
          </span>
          <span className="topn-value">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}
