/**
 * Monte Carlo engine — THE CRITICAL INVARIANT.
 * Every run SAMPLES a scoreline from the model and advances the SAMPLED winner
 * (not the favorite). After N runs, winProb = wins / N.
 */

import type {
  Team,
  ModelParams,
  TeamStrength,
  H2HRecord,
  MatchResult,
  GroupStanding,
  SampleRun,
  KnockoutRound,
  SimulationOutput,
  TeamAggregate,
  TeamStats,
  ModulatorConfig,
} from './types';
import { config } from '../config';
import { scorelineDist, sampleScorelineIndex, eloToStrength, buildModulatorStats, type ScorelineDist } from './matchModel';
import { RO32, allocateThirds, KNOCKOUT_ROUND_NAMES } from './bracket';
import { mulberry32 } from './rng';

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

/** P(home wins): sum the scoreline-matrix cells where hg > ag. */
function computeWinProb(dist: ScorelineDist): number {
  const cols = dist.cols;
  const n = dist.flat.length;
  let pWin = 0;
  // flat is cumulative: recover per-cell probabilities as consecutive diffs.
  for (let idx = 0; idx < n; idx++) {
    const p = idx === 0 ? dist.flat[0] : dist.flat[idx] - dist.flat[idx - 1];
    const hg = Math.floor(idx / cols);
    const ag = idx % cols;
    if (hg > ag) pWin += p;
  }
  return pWin;
}

export interface SimInput {
  teams: Team[];
  params: ModelParams | null;
  /** Historical head-to-head records to adjust lambdas (from h2h.json). */
  h2h?: Map<string, H2HRecord>;
  /** Per-team stats: form, knockout, history (from team-stats.json). */
  teamStats?: Map<string, TeamStats>;
  /** Per-team what-if strength overrides, as log-lambda deltas on attack+defense. */
  strengthOverrides?: Record<string, { attack: number; defense: number }>;
  /** Team substitutions (e.g. Italy in place of Bosnia). */
  substitutions?: Record<string, string>; // outId -> inId
  numRuns?: number;
  seed?: number;
  /** Chaos factor 0–1: interpolates final probabilities toward uniform. */
  chaos?: number;
  /** Runtime override of the modulator coefficients (from the Admin page). */
  modulators?: ModulatorConfig;
  /** Optional progress callback (0–1), called roughly every 1% of runs. */
  onProgress?: (fraction: number) => void;
  /** Optional callback fired as soon as the sample run (run 0) is ready, before
   *  the aggregates are computed. Enables the "cinema starts immediately" flow. */
  onSample?: (sample: SampleRun) => void;
}

/** Build the per-team strength map, applying what-if overrides. */
function buildStrengths(input: SimInput): Map<string, TeamStrength> {
  const map = new Map<string, TeamStrength>();
  for (const t of input.teams) {
    let s: TeamStrength;
    const p = input.params?.teams[t.id];
    if (p) s = { ...p };
    else s = eloToStrength(t.elo);

    const ov = input.strengthOverrides?.[t.id];
    if (ov) s = { attack: s.attack + ov.attack, defense: s.defense + ov.defense };
    map.set(t.id, s);
  }
  return map;
}

/** Resolve the actual group composition, applying substitutions. */
function buildGroups(input: SimInput): Map<string, Team[]> {
  const subs = input.substitutions ?? {};
  const byId = new Map(input.teams.map((t) => [t.id, t]));
  const groups = new Map<string, Team[]>();
  for (const g of GROUPS) groups.set(g, []);

  const replacedOut = new Set(Object.keys(subs)); // outgoing teams (e.g. BIH)
  const incomingIn = new Set(Object.values(subs)); // incoming teams (e.g. ITA)
  for (const t of input.teams) {
    if (!t.active) continue; // inactive entries (Italy by default) excluded
    if (replacedOut.has(t.id)) continue; // outgoing team leaves its group
    if (incomingIn.has(t.id)) continue; // incoming team handled below
    groups.get(t.group)?.push(t);
  }
  // Apply substitutions: the "in" team takes the "out" team's slot.
  for (const [outId, inId] of Object.entries(subs)) {
    const outTeam = byId.get(outId);
    const inTeam = byId.get(inId);
    if (!outTeam || !inTeam) continue;
    const arr = groups.get(outTeam.group);
    if (arr) arr.push({ ...inTeam, group: outTeam.group });
  }
  return groups;
}

/**
 * Precompute scoreline distributions for every relevant pair.
 * Produces TWO caches:
 *  - `group`: group-stage matches (home advantage for the hosts)
 *  - `ko`: knockout matches (no home advantage, but a whole-match KO-experience
 *    bonus for teams used to the latter stages)
 */
function buildDistCache(
  strengths: Map<string, TeamStrength>,
  globalParams: ModelParams['global'],
  hostIds: Set<string>,
  teams: Team[],
  h2h?: Map<string, H2HRecord>,
  teamStats?: Map<string, TeamStats>,
  modulators?: ModulatorConfig,
): { group: Map<string, ScorelineDist>; ko: Map<string, ScorelineDist> } {
  const group = new Map<string, ScorelineDist>();
  const ko = new Map<string, ScorelineDist>();
  const ids = [...strengths.keys()];

  const teamById = new Map(teams.map((t) => [t.id, t]));

  const activeTeams = teams.filter((t) => t.active);
  const modStats = buildModulatorStats(
    activeTeams.map((t) => t.elo),
    activeTeams.map((t) => t.squadValue ?? 0),
  );

  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      const home = strengths.get(a)!;
      const away = strengths.get(b)!;
      const homeAdv = hostIds.has(a); // home advantage in group stage only
      const teamA = teamById.get(a);
      const teamB = teamById.get(b);
      group.set(
        `${a}|${b}`,
        scorelineDist(
          home, away, globalParams, homeAdv, a, b, h2h, teamStats,
          teamA?.elo, teamB?.elo, teamA?.squadValue ?? 0, teamB?.squadValue ?? 0,
          modStats, modulators,
        ),
      );
      ko.set(
        `${a}|${b}`,
        scorelineDist(
          home, away, globalParams, false, a, b, h2h, teamStats,
          teamA?.elo, teamB?.elo, teamA?.squadValue ?? 0, teamB?.squadValue ?? 0,
          modStats, modulators, /* knockout */ true,
        ),
      );
    }
  }
  return { group, ko };
}

function rankGroup(standings: Map<string, GroupStanding>): GroupStanding[] {
  return [...standings.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    return b.goalsFor - a.goalsFor;
  });
}

const emptyStanding = (teamId: string): GroupStanding => ({
  teamId,
  played: 0,
  points: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  goalDifference: 0,
});

/** Group fixture with its dist resolved (precomputed outside the run loop). */
interface GroupFixture {
  homeId: string;
  awayId: string;
  dist: ScorelineDist;
}

/** Pre-resolve the 6 matches × 12 groups once, avoiding a string cache lookup
 *  for every match of every run (hot path). */
function buildGroupFixtures(
  groups: Map<string, Team[]>,
  cache: Map<string, ScorelineDist>,
): Map<string, GroupFixture[]> {
  const fixtures = new Map<string, GroupFixture[]>();
  for (const [g, teams] of groups) {
    const arr: GroupFixture[] = [];
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const homeId = teams[i].id;
        const awayId = teams[j].id;
        arr.push({ homeId, awayId, dist: cache.get(`${homeId}|${awayId}`)! });
      }
    }
    fixtures.set(g, arr);
  }
  return fixtures;
}

/** Run one full tournament. capture=true records details for the sample run. */
function runOnce(
  groups: Map<string, Team[]>,
  groupFixtures: Map<string, GroupFixture[]>,
  koCache: Map<string, ScorelineDist>,
  rand: () => number,
  capture: boolean,
  teamStats?: Map<string, TeamStats>,
  modulators?: ModulatorConfig,
): { championId: string; sample?: SampleRun; reached: Map<string, string> } {
  const groupStandings: Record<string, GroupStanding[]> = {};
  const groupResults: Record<string, MatchResult[]> = {};
  // Per team: the furthest round reached.
  const reached = new Map<string, string>();

  const winners: Record<string, string> = {};
  const runnersUp: Record<string, string> = {};
  const thirds: { teamId: string; group: string; standing: GroupStanding }[] = [];

  // --- GROUP STAGE ---
  for (const [g, teams] of groups) {
    const standings = new Map<string, GroupStanding>();
    for (const t of teams) standings.set(t.id, emptyStanding(t.id));
    const results: MatchResult[] = [];

    for (const fx of groupFixtures.get(g)!) {
      const dist = fx.dist;
      const idx = sampleScorelineIndex(dist, rand);
      const hg = (idx / dist.cols) | 0;
      const ag = idx % dist.cols;
      if (capture) {
        // winProb is only needed for the displayed sample run; skip it otherwise.
        const winProbHome = computeWinProb(dist);
        results.push({ homeId: fx.homeId, awayId: fx.awayId, homeGoals: hg, awayGoals: ag, winProbHome });
      }

      const hs = standings.get(fx.homeId)!;
      const as = standings.get(fx.awayId)!;
      hs.played++; as.played++;
      hs.goalsFor += hg; hs.goalsAgainst += ag;
      as.goalsFor += ag; as.goalsAgainst += hg;
      if (hg > ag) { hs.points += 3; }
      else if (hg < ag) { as.points += 3; }
      else { hs.points++; as.points++; }
    }
    for (const s of standings.values()) s.goalDifference = s.goalsFor - s.goalsAgainst;

    const ranked = rankGroup(standings);
    winners[g] = ranked[0].teamId;
    runnersUp[g] = ranked[1].teamId;
    thirds.push({ teamId: ranked[2].teamId, group: g, standing: ranked[2] });
    for (const r of ranked) reached.set(r.teamId, 'group');
    if (capture) {
      groupStandings[g] = ranked;
      groupResults[g] = results;
    }
  }

  // --- BEST 8 THIRD-PLACED TEAMS ---
  const rankedThirds = thirds
    .sort((a, b) => {
      const x = a.standing, y = b.standing;
      if (y.points !== x.points) return y.points - x.points;
      if (y.goalDifference !== x.goalDifference) return y.goalDifference - x.goalDifference;
      return y.goalsFor - x.goalsFor;
    })
    .slice(0, 8);
  const qualifiedGroups = rankedThirds.map((t) => t.group);
  const thirdByGroup = new Map(rankedThirds.map((t) => [t.group, t.teamId]));
  const thirdAlloc = allocateThirds(qualifiedGroups);

  // --- BUILD THE ROUND OF 32 ---
  const ro32Pairs: { homeId: string; awayId: string }[] = [];
  for (const slot of RO32) {
    const resolve = (ref: typeof slot.home): string => {
      if (ref.kind === 'winner') return winners[ref.group];
      if (ref.kind === 'runnerUp') return runnersUp[ref.group];
      const grp = thirdAlloc.get(slot.matchId);
      return grp ? thirdByGroup.get(grp)! : '';
    };
    ro32Pairs.push({ homeId: resolve(slot.home), awayId: resolve(slot.away) });
  }

  // Qualified to the R32.
  for (const p of ro32Pairs) {
    if (p.homeId) reached.set(p.homeId, 'ro32');
    if (p.awayId) reached.set(p.awayId, 'ro32');
  }

  // --- KNOCKOUT STAGE ---
  const knockoutRounds: KnockoutRound[] = [];
  const reachedKey = ['ro32', 'ro16', 'quarter', 'semi', 'final'];
  let current = ro32Pairs;

  for (let roundIdx = 0; roundIdx < KNOCKOUT_ROUND_NAMES.length; roundIdx++) {
    const matches: MatchResult[] = [];
    const advancing: string[] = [];

    for (const pair of current) {
      const { homeId, awayId } = pair;
      if (!homeId || !awayId) {
        // Defensive bye (shouldn't happen with a valid bracket).
        const w = homeId || awayId;
        advancing.push(w);
        matches.push({ homeId, awayId, homeGoals: 0, awayGoals: 0, winnerId: w });
        continue;
      }
      const dist = koCache.get(`${homeId}|${awayId}`)!;
      const idx = sampleScorelineIndex(dist, rand);
      const hg = (idx / dist.cols) | 0;
      const ag = idx % dist.cols;
      let winnerId: string;
      let penalties = false;
      if (hg !== ag) {
        winnerId = hg > ag ? homeId : awayId;
      } else {
        // Draw → extra time/penalties: coin flip biased toward the higher λ
        // plus a KO-experience bias (weighted history + knockout record).
        let pHome = dist.lambdaHome / (dist.lambdaHome + dist.lambdaAway);
        if (teamStats && modulators) {
          const statsHome = teamStats.get(homeId);
          const statsAway = teamStats.get(awayId);
          const koExpHome = (statsHome
            ? modulators.koKnockoutWeight * statsHome.knockout.score +
              modulators.koHistoryWeight * statsHome.history.score
            : 50);
          const koExpAway = (statsAway
            ? modulators.koKnockoutWeight * statsAway.knockout.score +
              modulators.koHistoryWeight * statsAway.history.score
            : 50);
          const expEdge = ((koExpHome - koExpAway) / 100) * modulators.koExperienceCoeff;
          pHome = Math.max(0.05, Math.min(0.95, pHome + expEdge));
        }
        winnerId = rand() < pHome ? homeId : awayId;
        penalties = true;
      }
      if (capture) {
        const winProbHome = computeWinProb(dist);
        matches.push({ homeId, awayId, homeGoals: hg, awayGoals: ag, winnerId, winProbHome, penalties });
      }
      advancing.push(winnerId);
      // Record the round reached: winner advances, loser stops here.
      const loserId = winnerId === homeId ? awayId : homeId;
      const currentKey = reachedKey[roundIdx]; // round currently being played
      const nextKey = reachedKey[Math.min(roundIdx + 1, reachedKey.length - 1)];
      reached.set(loserId, currentKey);
      reached.set(winnerId, roundIdx === KNOCKOUT_ROUND_NAMES.length - 1 ? 'champion' : nextKey);
    }

    if (capture) knockoutRounds.push({ name: KNOCKOUT_ROUND_NAMES[roundIdx], matches });

    if (advancing.length === 1) {
      const championId = advancing[0];
      reached.set(championId, 'champion');
      return {
        championId,
        reached,
        sample: capture
          ? { groupResults, groupStandings, knockoutRounds, championId }
          : undefined,
      };
    }
    // Pair winners for the next round (adjacent pairs).
    const next: { homeId: string; awayId: string }[] = [];
    for (let i = 0; i < advancing.length; i += 2) {
      next.push({ homeId: advancing[i], awayId: advancing[i + 1] });
    }
    current = next;
  }

  // Should be unreachable.
  const championId = current[0]?.homeId ?? '';
  return { championId, reached };
}

/** Round order for "reached at least" comparisons. */
const ROUND_ORDER = ['group', 'ro32', 'ro16', 'quarter', 'semi', 'final', 'champion'];
const reachedAtLeast = (r: string | undefined, target: string): boolean =>
  r !== undefined && ROUND_ORDER.indexOf(r) >= ROUND_ORDER.indexOf(target);

/** Run the full Monte Carlo simulation. */
export function simulate(input: SimInput): SimulationOutput {
  const numRuns = input.numRuns ?? config.numRuns;
  const globalParams = input.params?.global ?? {
    intercept: config.modelDefaults.intercept,
    homeAdv: config.modelDefaults.homeAdv,
    rho: config.modelDefaults.rho,
  };

  const groups = buildGroups(input);
  const strengths = buildStrengths(input);
  const hostIds = new Set(input.teams.filter((t) => t.isHost).map((t) => t.id));

  // Modulators: use Admin overrides if present, else config defaults.
  const modulators: ModulatorConfig = input.modulators ?? {
    formCoeff: config.modulators.formCoeff,
    squadValueCoeff: config.modulators.squadValueCoeff,
    eloCoeff: config.modulators.eloCoeff,
    koExperienceCoeff: config.modulators.koExperienceCoeff,
    koMatchCoeff: config.modulators.koMatchCoeff,
    koKnockoutWeight: config.modulators.koKnockoutWeight,
    koHistoryWeight: config.modulators.koHistoryWeight,
    homeAdvBoost: config.modulators.homeAdvBoost,
    h2hMaxBoost: config.modulators.h2hMaxBoost,
    lambdaShrink: config.modulators.lambdaShrink,
    whatIf: config.modulators.whatIf,
  };

  // Apply the Admin homeAdv override (overrides the Bayesian-fit value).
  const effectiveGlobalParams = { ...globalParams, homeAdv: modulators.homeAdvBoost };

  const { group: groupCache, ko: koCache } = buildDistCache(strengths, effectiveGlobalParams, hostIds, input.teams, input.h2h, input.teamStats, modulators);

  const rand = mulberry32(input.seed ?? (Math.random() * 2 ** 32) >>> 0);

  // Per-team counters.
  const wins = new Map<string, number>();
  const counts: Record<string, Map<string, number>> = {
    final: new Map(), semi: new Map(), quarter: new Map(), ro16: new Map(), ro32: new Map(),
  };
  const allIds = [...strengths.keys()];
  for (const id of allIds) {
    wins.set(id, 0);
    for (const k of Object.keys(counts)) counts[k].set(id, 0);
  }

  // Pre-resolve group fixtures once (composition doesn't change between runs):
  // avoids the string cache lookup in the hot path.
  const groupFixtures = buildGroupFixtures(groups, groupCache);

  // Report progress ~100 times over the total (1% granularity).
  const progressStep = Math.max(1, Math.floor(numRuns / 100));

  /** Accumulate the "reached at least round X" counters for one run. */
  const accumulate = (championId: string, reached: Map<string, string>) => {
    wins.set(championId, (wins.get(championId) ?? 0) + 1);
    for (const id of allIds) {
      const r = reached.get(id);
      if (reachedAtLeast(r, 'final')) counts.final.set(id, counts.final.get(id)! + 1);
      if (reachedAtLeast(r, 'semi')) counts.semi.set(id, counts.semi.get(id)! + 1);
      if (reachedAtLeast(r, 'quarter')) counts.quarter.set(id, counts.quarter.get(id)! + 1);
      if (reachedAtLeast(r, 'ro16')) counts.ro16.set(id, counts.ro16.get(id)! + 1);
      if (reachedAtLeast(r, 'ro32')) counts.ro32.set(id, counts.ro32.get(id)! + 1);
    }
  };

  // ── Run 0: capture the sample run and notify it IMMEDIATELY ("cinema now" flow).
  // The aggregate keeps computing after, but the cinema can already start.
  let sample: SampleRun | undefined;
  {
    const r0 = runOnce(groups, groupFixtures, koCache, rand, true, input.teamStats, modulators);
    sample = r0.sample;
    input.onSample?.(sample!);
    accumulate(r0.championId, r0.reached);
  }

  // ── Runs 1..N: aggregates only (capture=false, no overhead).
  for (let run = 1; run < numRuns; run++) {
    const { championId, reached } = runOnce(groups, groupFixtures, koCache, rand, false, input.teamStats, modulators);
    accumulate(championId, reached);
    if (input.onProgress && run % progressStep === 0) {
      input.onProgress(run / numRuns);
    }
  }
  input.onProgress?.(1);

  let aggregates: TeamAggregate[] = allIds.map((id) => ({
    teamId: id,
    winProb: wins.get(id)! / numRuns,
    reachFinalProb: counts.final.get(id)! / numRuns,
    reachSemiProb: counts.semi.get(id)! / numRuns,
    reachQuarterProb: counts.quarter.get(id)! / numRuns,
    reachRo16Prob: counts.ro16.get(id)! / numRuns,
    reachRo32Prob: counts.ro32.get(id)! / numRuns,
  }));

  // Chaos factor: interpolate all probabilities toward uniform.
  // Applied to winProb and every intermediate round for internal consistency.
  if (input.chaos && input.chaos > 0) {
    const c = Math.min(1, input.chaos);
    const n = aggregates.length;
    const applyChaos = (prob: number, uniformVal: number) =>
      prob * (1 - c) + uniformVal * c;

    aggregates = aggregates.map((a) => ({
      ...a,
      winProb:          applyChaos(a.winProb,          1 / n),
      reachFinalProb:   applyChaos(a.reachFinalProb,   2 / n),
      reachSemiProb:    applyChaos(a.reachSemiProb,    4 / n),
      reachQuarterProb: applyChaos(a.reachQuarterProb, 8 / n),
      reachRo16Prob:    applyChaos(a.reachRo16Prob,    16 / n),
      reachRo32Prob:    applyChaos(a.reachRo32Prob,    32 / n),
    }));
    // Re-normalize winProb only (it's the only one that must sum to 1).
    const tot = aggregates.reduce((s, a) => s + a.winProb, 0);
    aggregates = aggregates.map((a) => ({ ...a, winProb: a.winProb / tot }));
  }

  aggregates.sort((a, b) => b.winProb - a.winProb);

  return { aggregates, sample: sample!, numRuns };
}
