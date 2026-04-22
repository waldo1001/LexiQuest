import { FakeSessionSigner } from "../../../testing/fake-session-signer.js";
import { FakeClock } from "../../../testing/fake-clock.js";
import { runSessionSignerContract } from "./session-signer.contract.js";

runSessionSignerContract("FakeSessionSigner", () => {
  const clock = new FakeClock("2026-04-22T09:00:00Z");
  return { signer: new FakeSessionSigner(clock), clock };
});
