import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

/**
 * @param {{
 *   data: Array<{date: string, value: number}>,
 *   color?: string,
 *   loading?: boolean,
 * }} props
 */
export default function DailyBars({ data, color = "#2563eb", loading = false }) {
  if (loading) return <div className="chart-placeholder">Loading…</div>;
  if (data.length === 0) return <div className="chart-empty">No data</div>;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="value" fill={color} />
      </BarChart>
    </ResponsiveContainer>
  );
}
