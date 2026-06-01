/** Tipi condivisi del dominio MonteCalcio. */

export interface Team {
  id: string;
  name: string;
  group: string;
  flag: string;
  elo: number;
  squadValue: number | null;
  isHost: boolean;
  active: boolean;
  /** Per l'entry speciale Italia: id della squadra che sostituisce (BIH). */
  substituteFor?: string;
}

/** Parametri forza-squadra usati dal motore-partita (in scala log-lambda). */
export interface TeamStrength {
  attack: number;
  defense: number;
  /** Incertezza posteriore (opzionale, per propagazione §5.6). */
  attackSd?: number;
  defenseSd?: number;
}

export interface GlobalParams {
  intercept: number;
  homeAdv: number;
  rho: number;
}

/** Record H2H per una coppia (chiave "A|B" con A≤B alfabeticamente). */
export interface H2HRecord {
  w_a: number;
  d: number;
  w_b: number;
  n: number;
}

/** Forma di model-params.json prodotta dalla pipeline Python (§6.2). */
export interface ModelParams {
  global: GlobalParams;
  teams: Record<string, TeamStrength>;
}

/** Esito di una singola partita simulata. */
export interface MatchResult {
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  /** Vincitore dopo eventuali supplementari/rigori (per le eliminazioni). */
  winnerId?: string;
  /** Probabilità che la squadra home vinca (0–1), calcolata dal modello. */
  winProbHome?: number;
  /** True se la partita è stata decisa ai rigori (pareggio nei 90' in KO). */
  penalties?: boolean;
}

/** Riga di classifica di un girone. */
export interface GroupStanding {
  teamId: string;
  played: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

/** Risultato aggregato di una squadra dopo N run. */
export interface TeamAggregate {
  teamId: string;
  winProb: number;
  reachFinalProb: number;
  reachSemiProb: number;
  reachQuarterProb: number;
  reachRo16Prob: number;
  reachRo32Prob: number;
}

/** Snapshot di una singola simulazione d'esempio (per l'animazione). */
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
  label: string;   // es. "🌍 Mondiali FIFA"
  weight: number;  // peso nella gerarchia (10 = Mondiali, 5 = Euro, ecc.)
  w: number; d: number; l: number; n: number;
  score: number;   // 0–100 per quel torneo specifico
  editions: number;   // edizioni in cui hanno raggiunto le fasi finali (top 4)
  semiFinals: number; // edizioni in cui sono stati eliminati in SF (3°/4° posto)
  finals: number;     // edizioni in cui hanno raggiunto la finale (vincitore + finalista)
  titles: number;     // titoli vinti
}

export interface TeamKnockoutRecord {
  score: number;   // 0–100 complessivo pesato
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
  score: number;  // 0–100 punteggio storia pesato
  byTournament: HistoryTournamentBreakdown[];
}

export interface TeamStats {
  form: TeamFormRecord;
  knockout: TeamKnockoutRecord;
  history: TeamHistoryRecord;
}

/**
 * Configurazione runtime dei modulatori — specchio di config.modulators,
 * ma passabile esplicitamente al motore (es. dalla pagina Admin).
 */
export interface ModulatorConfig {
  formCoeff: number;
  squadValueCoeff: number;
  eloCoeff: number;
  koExperienceCoeff: number;
  koKnockoutWeight: number;
  koHistoryWeight: number;
  /** Vantaggio campo in scala log-lambda (sovrascrive globalParams.homeAdv). */
  homeAdvBoost: number;
  /** Boost massimo H2H sui lambda (0 = disattivato, 0.25 = default). */
  h2hMaxBoost: number;
  /**
   * Shrinkage dei lambda verso la media della coppia (0 = nessuno).
   * Riduce lo scarto favorita/sfavorita per partita → più sorprese, evita
   * che le big dominino troppo la distribuzione di vittoria del torneo.
   */
  lambdaShrink: number;
}

export interface SimulationOutput {
  aggregates: TeamAggregate[];
  sample: SampleRun;
  numRuns: number;
}
