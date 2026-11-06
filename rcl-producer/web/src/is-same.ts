/** Whether two JSON-like values are the same, whatever order their objects' keys are in. */
export function isSame(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const entries = Object.entries(a);
  return (
    entries.length === Object.keys(b).length &&
    entries.every(([key, value]) => Object.hasOwn(b, key) && isSame(value, Reflect.get(b, key)))
  );
}
