/**
 * Straight-line (haversine) route optimizer. This is NOT road-network
 * distance - it's a fast, dependency-free, offline-testable approximation
 * good enough for ordering door-to-door stops in a dense residential area.
 *
 * Swap this out for Google Directions' waypoint optimizer (V2 in the spec)
 * once you're ready to pay for real road-network routing - the function
 * signature here (list of {id, lat, lng} points, optional fixed start/end)
 * is designed to be a drop-in replacement target.
 */

const EARTH_RADIUS_MILES = 3958.8;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineMiles(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pathDistance(points, start, end) {
  let total = 0;
  let prev = start || points[0];
  const seq = start ? points : points.slice(1);
  for (const p of seq) {
    total += haversineMiles(prev, p);
    prev = p;
  }
  if (end) total += haversineMiles(prev, end);
  return total;
}

/**
 * Nearest-neighbor construction. If `start` is given, the tour begins from
 * that point (not included in the returned stop list). If `end` is given,
 * the point nearest to `end` is reserved and placed last.
 */
function nearestNeighborOrder(points, start, end) {
  const pool = [...points];
  const ordered = [];

  let reservedEnd = null;
  if (end && pool.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    pool.forEach((p, i) => {
      const d = haversineMiles(p, end);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    // Only reserve as a distinct "last stop" if there's more than one point -
    // otherwise it's both the first and only stop.
    if (pool.length > 1) {
      reservedEnd = pool.splice(bestIdx, 1)[0];
    }
  }

  let cursor = start || (pool.length > 0 ? pool[0] : null);
  if (!start && pool.length > 0) {
    ordered.push(pool.shift());
    cursor = ordered[0];
  }

  while (pool.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    pool.forEach((p, i) => {
      const d = haversineMiles(cursor, p);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    const next = pool.splice(bestIdx, 1)[0];
    ordered.push(next);
    cursor = next;
  }

  if (reservedEnd) ordered.push(reservedEnd);
  return ordered;
}

/**
 * Basic 2-opt local-search improvement. Keeps the first/last stop fixed if
 * `fixedEnds` is true (i.e. start/end were externally specified), since
 * those shouldn't move. Bounded iteration count to stay fast for reasonable
 * route sizes (a few dozen to low hundreds of stops).
 */
function twoOptImprove(points, start, end, maxIterations = 200) {
  let route = points;
  if (route.length < 4) return route;

  let improved = true;
  let iterations = 0;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const a = i === 0 ? start || route[0] : route[i - 1];
        const b = route[i];
        const c = route[j];
        const d = j === route.length - 1 ? end || route[j] : route[j + 1];

        if (a === b || c === d) continue;

        const currentDist = haversineMiles(a, b) + haversineMiles(c, d);
        const swappedDist = haversineMiles(a, c) + haversineMiles(b, d);

        if (swappedDist < currentDist - 0.001) {
          const reversed = route.slice(i, j + 1).reverse();
          route = [...route.slice(0, i), ...reversed, ...route.slice(j + 1)];
          improved = true;
        }
      }
    }
  }

  return route;
}

/**
 * @param {Array<{id: string, lat: number, lng: number}>} points - stops to order
 * @param {{lat:number, lng:number}|null} start - fixed starting point, or null
 * @param {{lat:number, lng:number}|null} end - fixed ending point, or null
 * @returns {{ order: Array, distanceMiles: number }}
 */
function optimizeOrder(points, start = null, end = null) {
  if (points.length === 0) return { order: [], distanceMiles: 0 };
  if (points.length === 1) return { order: points, distanceMiles: pathDistance(points, start, end) };

  let order = nearestNeighborOrder(points, start, end);
  order = twoOptImprove(order, start, end);

  return { order, distanceMiles: Math.round(pathDistance(order, start, end) * 10) / 10 };
}

module.exports = { optimizeOrder, haversineMiles };
