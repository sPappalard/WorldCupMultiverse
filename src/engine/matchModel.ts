/**
 * Match engine: bivariate Poisson, Dixon-Coles style.
 *
 *   λ_home = exp(intercept + attack_home − defense_away + homeAdv)
 *   λ_away = exp(intercept + attack_away − defense_home)
 *
 * The lambdas are then nudged by head-to-head history: if France and Italy have
 * met 13 times and France won 7, France's lambda gets a boost and Italy's a
 * penalty, scaled by sample size (little data → small adjustment).
 */

import type { GlobalParams, TeamStrength, H2HRecord, ModulatorConfig, TeamStats } from './types';
import { config } from '../config';

const MAX_GOALS = 8; // truncation: P(>8 goals) is negligible.

/** Poisson PMF: P(X = k | λ) = exp(-λ) · λ^k / k! */
function poissonPmf(k: number, lambda: number): number {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

/** Dixon-Coles τ correction for low-scoring results. */
function dcTau(i: number, j: number, lambda: number, mu: number, rho: number): number {
  if (i === 0 && j === 0) return 1 - lambda * mu * rho;
  if (i === 0 && j === 1) return 1 + lambda * rho;
  if (i === 1 && j === 0) return 1 + mu * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

export interface ScorelineDist {
  /** Flattened cumulative matrix for O(log n) sampling. */
  flat: Float64Array;
  /** Column count (MAX_GOALS+1) to decode index → (i,j). */
  cols: number;
  /** Expected goals, used to bias the penalty-shootout coin flip. */
  lambdaHome: number;
  lambdaAway: number;
}

/**
 * H2H lambda adjustment: when history exists for homeId vs awayId, pull the
 * lambdas toward the observed historical win rate.
 *
 * Mechanics:
 *   - Compute home's and away's historical win rates.
 *   - Compare against the win rate implied by the Poisson lambdas.
 *   - If history says home wins more than Elo suggests, scale λ_home by a
 *     factor > 1 (and λ_away down), and vice versa.
 *   - Adjustment weight grows with sqrt(n): weak at n=4, up to the configured
 *     cap (h2hMaxBoost) around n≥25.
 */
function applyH2H(
  lambdaHome: number,
  lambdaAway: number,
  homeId: string,
  awayId: string,
  h2h: Map<string, H2HRecord>,
  maxBoostOverride?: number,
): [number, number] {
  const [a, b] = homeId <= awayId ? [homeId, awayId] : [awayId, homeId];
  const rec = h2h.get(`${a}|${b}`);
  if (!rec || rec.n < 3) return [lambdaHome, lambdaAway];

  const homeIsA = homeId === a;
  const wHome = homeIsA ? rec.w_a / rec.n : rec.w_b / rec.n;
  const wAway = homeIsA ? rec.w_b / rec.n : rec.w_a / rec.n;

  const totalLambda = lambdaHome + lambdaAway;
  const impliedHome = lambdaHome / totalLambda;
  const impliedAway = lambdaAway / totalLambda;

  const { h2hMinMatches } = config.h2h;
  const h2hMaxBoost = maxBoostOverride ?? config.h2h.h2hMaxBoost;
  const weight = Math.min(1, Math.sqrt(rec.n / h2hMinMatches));
  const deltaHome = (wHome - impliedHome) * weight;
  const deltaAway = (wAway - impliedAway) * weight;

  const boostHome = Math.max(1 - h2hMaxBoost, Math.min(1 + h2hMaxBoost, 1 + deltaHome));
  const boostAway = Math.max(1 - h2hMaxBoost, Math.min(1 + h2hMaxBoost, 1 + deltaAway));

  return [lambdaHome * boostHome, lambdaAway * boostAway];
}

/**
 * Modulator stats precomputed once, so mean/sd aren't recomputed O(n) per pair.
 */
export interface ModulatorStats {
  eloMean: number;
  valueMean: number;
  valueSd: number;
}

/** Compute aggregate stats once over the active teams. */
export function buildModulatorStats(activeElos: number[], activeValues: number[]): ModulatorStats {
  const n = activeElos.length || 1;
  const eloMean = activeElos.reduce((a, b) => a + b, 0) / n;
  const valueMean = activeValues.reduce((a, b) => a + b, 0) / n;
  const valueSd = Math.sqrt(
    activeValues.reduce((s, v) => s + (v - valueMean) ** 2, 0) / n
  ) || 1;
  return { eloMean, valueMean, valueSd };
}

/**
 * Log-space modulator adjustment for one team.
 * Takes precomputed stats to avoid O(n) recompute per pair.
 */
function computeModulatorAdj(
  teamId: string,
  statsMap: Map<string, TeamStats>,
  ms: ModulatorStats,
  teamElo: number,
  teamValue: number,
  mod: ModulatorConfig,
): number {
  const stats = statsMap.get(teamId);

  // --- Recent form ---
  const formScore = stats?.form.score ?? 50;
  const formAdj = ((formScore - 50) / 50) * mod.formCoeff;

  // --- Squad value (z-score over active teams) ---
  const zValue = (teamValue - ms.valueMean) / ms.valueSd;
  const valueAdj = zValue * mod.squadValueCoeff;

  // --- Current Elo (distance from mean, in 200-point units) ---
  const eloAdj = ((teamElo - ms.eloMean) / 200) * mod.eloCoeff;

  return formAdj + valueAdj + eloAdj;
}

/** Build the scoreline distribution for a home vs away match. */
export function scorelineDist(
  home: TeamStrength,
  away: TeamStrength,
  g: GlobalParams,
  homeAdvantage: boolean,
  homeId?: string,
  awayId?: string,
  h2h?: Map<string, H2HRecord>,
  statsMap?: Map<string, TeamStats>,
  homeElo?: number,
  awayElo?: number,
  homeValue?: number,
  awayValue?: number,
  modStats?: ModulatorStats,
  modulators?: ModulatorConfig,
  /** True in knockout rounds: applies the KO-experience bonus. */
  knockout?: boolean,
): ScorelineDist {
  let lambdaHome = Math.exp(
    g.intercept + home.attack - away.defense + (homeAdvantage ? g.homeAdv : 0),
  );
  let lambdaAway = Math.exp(g.intercept + away.attack - home.defense);

  // Apply H2H history when available.
  if (homeId && awayId && h2h && h2h.size > 0) {
    [lambdaHome, lambdaAway] = applyH2H(lambdaHome, lambdaAway, homeId, awayId, h2h, modulators?.h2hMaxBoost);
  }

  // Apply form/value/elo modulators when available (precomputed stats).
  if (homeId && awayId && statsMap && modStats && modulators &&
      homeElo !== undefined && awayElo !== undefined &&
      homeValue !== undefined && awayValue !== undefined) {
    const adjHome = computeModulatorAdj(homeId, statsMap, modStats, homeElo, homeValue, modulators);
    const adjAway = computeModulatorAdj(awayId, statsMap, modStats, awayElo, awayValue, modulators);
    lambdaHome *= Math.exp(adjHome);
    lambdaAway *= Math.exp(adjAway);
  }

  // KO-experience bonus on the WHOLE knockout match: teams used to the latter
  // stages (history + knockout record) play the one-off game slightly better,
  // not just penalties. Small — it doesn't overturn the underlying ratings.
  if (knockout && homeId && awayId && statsMap && modulators) {
    const sh = statsMap.get(homeId);
    const sa = statsMap.get(awayId);
    const koHome = sh ? modulators.koKnockoutWeight * sh.knockout.score + modulators.koHistoryWeight * sh.history.score : 50;
    const koAway = sa ? modulators.koKnockoutWeight * sa.knockout.score + modulators.koHistoryWeight * sa.history.score : 50;
    // edge in [-1,1] × coeff → symmetric log-λ adjustment.
    const edge = ((koHome - koAway) / 100) * modulators.koMatchCoeff;
    lambdaHome *= Math.exp(edge);
    lambdaAway *= Math.exp(-edge);
  }

  // Shrinkage: pull both lambdas toward their geometric mean, narrowing the gap
  // between favorite and underdog. This raises outcome variance (more upsets) so
  // the tournament win distribution doesn't over-concentrate on the big teams
  // (e.g. keeps Spain near the bookmakers' ~16-18% instead of 28%). Individual
  // matches stay coherent, but small edges don't compound excessively over 7
  // rounds.
  const shrink = modulators?.lambdaShrink ?? 0;
  if (shrink > 0) {
    const mean = Math.sqrt(lambdaHome * lambdaAway);
    lambdaHome = lambdaHome * (1 - shrink) + mean * shrink;
    lambdaAway = lambdaAway * (1 - shrink) + mean * shrink;
  }

  const cols = MAX_GOALS + 1;
  const flat = new Float64Array(cols * cols);
  let total = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    const pi = poissonPmf(i, lambdaHome);
    for (let j = 0; j <= MAX_GOALS; j++) {
      const pj = poissonPmf(j, lambdaAway);
      const p = pi * pj * dcTau(i, j, lambdaHome, lambdaAway, g.rho);
      const v = p > 0 ? p : 0; // τ can make P slightly negative: clamp.
      flat[i * cols + j] = v;
      total += v;
    }
  }
  // Normalize into a cumulative distribution for sampling.
  let acc = 0;
  for (let k = 0; k < flat.length; k++) {
    acc += flat[k] / total;
    flat[k] = acc;
  }
  return { flat, cols, lambdaHome, lambdaAway };
}

/**
 * Hot-path sampler: returns the flat index of the sampled cell (no tuple
 * allocation), via binary search on the cumulative distribution. Caller decodes
 * with Math.floor(idx/cols) and idx%cols.
 */
export function sampleScorelineIndex(
  dist: ScorelineDist,
  rand: () => number,
): number {
  const u = rand();
  const flat = dist.flat;
  // Binary search on the (monotonically increasing) cumulative distribution.
  let lo = 0;
  let hi = flat.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (u > flat[mid]) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Convert Elo → attack/defense strength (fallback used until model-params.json
 * exists). See config.eloToStrength.
 */
export function eloToStrength(elo: number): TeamStrength {
  const { referenceElo, scalePer100Elo, attackShare } = config.eloToStrength;
  const edge = ((elo - referenceElo) / 100) * scalePer100Elo;
  return {
    attack: edge * attackShare,
    defense: edge * (1 - attackShare),
  };
}
