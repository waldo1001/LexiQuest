import { HttpResponse, type HttpResponseInit } from "@azure/functions";

type AnyHttpResponse = HttpResponseInit | HttpResponse;

function asInit(res: AnyHttpResponse): HttpResponseInit {
  if (res instanceof HttpResponse) {
    throw new Error("expected an HttpResponseInit, got an HttpResponse instance");
  }
  return res;
}

/** The `jsonBody` of a handler's response, typed as the caller's `T` (the caller asserts the shape). */
export function bodyOf<T = unknown>(res: AnyHttpResponse): T {
  return asInit(res).jsonBody as T;
}

/** The response headers as a plain string record (handlers return a record, tests index it). */
export function headersOf(res: AnyHttpResponse): Record<string, string> {
  const headers = asInit(res).headers;
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers as Array<[string, string]>);
  return { ...(headers as Record<string, string>) };
}
