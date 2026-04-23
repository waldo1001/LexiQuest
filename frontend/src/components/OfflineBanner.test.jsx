import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import OfflineBanner from "./OfflineBanner.jsx";

function setOnline(value) {
  Object.defineProperty(navigator, "onLine", { value, writable: true, configurable: true });
}

describe("OfflineBanner", () => {
  beforeEach(() => setOnline(true));
  afterEach(() => setOnline(true));

  it("OB-1: does not render when online", () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("OB-2: renders when navigator.onLine is false", () => {
    setOnline(false);
    render(<OfflineBanner />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("OB-3: shows when offline event fires", () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("OB-4: hides when online event fires after going offline", () => {
    setOnline(false);
    render(<OfflineBanner />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
