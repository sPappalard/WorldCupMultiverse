/**
 * Motore Monte Carlo (spec §5.4) — IL PUNTO CRITICO.
 * In OGNI run si estrae uno scoreline dal modello e si avanza il vincitore
 * ESTRATTO (non il favorito). Dopo N run, winProb = vittorie / N.
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

/** P(home vince) sommando le celle della matrice scoreline dove hg > ag. */
function computeWinProb(dist: ScorelineDist): number {
  const cols = dist.cols;
  const n = dist.flat.length;
  let pWin = 0;
  // flat è cumulata: ricaviamo le singole probabilità come diff
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
  /** Scontri diretti storici per aggiustare i lambda (da h2h.json). */
  h2h?: Map<string, H2HRecord>;
  /** Statistiche per squadra: forma, knockout, storia (da team-stats.json). */
  teamStats?: Map<string, TeamStats>;
  /** Override forza per squadra (what-if), in delta log-lambda su att+dif. */
  strengthOverrides?: Record<string, { attack: number; defense: number }>;
  /** Sostituzioni di squadra (es. Italia al posto della Bosnia). */
  substitutions?: Record<string, string>; // outId -> inId
  numRuns?: number;
  seed?: number;
  /** Fattore caos 0–1: interpola le probabilità finali verso uniforme. */
  chaos?: number;
  /** Override runtime dei coefficienti modulatori (dalla pagina Admin). */
  modulators?: ModulatorConfig;
  /** Callback opzionale di progresso (0–1), chiamato ogni ~1% di run. */
  onProgress?: (fraction: number) => void;
}

/** Costruisce la mappa forza per squadra, applicando overrides what-if. */
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

/** Risolve la composizione effettiva dei gironi applicando le sostituzioni. */
function buildGroups(input: SimInput): Map<string, Team[]> {
  const subs = input.substitutions ?? {};
  const byId = new Map(input.teams.map((t) => [t.id, t]));
  const groups = new Map<string, Team[]>();
  for (const g of GROUPS) groups.set(g, []);

  const replacedOut = new Set(Object.keys(subs)); // squadre uscenti (es. BIH)
  const incomingIn = new Set(Object.values(subs)); // squadre entranti (es. ITA)
  for (const t of input.teams) {
    if (!t.active) continue; // entry inattive (Italia di default) escluse
    if (replacedOut.has(t.id)) continue; // la uscente lascia il girone
    if (incomingIn.has(t.id)) continue; // l'entrante è gestita sotto
    groups.get(t.group)?.push(t);
  }
  // Applica sostituzioni: la squadra "in" prende lo slot della "out".
  for (const [outId, inId] of Object.entries(subs)) {
    const outTeam = byId.get(outId);
    const inTeam = byId.get(inId);
    if (!outTeam || !inTeam) continue;
    const arr = groups.get(outTeam.group);
    if (arr) arr.push({ ...inTeam, group: outTeam.group });
  }
  return groups;
}

/** Pre-calcola la distribuzione di scoreline per ogni coppia rilevante. */
function buildDistCache(
  strengths: Map<string, TeamStrength>,
  globalParams: ModelParams['global'],
  hostIds: Set<string>,
  teams: Team[],
  h2h?: Map<string, H2HRecord>,
  teamStats?: Map<string, TeamStats>,
  modulators?: ModulatorConfig,
): Map<string, ScorelineDist> {
  const cache = new Map<string, ScorelineDist>();
  const ids = [...strengths.keys()];

  const teamById = new Map(teams.map((t) => [t.id, t]));

  // Fix 1+3: calcola media/sd una volta sola sulle sole squadre ATTIVE.
  // Esclude Italia inattiva e qualsiasi entry con active=false.
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
      // Fix 2: vantaggio campo SOLO nei gironi (hostIds), non nelle KO.
      // Le KO usano lo stesso cache ma le partite secca non hanno una "casa" reale.
      // Il flag viene passato solo quando la squadra è effettivamente host.
      const homeAdv = hostIds.has(a);
      const teamA = teamById.get(a);
      const teamB = teamById.get(b);
      cache.set(
        `${a}|${b}`,
        scorelineDist(
          home, away, globalParams, homeAdv, a, b, h2h,
          teamStats,
          teamA?.elo, teamB?.elo,
          teamA?.squadValue ?? 0, teamB?.squadValue ?? 0,
          modStats,
          modulators,
        ),
      );
    }
  }
  return cache;
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

/** Partita di girone con dist già risolto (pre-computata fuori dal loop run). */
interface GroupFixture {
  homeId: string;
  awayId: string;
  dist: ScorelineDist;
}

/** Pre-risolve le 6 partite × 12 gironi una volta sola: evita il lookup
 *  stringa nel cache ad ogni partita di ogni run (hot-path). */
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

/** Esegue una singola run completa. captureSample → registra dettagli. */
function runOnce(
  groups: Map<string, Team[]>,
  groupFixtures: Map<string, GroupFixture[]>,
  cache: Map<string, ScorelineDist>,
  rand: () => number,
  capture: boolean,
  teamStats?: Map<string, TeamStats>,
  modulators?: ModulatorConfig,
): { championId: string; sample?: SampleRun; reached: Map<string, string> } {
  const groupStandings: Record<string, GroupStanding[]> = {};
  const groupResults: Record<string, MatchResult[]> = {};
  // Per ogni team: round più avanzato raggiunto.
  const reached = new Map<string, string>();

  const winners: Record<string, string> = {};
  const runnersUp: Record<string, string> = {};
  const thirds: { teamId: string; group: string; standing: GroupStanding }[] = [];

  // --- GIRONI ---
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
        // winProb serve solo nella sample run mostrata; evitalo nelle altre.
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

  // --- MIGLIORI 8 TERZE ---
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

  // --- COMPONE IL ROUND OF 32 ---
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

  // Qualificate al R32
  for (const p of ro32Pairs) {
    if (p.homeId) reached.set(p.homeId, 'ro32');
    if (p.awayId) reached.set(p.awayId, 'ro32');
  }

  // --- ELIMINAZIONE DIRETTA ---
  const knockoutRounds: KnockoutRound[] = [];
  const reachedKey = ['ro32', 'ro16', 'quarter', 'semi', 'final'];
  let current = ro32Pairs;

  for (let roundIdx = 0; roundIdx < KNOCKOUT_ROUND_NAMES.length; roundIdx++) {
    const matches: MatchResult[] = [];
    const advancing: string[] = [];

    for (const pair of current) {
      const { homeId, awayId } = pair;
      if (!homeId || !awayId) {
        // bye difensivo (non dovrebbe accadere con bracket valido)
        const w = homeId || awayId;
        advancing.push(w);
        matches.push({ homeId, awayId, homeGoals: 0, awayGoals: 0, winnerId: w });
        continue;
      }
      const dist = cache.get(`${homeId}|${awayId}`)!;
      const idx = sampleScorelineIndex(dist, rand);
      const hg = (idx / dist.cols) | 0;
      const ag = idx % dist.cols;
      let winnerId: string;
      let penalties = false;
      if (hg !== ag) {
        winnerId = hg > ag ? homeId : awayId;
      } else {
        // Pareggio → supplementari/rigori: coin-flip inclinato verso λ maggiore
        // + bias esperienza KO (storia + rendimento knockout pesati).
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
      // Segna il round raggiunto: vincitore avanza, perdente si ferma qui.
      const loserId = winnerId === homeId ? awayId : homeId;
      const currentKey = reachedKey[roundIdx]; // round in cui si sta giocando
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
    // Accoppia i vincitori per il round successivo (coppie adiacenti).
    const next: { homeId: string; awayId: string }[] = [];
    for (let i = 0; i < advancing.length; i += 2) {
      next.push({ homeId: advancing[i], awayId: advancing[i + 1] });
    }
    current = next;
  }

  // Non dovrebbe arrivare qui.
  const championId = current[0]?.homeId ?? '';
  return { championId, reached };
}

/** Ordine dei round per confronto "ha raggiunto almeno". */
const ROUND_ORDER = ['group', 'ro32', 'ro16', 'quarter', 'semi', 'final', 'champion'];
const reachedAtLeast = (r: string | undefined, target: string): boolean =>
  r !== undefined && ROUND_ORDER.indexOf(r) >= ROUND_ORDER.indexOf(target);

/** Esegue l'intera simulazione Monte Carlo. */
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

  // Modulatori: usa override Admin se presenti, altrimenti config di default
  const modulators: ModulatorConfig = input.modulators ?? {
    formCoeff: config.modulators.formCoeff,
    squadValueCoeff: config.modulators.squadValueCoeff,
    eloCoeff: config.modulators.eloCoeff,
    koExperienceCoeff: config.modulators.koExperienceCoeff,
    koKnockoutWeight: config.modulators.koKnockoutWeight,
    koHistoryWeight: config.modulators.koHistoryWeight,
    homeAdvBoost: config.modulators.homeAdvBoost,
    h2hMaxBoost: config.modulators.h2hMaxBoost,
    lambdaShrink: config.modulators.lambdaShrink,
  };

  // Applica override homeAdv dall'Admin (sovrascrive il valore dal fit bayesiano).
  const effectiveGlobalParams = { ...globalParams, homeAdv: modulators.homeAdvBoost };

  const cache = buildDistCache(strengths, effectiveGlobalParams, hostIds, input.teams, input.h2h, input.teamStats, modulators);

  const rand = mulberry32(input.seed ?? (Math.random() * 2 ** 32) >>> 0);

  // Contatori per squadra.
  const wins = new Map<string, number>();
  const counts: Record<string, Map<string, number>> = {
    final: new Map(), semi: new Map(), quarter: new Map(), ro16: new Map(), ro32: new Map(),
  };
  const allIds = [...strengths.keys()];
  for (const id of allIds) {
    wins.set(id, 0);
    for (const k of Object.keys(counts)) counts[k].set(id, 0);
  }

  // Pre-risolve le partite dei gironi una volta sola (la composizione non
  // cambia tra run): evita il lookup stringa nel cache nel hot-path.
  const groupFixtures = buildGroupFixtures(groups, cache);

  // Riporta il progresso ~100 volte sul totale (granularità 1%).
  const progressStep = Math.max(1, Math.floor(numRuns / 100));

  let sample: SampleRun | undefined;
  for (let run = 0; run < numRuns; run++) {
    const capture = run === 0; // prima run = sample animata
    const { championId, reached, sample: s } = runOnce(groups, groupFixtures, cache, rand, capture, input.teamStats, modulators);
    if (capture) sample = s;

    wins.set(championId, (wins.get(championId) ?? 0) + 1);
    for (const id of allIds) {
      const r = reached.get(id);
      if (reachedAtLeast(r, 'final')) counts.final.set(id, counts.final.get(id)! + 1);
      if (reachedAtLeast(r, 'semi')) counts.semi.set(id, counts.semi.get(id)! + 1);
      if (reachedAtLeast(r, 'quarter')) counts.quarter.set(id, counts.quarter.get(id)! + 1);
      if (reachedAtLeast(r, 'ro16')) counts.ro16.set(id, counts.ro16.get(id)! + 1);
      if (reachedAtLeast(r, 'ro32')) counts.ro32.set(id, counts.ro32.get(id)! + 1);
    }

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

  // Fattore caos: interpola tutte le probabilità verso uniforme (spec §7.4).
  // Applicato a winProb e a tutti i round intermedi per coerenza interna.
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
    // Ri-normalizza solo winProb (è l'unica che deve sommare a 1).
    const tot = aggregates.reduce((s, a) => s + a.winProb, 0);
    aggregates = aggregates.map((a) => ({ ...a, winProb: a.winProb / tot }));
  }

  aggregates.sort((a, b) => b.winProb - a.winProb);

  return { aggregates, sample: sample!, numRuns };
}
