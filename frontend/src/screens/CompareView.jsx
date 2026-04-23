import { useEffect, useState } from "react";
import { fetchPublicUsers as fetchUsersApi, fetchCompareStats as fetchCompareApi } from "../lib/api.js";
import { useT } from "../i18n/useT.js";
import LineOverTime from "../charts/LineOverTime.jsx";

const METRICS = ["xp", "accuracy", "sessions", "cards", "minutes"];
const RANGES = ["7d", "30d", "90d", "1y", "all"];

export default function CompareView({
  fetchUsers = fetchUsersApi,
  fetchCompare = fetchCompareApi,
}) {
  const t = useT();
  const [users, setUsers] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [metric, setMetric] = useState("xp");
  const [range, setRange] = useState("30d");
  const [series, setSeries] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchUsers({}).then((data) => {
      if (cancelled) return;
      const ids = data.map((u) => u.id);
      setUsers(data);
      setSelected(new Set(ids));
    }).catch(() => {
      if (!cancelled) setUsers([]);
    });
    return () => { cancelled = true; };
  }, [fetchUsers]);

  useEffect(() => {
    if (!users || selected.size === 0) return;
    let cancelled = false;
    const ids = Array.from(selected);
    fetchCompare({ userIds: ids, metric, range }, {}).then((d) => {
      if (!cancelled) setSeries(d.series ?? []);
    }).catch(() => {
      if (!cancelled) setSeries([]);
    });
    return () => { cancelled = true; };
  }, [users, selected, metric, range, fetchCompare]);

  function toggleUser(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (users === null) return <div className="compare-view">{t("common.loading")}</div>;

  const colorMap = Object.fromEntries((users ?? []).map((u) => [u.id, u.color]));

  return (
    <div className="compare-view">
      <header className="compare-header">
        <h1>{t("compare.title")}</h1>
      </header>

      <section className="compare-controls">
        <div className="user-chips">
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              data-testid="user-chip"
              data-id={u.id}
              aria-pressed={selected.has(u.id) ? "true" : "false"}
              style={{ borderColor: u.color, opacity: selected.has(u.id) ? 1 : 0.4 }}
              onClick={() => toggleUser(u.id)}
            >
              <span data-testid={`chip-${u.id}`} aria-pressed={selected.has(u.id) ? "true" : "false"}>
                {u.avatar_emoji} {u.name}
              </span>
            </button>
          ))}
        </div>

        <select
          data-testid="metric-select"
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
        >
          {METRICS.map((m) => (
            <option key={m} value={m}>{t(`compare.metric.${m}`)}</option>
          ))}
        </select>

        <nav className="range-selector">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              data-testid={`range-${r}`}
              className={r === range ? "range-btn active" : "range-btn"}
              onClick={() => setRange(r)}
            >
              {t(`family.range.${r}`)}
            </button>
          ))}
        </nav>
      </section>

      <section data-testid="compare-chart">
        <LineOverTime
          data={series}
          dataKeys={Array.from(selected)}
          colors={colorMap}
        />
      </section>
    </div>
  );
}
