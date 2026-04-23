import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

/**
 * @param {{
 *   data: Array<{hour: number, attempts: number}>,
 *   color?: string,
 *   loading?: boolean,
 * }} props
 */
export default function HourHistogram({ data, color = "#2563eb", loading = false }) {
  if (loading) return <div className="chart-placeholder">Loading…</div>;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="hour" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="attempts" fill={color} />
      </BarChart>
    </ResponsiveContainer>
  );
}
