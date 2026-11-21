/**
 * rank.mjs — percentile rank across the universe (spec §5).
 *
 * percentileRank(values, value) = the share of the universe at or below
 * `value`, with ties counted at half: (below + 0.5 × equal) / n × 100.
 * Returns 0–100, or null on an empty universe. Used for RS percentile
 * (plan §4.3) and group strength.
 */
export function percentileRank(values, value) {
  if (!values || !values.length || value == null) return null;
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  return ((below + 0.5 * equal) / values.length) * 100;
}
