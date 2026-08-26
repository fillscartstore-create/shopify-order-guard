const CITIES = require('./pakCities');

// Levenshtein edit distance
function editDistance(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Validate a customer-entered city name against known Pakistani cities.
 * Returns { valid: bool, matched: string|null, distance: number, inputTooShort: bool }
 * - Exact match (case-insensitive) -> valid, distance 0
 * - Close typo (distance <= allowance based on word length) -> valid, "matched" shows the corrected name
 * - No close match -> invalid (likely garbage / wrong spelling / not a real city)
 */
function validateCity(rawCity) {
  const input = (rawCity || '').trim();
  if (input.length < 3) {
    return { valid: false, matched: null, distance: null, reason: 'too_short_or_empty' };
  }

  let best = null;
  let bestDist = Infinity;
  for (const city of CITIES) {
    const d = editDistance(input, city);
    if (d < bestDist) {
      bestDist = d;
      best = city;
    }
    if (d === 0) break;
  }

  // Allowance scales gently with word length: short names must be near-exact,
  // longer names tolerate 1-2 typo characters.
  const allowance = input.length <= 5 ? 1 : input.length <= 9 ? 2 : 3;

  if (bestDist === 0) {
    return { valid: true, matched: best, distance: 0, reason: 'exact_match' };
  }
  if (bestDist <= allowance) {
    return { valid: true, matched: best, distance: bestDist, reason: 'close_typo_accepted' };
  }
  return { valid: false, matched: best, distance: bestDist, reason: 'no_close_match' };
}

module.exports = { validateCity, editDistance };
