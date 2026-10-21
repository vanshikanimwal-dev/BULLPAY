/**
 * @param {{ now: () => Date | string | number }} ctx
 */
export function clock(ctx) {
  const value = ctx.now();
  return value instanceof Date ? value : new Date(value);
}

/**
 * @param {{ now: () => Date | string | number }} ctx
 */
export function iso(ctx) {
  return clock(ctx).toISOString();
}
