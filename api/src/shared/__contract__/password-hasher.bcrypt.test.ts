import { BcryptPasswordHasher } from "../bcrypt-password-hasher.js";
import { runPasswordHasherContract } from "./password-hasher.contract.js";

// cost 4 keeps the bcrypt suite fast (<1s on a laptop) while still
// exercising the real algorithm.
runPasswordHasherContract(
  "BcryptPasswordHasher (cost 4)",
  () => new BcryptPasswordHasher({ cost: 4 }),
);
