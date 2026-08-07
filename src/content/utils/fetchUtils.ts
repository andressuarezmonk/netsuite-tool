/**
 * Low-level fetch helper used by the NetSuite API layer.
 * Strips HTML comments that NS appends to some responses before returning the body.
 */

export async function apiFetch(url: string): Promise<string> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  return text.replace(/<!--[\s\S]*$/, "").trim();
}
