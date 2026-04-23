import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import LineOverTime from "./LineOverTime.jsx";
import DailyBars from "./DailyBars.jsx";
import HourHistogram from "./HourHistogram.jsx";
import MasteryStack from "./MasteryStack.jsx";
import TopNBars from "./TopNBars.jsx";
import ResponseTimeHistogram from "./ResponseTimeHistogram.jsx";
import CalendarHeatmap from "./CalendarHeatmap.jsx";

const LINE_DATA = [
  { date: "2026-04-20", "u-lex": 100, "u-mats": 60 },
  { date: "2026-04-21", "u-lex": 200, "u-mats": 80 },
];
const DAILY_DATA = [
  { date: "2026-04-20", value: 50 },
  { date: "2026-04-21", value: 70 },
];
const HOUR_DATA = Array.from({ length: 24 }, (_, hour) => ({ hour, attempts: hour === 9 ? 5 : 0 }));
const MASTERY_DATA = { new: 3, learning: 2, young: 5, mature: 4, mastered: 1 };
const TOPN_DATA = [
  { label: "Card A", value: 10 },
  { label: "Card B", value: 5 },
];
const RT_DATA = [
  { bucket: "<1s", count: 10 },
  { bucket: "1-3s", count: 20 },
  { bucket: "3-10s", count: 5 },
  { bucket: ">10s", count: 1 },
];
const HEATMAP_DATA = [
  { date: "2026-04-20", count: 3 },
  { date: "2026-04-21", count: 7 },
];

describe("LineOverTime", () => {
  it("renders without errors with data", () => {
    render(
      <LineOverTime
        data={LINE_DATA}
        dataKeys={["u-lex", "u-mats"]}
        colors={{ "u-lex": "#16a34a", "u-mats": "#dc2626" }}
      />,
    );
  });

  it("shows loading state", () => {
    render(<LineOverTime data={[]} dataKeys={[]} colors={{}} loading />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows empty state when no data", () => {
    render(<LineOverTime data={[]} dataKeys={["u-lex"]} colors={{ "u-lex": "#000" }} />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });
});

describe("DailyBars", () => {
  it("renders without errors with data", () => {
    render(<DailyBars data={DAILY_DATA} color="#2563eb" />);
  });

  it("shows loading state", () => {
    render(<DailyBars data={[]} color="#000" loading />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows empty state when no data", () => {
    render(<DailyBars data={[]} color="#000" />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });
});

describe("HourHistogram", () => {
  it("renders 24-hour distribution", () => {
    render(<HourHistogram data={HOUR_DATA} color="#2563eb" />);
  });

  it("shows loading state", () => {
    render(<HourHistogram data={[]} color="#000" loading />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

describe("MasteryStack", () => {
  it("renders mastery distribution", () => {
    render(<MasteryStack distribution={MASTERY_DATA} />);
  });

  it("shows loading state", () => {
    render(<MasteryStack distribution={{ new: 0, learning: 0, young: 0, mature: 0, mastered: 0 }} loading />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

describe("TopNBars", () => {
  it("renders top N items", () => {
    render(<TopNBars items={TOPN_DATA} color="#2563eb" />);
    expect(screen.getByText("Card A")).toBeInTheDocument();
    expect(screen.getByText("Card B")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(<TopNBars items={[]} color="#000" loading />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows empty state when no items", () => {
    render(<TopNBars items={[]} color="#000" />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });
});

describe("ResponseTimeHistogram", () => {
  it("renders response time buckets", () => {
    render(<ResponseTimeHistogram data={RT_DATA} color="#2563eb" />);
  });

  it("shows loading state", () => {
    render(<ResponseTimeHistogram data={[]} color="#000" loading />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

describe("CalendarHeatmap", () => {
  it("renders a cell for each data point", () => {
    render(<CalendarHeatmap data={HEATMAP_DATA} />);
    // Each data cell has an aria-label
    const cells = document.querySelectorAll("[data-heatmap-date]");
    expect(cells.length).toBeGreaterThanOrEqual(2);
  });

  it("shows loading state", () => {
    render(<CalendarHeatmap data={[]} loading />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows empty state when no data", () => {
    render(<CalendarHeatmap data={[]} />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });
});
