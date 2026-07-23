// Combines a config-wide default mask list with a capture step's own,
// deduped and order-preserving (defaults first).
export function mergeMasks(defaultMask, stepMask) {
  const merged = [...(defaultMask ?? []), ...(stepMask ?? [])];
  return [...new Set(merged)];
}
