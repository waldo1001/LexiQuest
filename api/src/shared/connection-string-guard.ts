/**
 * Returns true only when the connection string points at Azurite.
 *
 * The export/import scripts use this as a safety latch: import-local
 * MUST refuse to run unless this returns true, otherwise a misconfigured
 * shell could overwrite production tables.
 *
 * Accepted shapes:
 * - `UseDevelopmentStorage=true` (the well-known Azurite shorthand)
 * - A full connection string starting with `DefaultEndpointsProtocol=http;`
 *   AND whose `TableEndpoint` (or `BlobEndpoint`/`QueueEndpoint`) targets
 *   `127.0.0.1` or `localhost`.
 *
 * Anything starting with `https://` is rejected — Azurite never uses TLS.
 */
export function isAzuriteConnectionString(s: string | undefined): boolean {
  if (typeof s !== "string") return false;
  const trimmed = s.trim();
  if (trimmed.length === 0) return false;

  if (/^UseDevelopmentStorage=true;?$/i.test(trimmed)) return true;

  if (!/(^|;)DefaultEndpointsProtocol=http(;|$)/i.test(trimmed)) return false;

  return /(^|;)(Table|Blob|Queue)Endpoint=http:\/\/(127\.0\.0\.1|localhost)(:|\/)/i.test(
    trimmed,
  );
}
