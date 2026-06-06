/**
 * Strength Score: one synthetic number per team that captures EVERYTHING acting
 * in the simulation, using the current modulator weights:
 *   - Bayesian attack/defense parameters (core)
 *   - Elo, squad-value and form modulators
 *   - H2H history
 *   - shrinkage (lambdaShrink)
 *   - home advantage for the hosts (reduced weight: group stage only)
 *   - KO experience (knockout + history) that decides shootouts
 *
 * Method: for each team, compute its average win probability against ALL others,
 * blending the group scenario (with possible home advantage) and the KO scenario
 * (where draws go to penalties, assigned via the experience edge). Then map the
 * average win rate onto a 0–100 scale. Mirrors the engine's real pipeline.
 */

import type { Team, ModelParams, H2HRecord, TeamStats, ModulatorConfig, GlobalParams } from './types';
import { scorelineDist, eloToStrength, buildModulatorStats } from './matchModel';
import { config } from '../config';

export interface TeamStrengthScore {
  teamId: string;
  /** Normalized 0–100 score (the strongest team ≈ 100). */
  score: number;
  /** Average win probability against all others (0–1). */
  avgWinRate: number;
  /** Average not-lose probability (win + draw), 0–1. */
  avgNotLoseRate: number;
}

export interface StrengthInput {
  teams: Team[];
  params: ModelParams | null;
  h2h?: Map<string, H2HRecord>;
  teamStats?: Map<string, TeamStats>;
  modulators: ModulatorConfig;
  /** If true, also include Italy (ITA), treating it as active. */
  includeItaly?: boolean;
}

/** P(home>away) and P(draw) from a cumulative scoreline distribution. */
function outcomesFrom(flat: Float64Array, cols: number): { win: number; draw: number } {
  let win = 0, draw = 0;
  for (let idx = 0; idx < flat.length; idx++) {
    const p = idx === 0 ? flat[0] : flat[idx] - flat[idx - 1];
    const hg = Math.floor(idx / cols);
    const ag = idx % cols;
    if (hg > ag) win += p;
    else if (hg === ag) draw += p;
  }
  return { win, draw };
}

/**
 * Penalty-shootout win probability, replicating the simulator exactly:
 * base = λ share, corrected by KO experience (knockout + history).
 */
function penaltyWinProb(
  a: Team, b: Team,
  lambdaA: number, lambdaB: number,
  teamStats: Map<string, TeamStats> | undefined,
  mod: ModulatorConfig,
): number {
  let pA = lambdaA / (lambdaA + lambdaB || 1);
  const sa = teamStats?.get(a.id);
  const sb = teamStats?.get(b.id);
  const koA = sa ? mod.koKnockoutWeight * sa.knockout.score + mod.koHistoryWeight * sa.history.score : 50;
  const koB = sb ? mod.koKnockoutWeight * sb.knockout.score + mod.koHistoryWeight * sb.history.score : 50;
  const expEdge = ((koA - koB) / 100) * mod.koExperienceCoeff;
  return Math.max(0.05, Math.min(0.95, pA + expEdge));
}

/**
 * Fraction of a team's tournament "life" played in the group stage (where home
 * advantage counts for the hosts) vs the knockouts. A run is 3 group matches +
 * up to 7 KO matches, so we weight home advantage by the discounted group share.
 */
const GROUP_SHARE = 3 / 10; // ~3 group games out of ~10 potential total

/**
 * Compute the Strength Score for every relevant team.
 * O(n²) over the ~48 teams: negligible (a few ms).
 */
export function computeStrengthScores(input: StrengthInput): TeamStrengthScore[] {
  const pool = input.teams.filter((t) => t.active || (input.includeItaly && t.id === 'ITA'));

  const globalParams: GlobalParams = input.params?.global ?? {
    intercept: config.modelDefaults.intercept,
    homeAdv: config.modelDefaults.homeAdv,
    rho: config.modelDefaults.rho,
  };

  // Modulator stats computed over active teams only (consistent with the engine).
  const activeForStats = input.teams.filter((t) => t.active);
  const modStats = buildModulatorStats(
    activeForStats.map((t) => t.elo),
    activeForStats.map((t) => t.squadValue ?? 0),
  );

  const strengthOf = (t: Team) => input.params?.teams[t.id] ?? eloToStrength(t.elo);

  const results: TeamStrengthScore[] = [];

  const mod = input.modulators;

  for (const a of pool) {
    let sumWin = 0, sumNotLose = 0;
    let n = 0;
    for (const b of pool) {
      if (a.id === b.id) continue;

      // --- KO scenario (neutral venue, whole-match experience bonus) ---
      const distKo = scorelineDist(
        strengthOf(a), strengthOf(b), globalParams, false,
        a.id, b.id, input.h2h, input.teamStats,
        a.elo, b.elo, a.squadValue ?? 0, b.squadValue ?? 0,
        modStats, mod, /* knockout */ true,
      );
      const ko = outcomesFrom(distKo.flat, distKo.cols);
      // In KO, draws go to penalties: assign the draws by the experience edge
      // (knockout + history), exactly as the simulator does.
      const pPenA = penaltyWinProb(a, b, distKo.lambdaHome, distKo.lambdaAway, input.teamStats, mod);
      const koWin = ko.win + ko.draw * pPenA;
      const koNotLose = ko.win + ko.draw; // not-lose = not eliminated in 90'

      // --- Group scenario (home advantage if a is a host) ---
      let grpWin = ko.win;
      let grpNotLose = ko.win + ko.draw;
      if (a.isHost) {
        const distHome = scorelineDist(
          strengthOf(a), strengthOf(b), globalParams, true,
          a.id, b.id, input.h2h, input.teamStats,
          a.elo, b.elo, a.squadValue ?? 0, b.squadValue ?? 0,
          modStats, mod,
        );
        const g = outcomesFrom(distHome.flat, distHome.cols);
        grpWin = g.win;
        grpNotLose = g.win + g.draw;
      }

      // Overall strength = blend of group (with home adv) + KO (with penalties).
      const win = GROUP_SHARE * grpWin + (1 - GROUP_SHARE) * koWin;
      const notLose = GROUP_SHARE * grpNotLose + (1 - GROUP_SHARE) * koNotLose;
      sumWin += win;
      sumNotLose += notLose;
      n++;
    }
    const avgWinRate = n > 0 ? sumWin / n : 0;
    const avgNotLoseRate = n > 0 ? sumNotLose / n : 0;
    results.push({ teamId: a.id, score: 0, avgWinRate, avgNotLoseRate });
  }

  // Normalize the average win rate onto 0–100 (min→0, max→100).
  const rates = results.map((r) => r.avgWinRate);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const span = max - min || 1;
  for (const r of results) {
    r.score = Math.round(((r.avgWinRate - min) / span) * 100);
  }

  results.sort((a, b) => b.avgWinRate - a.avgWinRate);
  return results;
}

// ─── Breakdown: how much each component weighs on the Strength Score ─────────

export interface StrengthComponent {
  key: 'core' | 'elo' | 'value' | 'form' | 'h2h' | 'home' | 'koExp';
  /** Display label; the UI renders by `key` via i18n, so this is informational. */
  label: string;
  /** Percentage share of the contribution (0–100), sums to ≈ 100. */
  pct: number;
}

/** Standard deviation of a list (how much a factor differentiates teams). */
function stdev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length);
}

/**
 * Decompose the Strength Score into per-factor contributions.
 *
 * Idea: all factors act in (additive) log-λ scale. For each one we measure how
 * much it VARIES strength across teams (std dev of its contribution over the
 * pool): a factor that gives everyone the same value differentiates nobody and
 * weighs 0; one that spreads teams far apart weighs a lot. Shares are normalized
 * to 100. Reactive to the weights: zeroing a coeff in Admin drops its slice to 0.
 */
export function computeStrengthBreakdown(input: StrengthInput): StrengthComponent[] {
  const pool = input.teams.filter((t) => t.active || (input.includeItaly && t.id === 'ITA'));
  const mod = input.modulators;

  const activeForStats = input.teams.filter((t) => t.active);
  const eloMean = activeForStats.reduce((s, t) => s + t.elo, 0) / (activeForStats.length || 1);
  const valueMean = activeForStats.reduce((s, t) => s + (t.squadValue ?? 0), 0) / (activeForStats.length || 1);
  const valueSd = Math.sqrt(
    activeForStats.reduce((s, t) => s + ((t.squadValue ?? 0) - valueMean) ** 2, 0) / (activeForStats.length || 1),
  ) || 1;

  const strengthOf = (t: Team) => input.params?.teams[t.id] ?? eloToStrength(t.elo);

  // Log-λ contribution of each factor, per team.
  const core: number[] = [];   // Bayesian attack + defense (on-pitch strength)
  const elo: number[] = [];
  const value: number[] = [];
  const form: number[] = [];
  const koExp: number[] = [];
  const home: number[] = [];

  for (const t of pool) {
    const st = strengthOf(t);
    core.push(st.attack + st.defense);
    elo.push(((t.elo - eloMean) / 200) * mod.eloCoeff);
    value.push(((t.squadValue ?? 0) - valueMean) / valueSd * mod.squadValueCoeff);
    const stats = input.teamStats?.get(t.id);
    form.push(stats ? ((stats.form.score - 50) / 50) * mod.formCoeff : 0);
    // KO experience: acts on the whole KO match (koMatchCoeff, ~70% of the
    // tournament) and on penalties (koExperienceCoeff, draws only). Sum the two
    // contributions, weighted by their presence in the tournament.
    const koScore = stats
      ? mod.koKnockoutWeight * stats.knockout.score + mod.koHistoryWeight * stats.history.score
      : 50;
    const koCentered = (koScore - 50) / 100;
    koExp.push(koCentered * (mod.koMatchCoeff * (1 - GROUP_SHARE) + mod.koExperienceCoeff * 0.1));
    // Home advantage: hosts only, discounted by the group share.
    home.push(t.isHost ? mod.homeAdvBoost * GROUP_SHARE : 0);
  }

  // H2H: estimate the average magnitude (depends on h2hMaxBoost and the data).
  // Proxy: per team, the average deviation of the H2H boost from 1.
  const h2hMag: number[] = pool.map((a) => {
    if (!input.h2h || input.h2h.size === 0) return 0;
    let sum = 0, c = 0;
    for (const b of pool) {
      if (a.id === b.id) continue;
      const rec = input.h2h.get([a.id, b.id].sort().join('|'));
      if (!rec || rec.n < 3) continue;
      // typical boost size ∝ h2hMaxBoost, weighted by how much data exists
      const w = Math.min(1, Math.sqrt(rec.n / config.h2h.h2hMinMatches));
      sum += mod.h2hMaxBoost * w;
      c++;
    }
    return c > 0 ? sum / c : 0;
  });

  // Magnitude = how much each factor DIFFERENTIATES the teams.
  const mags: Record<StrengthComponent['key'], number> = {
    core: stdev(core),
    elo: stdev(elo),
    value: stdev(value),
    form: stdev(form),
    koExp: stdev(koExp),
    home: stdev(home),
    h2h: h2hMag.reduce((a, b) => a + b, 0) / (h2hMag.length || 1),
  };

  const total = Object.values(mags).reduce((a, b) => a + b, 0) || 1;
  const labels: Record<StrengthComponent['key'], string> = {
    core: '⚔️ On-pitch strength (att/def)',
    elo: '📊 Elo',
    value: '💰 Squad value',
    form: '🔥 Form',
    koExp: '🏆 KO experience/history',
    home: '🏟️ Home advantage',
    h2h: '📋 Head-to-head',
  };

  return (Object.keys(mags) as StrengthComponent['key'][])
    .map((key) => ({ key, label: labels[key], pct: (mags[key] / total) * 100 }))
    .sort((a, b) => b.pct - a.pct);
}
