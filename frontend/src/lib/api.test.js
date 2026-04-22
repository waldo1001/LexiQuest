import { describe, it, expect, vi } from "vitest";
import { fetchHelloMessage } from "./api.js";

describe("fetchHelloMessage", () => {
  it("returns the msg string on a 200 JSON response", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ msg: "Hello from LexiQuest" }),
    });

    const msg = await fetchHelloMessage({ fetchFn: fakeFetch });

    expect(msg).toBe("Hello from LexiQuest");
    expect(fakeFetch).toHaveBeenCalledWith("/api/hello");
  });

  it("throws when the response status is not ok", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    await expect(fetchHelloMessage({ fetchFn: fakeFetch })).rejects.toThrow();
  });
});
