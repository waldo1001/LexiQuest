import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

/**
 * @param {{
 *   data: Array<{date: string, [key: string]: number|string}>,
 *   dataKeys: string[],
 *   colors: Record<string, string>,
 *   loading?: boolean,
 * }} props
 */
export default function LineOverTime({ data, dataKeys, colors, loading = false }) {
  if (loading) return <div className="chart-placeholder">Loading…</div>;
  if (data.length === 0) return <div className="chart-empty">No data</div>;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        {dataKeys.map((key) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={colors[key] ?? "#888"}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
