/**
 * Solar Fit Score: a transparent heuristic for prioritizing which leads are
 * most likely to be good solar prospects, using ONLY data already legitimately
 * sourced elsewhere in this app (county property records, purchase history,
 * and rep-collected flags). This is not a purchased or scraped intent signal
 * - it's a proxy score built from public property characteristics, the same
 * kind of targeting logic solar sales orgs commonly use.
 *
 * IMPORTANT: this is a heuristic, not a guarantee. It estimates likely fit
 * based on defensible but imperfect assumptions (documented inline below).
 * Treat it as a sort order to prioritize door-knocking, not as a claim that
 * any specific person wants or has requested solar information.
 *
 * Every point awarded comes with a human-readable reason, so a manager or
 * rep can see exactly why a lead scored the way it did - this is
 * deliberately not a black box.
 */

const MAX_SCORE = 100;

function computeSolarFitScore(fields) {
  const {
    has_pool,
    estimated_value,
    square_footage,
    year_built,
    purchase_date,
    has_solar,
    no_further_attempt
  } = fields;

  // Already has solar, or explicitly marked not to re-approach - not a
  // prospect at all. Score of 0 with a clear reason, not just a low number
  // buried among real prospects.
  if (has_solar) {
    return { score: 0, max_score: MAX_SCORE, reasons: ['Already has solar on file'], excluded: true };
  }
  if (no_further_attempt) {
    return { score: 0, max_score: MAX_SCORE, reasons: ['Marked no further attempt'], excluded: true };
  }

  const reasons = [];
  let score = 0;

  // Pool: the single strongest signal here. Pool pumps and heaters are a
  // well-documented major driver of high electric bills, which is the most
  // common reason homeowners actually pursue solar.
  if (has_pool === true) {
    score += 30;
    reasons.push('Has a pool (pool pumps/heaters drive up electric bills)');
  }

  // Higher-value homes more often have the equity or credit profile to
  // finance a solar system, and tend to run larger HVAC loads.
  if (estimated_value != null) {
    if (estimated_value >= 500000) {
      score += 20;
      reasons.push('High home value ($500k+)');
    } else if (estimated_value >= 350000) {
      score += 12;
      reasons.push('Above-average home value ($350k+)');
    }
  }

  // Bigger homes generally mean bigger energy bills and more usable roof
  // area for panels.
  if (square_footage != null) {
    if (square_footage >= 2800) {
      score += 15;
      reasons.push('Large home (2,800+ sqft) — bigger bills, more roof area');
    } else if (square_footage >= 2000) {
      score += 8;
      reasons.push('Above-average size home (2,000+ sqft)');
    }
  }

  // Recently moved in - the classic "new mover" window where homeowners
  // are actively making improvement decisions. Weighted a bit lower than
  // pool/value/size since it's a general home-improvement signal, not
  // solar-specific.
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

  // A very old roof may need replacement before solar can go on it, which
  // is a real objection installers run into - a mild negative rather than
  // a hard exclusion, since it doesn't rule out the sale, just flags a
  // likely conversation point.
  if (year_built != null && year_built < 1990) {
    score -= 5;
    reasons.push('Older home (pre-1990) — may need a roof check before installation');
  }

  score = Math.max(0, Math.min(MAX_SCORE, score));

  if (reasons.length === 0) {
    reasons.push('No scoring signals available yet — look up property details to improve this estimate');
  }

  return { score, max_score: MAX_SCORE, reasons, excluded: false };
}

module.exports = { computeSolarFitScore };
