/**
 * Mirrors src/lib/solarFit.js on the backend exactly - kept as a duplicate
 * rather than a shared import since the admin app and API aren't bundled
 * together. If the scoring weights ever change, update both copies.
 *
 * Used here (unlike the backend copy) to score ScoutHive preview rows live
 * in the browser as a manager fetches valuation/property details per row -
 * the backend preview endpoint doesn't have pool/sqft data until that
 * on-demand fetch happens, so scoring happens here instead of over there.
 */

const MAX_SCORE = 100;

export function computeSolarFitScore(fields) {
  const { has_pool, estimated_value, square_footage, year_built, purchase_date, has_solar, no_further_attempt } = fields;

  if (has_solar) {
    return { score: 0, max_score: MAX_SCORE, reasons: ['Already has solar on file'], excluded: true };
  }
  if (no_further_attempt) {
    return { score: 0, max_score: MAX_SCORE, reasons: ['Marked no further attempt'], excluded: true };
  }

  const reasons = [];
  let score = 0;

  if (has_pool === true) {
    score += 30;
    reasons.push('Has a pool (pool pumps/heaters drive up electric bills)');
  }

  if (estimated_value != null) {
    if (estimated_value >= 500000) {
      score += 20;
      reasons.push('High home value ($500k+)');
    } else if (estimated_value >= 350000) {
      score += 12;
      reasons.push('Above-average home value ($350k+)');
    }
  }

  if (square_footage != null) {
    if (square_footage >= 2800) {
      score += 15;
      reasons.push('Large home (2,800+ sqft)');
    } else if (square_footage >= 2000) {
      score += 8;
      reasons.push('Above-average size home (2,000+ sqft)');
    }
  }

  if (purchase_date) {
    const monthsAgo = (Date.now() - new Date(purchase_date).getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsAgo <= 6) {
      score += 15;
      reasons.push('Purchased within the last 6 months');
    } else if (monthsAgo <= 12) {
      score += 8;
      reasons.push('Purchased within the last year');
    }
  }

  if (year_built != null && year_built < 1990) {
    score -= 5;
    reasons.push('Older home (pre-1990) — may need a roof check first');
  }

  score = Math.max(0, Math.min(MAX_SCORE, score));

  if (reasons.length === 0) {
    reasons.push('Fetch estimate/details to score this lead');
  }

  return { score, max_score: MAX_SCORE, reasons, excluded: false };
}
