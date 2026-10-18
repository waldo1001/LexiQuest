import { HttpResponse, type HttpResponseInit } from "@azure/functions";
import { bodyOf, headersOf } from "./http.js";

describe("bodyOf", () => {
  it("bodyOf returns jsonBody of an HttpResponseInit; throws on HttpResponse", () => {
    const init: HttpResponseInit = { status: 200, jsonBody: { a: 1 } };
    expect(bodyOf<{ a: number }>(init)).toEqual({ a: 1 });
    expect(() => bodyOf(new HttpResponse({ status: 200 }))).toThrow(/HttpResponse/);
  });

  it("returns undefined when there is no jsonBody", () => {
    expect(bodyOf({ status: 204 })).toBeUndefined();
  });
});

describe("headersOf", () => {
  it("reads a plain record", () => {
    expect(headersOf({ headers: { "Cache-Control": "no-store" } })).toEqual({ "Cache-Control": "no-store" });
  });

  it("reads a Headers instance and a tuple array", () => {
    expect(headersOf({ headers: new Headers({ "x-a": "1" }) })).toEqual({ "x-a": "1" });
    expect(headersOf({ headers: [["x-b", "2"]] })).toEqual({ "x-b": "2" });
  });

  it("is empty without headers and throws on HttpResponse", () => {
    expect(headersOf({ status: 200 })).toEqual({});
    expect(() => headersOf(new HttpResponse({ status: 200 }))).toThrow(/HttpResponse/);
  });
});
