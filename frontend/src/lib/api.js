/**
 * Fetch the `/api/hello` greeting, returning its `msg` string.
 *
 * @param {{ fetchFn?: typeof fetch }} [options]
 * @returns {Promise<string>}
 */
export async function fetchHelloMessage({ fetchFn = fetch } = {}) {
  const response = await fetchFn("/api/hello");
  if (!response.ok) {
    throw new Error(`GET /api/hello failed with status ${response.status}`);
  }
  const body = await response.json();
  return body.msg;
}
