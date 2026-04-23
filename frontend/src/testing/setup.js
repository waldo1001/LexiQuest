import "@testing-library/jest-dom/vitest";

// Recharts uses ResizeObserver internally — provide a stub for jsdom
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
