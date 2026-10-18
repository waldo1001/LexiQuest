import { makeSessionRow, makeUserRow } from "./rows.js";

describe("rows factories", () => {
  it("makeSessionRow defaults satisfy SessionRow; overrides win", () => {
    const row = makeSessionRow();
    expect(row).toMatchObject({ game_type: "classic", card_limit: null, card_order: "random" });
    expect(row.started_at).toBe("2026-01-01T00:00:00.000Z");
    const custom = makeSessionRow({ user_id: "u9", card_limit: 10, game_type: "boss_round" });
    expect(custom).toMatchObject({ user_id: "u9", card_limit: 10, game_type: "boss_round" });
  });

  it("makeUserRow defaults satisfy UserRow; settings override merges shallowly", () => {
    const row = makeUserRow();
    expect(row.partitionKey).toBe("users");
    expect(row.settings).toMatchObject({ auto_speak: expect.any(Boolean), daily_goal: expect.any(Number) });
    const custom = makeUserRow({ name: "Lex", settings: { daily_goal: 50 } });
    expect(custom.name).toBe("Lex");
    expect(custom.settings.daily_goal).toBe(50);
    expect(custom.settings.preferred_mode).toBe(row.settings.preferred_mode);
  });
});
