import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

/**
 * @param {{
 *   data: Array<{bucket: string, count: number}>,
 *   color?: string,
 *   loading?: boolean,
 * }} props
 */
export default function ResponseTimeHistogram({ data, color = "#2563eb", loading = false }) {
  if (loading) return <div className="chart-placeholder">Loading…</div>;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="bucket" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="count" fill={color} />
      </BarChart>
    </ResponsiveContainer>
  );
}
