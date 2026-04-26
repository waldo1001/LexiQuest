import { describe, it, expect } from "vitest";
import { isAzuriteConnectionString } from "./connection-string-guard.js";

describe("isAzuriteConnectionString", () => {
  it("accepts UseDevelopmentStorage shorthand", () => {
    expect(isAzuriteConnectionString("UseDevelopmentStorage=true")).toBe(true);
    expect(isAzuriteConnectionString("UseDevelopmentStorage=true;")).toBe(true);
    expect(isAzuriteConnectionString("  UseDevelopmentStorage=true  ")).toBe(
      true,
    );
  });

  it("accepts http endpoint pointing at 127.0.0.1", () => {
    const cs =
      "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;" +
      "AccountKey=fake==;" +
      "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;" +
      "TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;";
    expect(isAzuriteConnectionString(cs)).toBe(true);
  });

  it("accepts http endpoint pointing at localhost", () => {
    const cs =
      "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;" +
      "AccountKey=fake==;" +
      "TableEndpoint=http://localhost:10002/devstoreaccount1;";
    expect(isAzuriteConnectionString(cs)).toBe(true);
  });

  it("rejects a real Azure storage account string", () => {
    const cs =
      "DefaultEndpointsProtocol=https;AccountName=stlexiquest;" +
      "AccountKey=fake==;EndpointSuffix=core.windows.net";
    expect(isAzuriteConnectionString(cs)).toBe(false);
  });

  it("rejects empty or undefined input", () => {
    expect(isAzuriteConnectionString(undefined)).toBe(false);
    expect(isAzuriteConnectionString("")).toBe(false);
    expect(isAzuriteConnectionString("   ")).toBe(false);
  });

  it("rejects an https string that merely contains 127.0.0.1 as a substring", () => {
    const cs =
      "DefaultEndpointsProtocol=https;AccountName=fake127001prod;" +
      "AccountKey=fake==;EndpointSuffix=core.windows.net";
    expect(isAzuriteConnectionString(cs)).toBe(false);
  });
});
