import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const BUCKET_COLORS = {
  new: "#94a3b8",
  learning: "#f59e0b",
  young: "#84cc16",
  mature: "#22c55e",
  mastered: "#2563eb",
};

/**
 * @param {{
 *   distribution: {new: number, learning: number, young: number, mature: number, mastered: number},
 *   loading?: boolean,
 * }} props
 */
export default function MasteryStack({ distribution, loading = false }) {
  if (loading) return <div className="chart-placeholder">Loading…</div>;

  const data = Object.entries(distribution).map(([bucket, count]) => ({
    bucket,
    count,
    color: BUCKET_COLORS[bucket] ?? "#888",
  }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} layout="vertical">
        <XAxis type="number" />
        <YAxis dataKey="bucket" type="category" width={70} />
        <Tooltip />
        <Bar dataKey="count">
          {data.map((entry) => (
            <Cell key={entry.bucket} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
