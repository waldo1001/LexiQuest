import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { AppProvider, useAppContext } from "./AppContext.jsx";

const wrapper = ({ children }) => <AppProvider>{children}</AppProvider>;

describe("dark mode", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("DM-1: setDarkMode('dark') sets data-theme=dark on documentElement", () => {
    const { result } = renderHook(() => useAppContext(), { wrapper });
    act(() => result.current.setDarkMode("dark"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("DM-2: setDarkMode('light') sets data-theme=light on documentElement", () => {
    const { result } = renderHook(() => useAppContext(), { wrapper });
    act(() => result.current.setDarkMode("light"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("DM-3: setDarkMode('system') removes data-theme attribute", () => {
    const { result } = renderHook(() => useAppContext(), { wrapper });
    act(() => result.current.setDarkMode("dark"));
    act(() => result.current.setDarkMode("system"));
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("DM-4: darkMode state is accessible from context", () => {
    const { result } = renderHook(() => useAppContext(), { wrapper });
    act(() => result.current.setDarkMode("dark"));
    expect(result.current.darkMode).toBe("dark");
  });
});
