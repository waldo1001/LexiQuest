import { HmacSessionSigner } from "../session-signer.js";
import { FakeClock } from "../../../testing/fake-clock.js";
import { runSessionSignerContract } from "./session-signer.contract.js";

runSessionSignerContract("HmacSessionSigner", () => {
  const clock = new FakeClock("2026-04-22T09:00:00Z");
  return {
    signer: new HmacSessionSigner({
      secret: "test-secret-32-bytes-abcdefghijk",
      clock,
    }),
    clock,
  };
});
