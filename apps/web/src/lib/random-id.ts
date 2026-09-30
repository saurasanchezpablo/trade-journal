/**
 * A random UUID (v4) in the browser. `crypto.randomUUID` exists only on secure pages
 * (HTTPS or localhost), so a journal opened at http://192.168.x.x could not add a rule or
 * an expense; `crypto.getRandomValues` works everywhere.
 */
export function randomId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi.randomUUID === "function" && globalThis.isSecureContext !== false)
    return cryptoApi.randomUUID();
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
