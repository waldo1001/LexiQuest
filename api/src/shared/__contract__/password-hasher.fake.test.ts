import { FakePasswordHasher } from "../../../testing/fake-password-hasher.js";
import { runPasswordHasherContract } from "./password-hasher.contract.js";

runPasswordHasherContract("FakePasswordHasher", () => new FakePasswordHasher());
