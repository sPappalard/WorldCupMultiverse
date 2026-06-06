/**
 * Shared odds/percentage formatters used across the dashboard.
 * Single source of truth for the bookmaker-style odds look.
 */

/**
 * Bookmaker-style decimal odds from a probability.
 * Applies a margin (overround): shrinking the effective prob makes the odds a
 * bit shorter than the "fair" 1/p — like a real betting book.
 * @param p probability 0–1
 * @param margin factor < 1 (default 0.85 ≈ 18% overround)
 */
export const oddsFromProb = (p: number, margin = 0.85): string => {
  if (p <= 0) return '—';
  const o = 1 / (p * margin);
  if (o >= 100) return Math.round(o).toString();
  if (o >= 10) return o.toFixed(1);
  return o.toFixed(2);
};

/**
 * Readable percentage: rounds favorites to an integer, but shows one decimal
 * for tails (below 1%) so they don't collapse to "0%". Below 0.05% → "<0.1%".
 */
export const pctSmart = (x: number): string => {
  const p = x * 100;
  if (p >= 1) return `${Math.round(p)}%`;
  if (p >= 0.05) return `${p.toFixed(1)}%`;
  if (p > 0) return '<0.1%';
  return '0%';
};

/** Plain integer percentage (used for per-match odds). */
export const pctInt = (x: number): string => `${Math.round(x * 100)}%`;
