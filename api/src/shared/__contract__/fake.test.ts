import { FakeTableStorage } from "../../../testing/fake-table-storage.js";
import { runTableStorageContract } from "./table-storage.contract.js";

runTableStorageContract("FakeTableStorage", () => new FakeTableStorage());
