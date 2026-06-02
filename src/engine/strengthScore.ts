/**
 * Punteggio Forza: un numero sintetico per squadra che riassume TUTTO
 * (parametri bayesiani attack/defense + modulatori Elo/valore/forma + H2H),
 * usando i pesi correnti dei modulatori. Serve a ordinare le squadre dopo
 * aver regolato i pesi dall'Admin.
 *
 * Metodo: per ogni squadra calcoliamo la probabilità media di vittoria contro
 * TUTTE le altre (partita neutra, niente vantaggio campo), tramite la stessa
 * scorelineDist usata dal motore. Poi mappiamo questo win-rate medio su una
 * scala 0–100. Così il punteggio riflette esattamente la pipeline reale.
 */

import type { Team, ModelParams, H2HRecord, TeamStats, ModulatorConfig, GlobalParams } from './types';
import { scorelineDist, eloToStrength, buildModulatorStats } from './matchModel';
import { config } from '../config';

export interface TeamStrengthScore {
  teamId: string;
  /** Punteggio normalizzato 0–100 (la squadra più forte ≈ 100). */
  score: number;
  /** Probabilità media di vittoria contro tutte le altre (0–1). */
  avgWinRate: number;
  /** Probabilità media di non perdere (vittoria + pareggio), 0–1. */
  avgNotLoseRate: number;
}

export interface StrengthInput {
  teams: Team[];
  params: ModelParams | null;
  h2h?: Map<string, H2HRecord>;
  teamStats?: Map<string, TeamStats>;
  modulators: ModulatorConfig;
  /** Se true include anche l'Italia (ITA) trattandola come attiva. */
  includeItaly?: boolean;
}

/** P(home>away) e P(pari) da una distribuzione scoreline cumulata. */
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
 * Calcola il Punteggio Forza per tutte le squadre rilevanti.
 * Complessità O(n²) sulle ~48 squadre: trascurabile (pochi ms).
 */
export function computeStrengthScores(input: StrengthInput): TeamStrengthScore[] {
  const pool = input.teams.filter((t) => t.active || (input.includeItaly && t.id === 'ITA'));

  const globalParams: GlobalParams = input.params?.global ?? {
    intercept: config.modelDefaults.intercept,
    homeAdv: config.modelDefaults.homeAdv,
    rho: config.modelDefaults.rho,
  };

  // Statistiche modulatori calcolate sulle sole squadre attive (coerente col motore).
  const activeForStats = input.teams.filter((t) => t.active);
  const modStats = buildModulatorStats(
    activeForStats.map((t) => t.elo),
    activeForStats.map((t) => t.squadValue ?? 0),
  );

  const strengthOf = (t: Team) => input.params?.teams[t.id] ?? eloToStrength(t.elo);

  const results: TeamStrengthScore[] = [];

  for (const a of pool) {
    let sumWin = 0, sumNotLose = 0;
    let n = 0;
    for (const b of pool) {
      if (a.id === b.id) continue;
      const dist = scorelineDist(
        strengthOf(a), strengthOf(b), globalParams, false,
        a.id, b.id, input.h2h, input.teamStats,
        a.elo, b.elo, a.squadValue ?? 0, b.squadValue ?? 0,
        modStats, input.modulators,
      );
      const { win, draw } = outcomesFrom(dist.flat, dist.cols);
      sumWin += win;
      sumNotLose += win + draw;
      n++;
    }
    const avgWinRate = n > 0 ? sumWin / n : 0;
    const avgNotLoseRate = n > 0 ? sumNotLose / n : 0;
    results.push({ teamId: a.id, score: 0, avgWinRate, avgNotLoseRate });
  }

  // Normalizza il win-rate medio su 0–100 (min→0, max→100).
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
