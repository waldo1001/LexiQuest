import { describe, it, expect } from "vitest";
import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { hello } from "./hello.js";

function makeRequest(): HttpRequest {
  return {} as unknown as HttpRequest;
}

function makeContext(): InvocationContext {
  return {} as unknown as InvocationContext;
}

describe("hello", () => {
  it("returns 200 and 'Hello from LexiQuest' as JSON", async () => {
    const response = (await hello(
      makeRequest(),
      makeContext(),
    )) as HttpResponseInit;

    expect(response.status ?? 200).toBe(200);
    expect(response.jsonBody).toEqual({ msg: "Hello from LexiQuest" });
  });
});
