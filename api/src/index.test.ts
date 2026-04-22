import { vi, describe, it, expect, beforeAll } from "vitest";

const registered: string[] = [];
vi.mock("@azure/functions", () => ({
  app: {
    http: vi.fn((name: string) => {
      registered.push(name);
    }),
  },
}));

describe("composition root", () => {
  beforeAll(async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
    process.env.SESSION_SECRET = "smoke-secret-min-16-chars-ok";
    await import("./index.js");
  });

  it("registers all API functions when env vars are present", () => {
    expect(registered).toEqual(
      expect.arrayContaining([
        "hello",
        "login",
        "logout",
        "me",
        "users",
        "users-public",
        "users-id",
        "years",
        "years-id",
        "courses",
        "courses-id",
      ]),
    );
  });
});
