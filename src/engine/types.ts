/** Shared MonteCalcio domain types. */

export interface Team {
  id: string;
  name: string;
  nameEn?: string;
  nameEs?: string;
  nameFr?: string;
  group: string;
  flag: string;
  elo: number;
  squadValue: number | null;
  isHost: boolean;
  active: boolean;
  /** For the special Italy entry: id of the team it replaces (BIH). */
  substituteFor?: string;
}

/** Per-team strength parameters used by the match engine (log-lambda scale). */
export interface TeamStrength {
  attack: number;
  defense: number;
  /** Posterior uncertainty (optional). */
  attackSd?: number;
  defenseSd?: number;
}

export interface GlobalParams {
  intercept: number;
  homeAdv: number;
  rho: number;
}

/** H2H record for a pair (key "A|B" with A≤B alphabetically). */
export interface H2HRecord {
  w_a: number;
  d: number;
  w_b: number;
  n: number;
}

/** Shape of model-params.json produced by the Python pipeline. */
export interface ModelParams {
  global: GlobalParams;
  teams: Record<string, TeamStrength>;
}

/** Outcome of a single simulated match. */
export interface MatchResult {
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  /** Winner after extra time/penalties if any (knockout matches). */
  winnerId?: string;
  /** Model probability that the home team wins (0–1). */
  winProbHome?: number;
  /** True if decided on penalties (draw after 90' in a knockout). */
  penalties?: boolean;
}

/** A group standings row. */
export interface GroupStanding {
  teamId: string;
  played: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

/** A team's aggregated result after N runs. */
export interface TeamAggregate {
  teamId: string;
  winProb: number;
  reachFinalProb: number;
  reachSemiProb: number;
  reachQuarterProb: number;
  reachRo16Prob: number;
  reachRo32Prob: number;
}

/** Snapshot of one example simulation (drives the animation). */
export interface SampleRun {
  groupResults: Record<string, MatchResult[]>;
  groupStandings: Record<string, GroupStanding[]>;
  knockoutRounds: KnockoutRound[];
  championId: string;
}

export interface KnockoutRound {
  name: string;
  matches: MatchResult[];
}

export interface TeamFormRecord {
  score: number;   // 0–100
  w: number; d: number; l: number; n: number;
  lastDate: string | null;
}

export interface KnockoutTournamentBreakdown {
  label: string;   // e.g. "🌍 FIFA World Cup"
  weight: number;  // weight in the hierarchy (10 = World Cup, 5 = Euro, etc.)
  w: number; d: number; l: number; n: number;
  score: number;   // 0–100 for that specific tournament
  editions: number;   // editions reaching the final four (top 4)
  semiFinals: number; // editions eliminated in the SF (3rd/4th place)
  finals: number;     // editions reaching the final (winner + runner-up)
  titles: number;     // titles won
}

export interface TeamKnockoutRecord {
  score: number;   // 0–100 overall, weighted
  w: number; d: number; l: number; n: number;
  byTournament: KnockoutTournamentBreakdown[];
}

export interface HistoryTournamentBreakdown {
  label: string;
  weight: number;
  titles: number;
  finals: number;
  score: number;
}

export interface TeamHistoryRecord {
  score: number;  // 0–100 weighted history score
  byTournament: HistoryTournamentBreakdown[];
}

export interface TeamStats {
  form: TeamFormRecord;
  knockout: TeamKnockoutRecord;
  history: TeamHistoryRecord;
}

/**
 * Runtime modulator config — mirrors config.modulators, but passable explicitly
 * to the engine (e.g. from the Admin page).
 */
export interface ModulatorConfig {
  formCoeff: number;
  squadValueCoeff: number;
  eloCoeff: number;
  koExperienceCoeff: number;
  /** KO-experience bonus applied to the whole knockout match. */
  koMatchCoeff: number;
  koKnockoutWeight: number;
  koHistoryWeight: number;
  /** Home advantage in log-lambda scale (overrides globalParams.homeAdv). */
  homeAdvBoost: number;
  /** Max H2H boost on the lambdas (0 = off, 0.25 = default). */
  h2hMaxBoost: number;
  /**
   * Lambda shrinkage toward the pair's mean (0 = none).
   * Narrows the favorite/underdog gap per match → more upsets, keeps the big
   * teams from over-dominating the tournament win distribution.
   */
  lambdaShrink: number;
  /** What-if factor magnitudes (Elo-equivalent), tunable from Admin. */
  whatIf: WhatIfWeights;
}

/** What-if factor weights applicable to one or more teams. */
export interface WhatIfWeights {
  missingStar: number;
  injuries: number;
  starReturn: number;
  suspension: number;
}

export interface SimulationOutput {
  aggregates: TeamAggregate[];
  sample: SampleRun;
  numRuns: number;
}
