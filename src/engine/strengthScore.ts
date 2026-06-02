/**
 * Punteggio Forza: un numero sintetico per squadra che riassume TUTTO ciò che
 * agisce nella simulazione, usando i pesi correnti dei modulatori:
 *   - parametri bayesiani attack/defense (core)
 *   - modulatori Elo, valore rosa, forma
 *   - storico H2H
 *   - equilibratore (lambdaShrink)
 *   - vantaggio campo per le host (peso ridotto: vale solo nei gironi)
 *   - esperienza KO (knockout + storia) che decide i rigori
 *
 * Metodo: per ogni squadra calcoliamo la probabilità media di vittoria contro
 * TUTTE le altre, mescolando lo scenario gironi (con eventuale vantaggio campo)
 * e lo scenario KO (dove i pareggi vanno ai rigori, assegnati con l'edge di
 * esperienza). Poi mappiamo il win-rate medio su scala 0–100. Riflette
 * esattamente la pipeline reale del motore.
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
 * Probabilità di vincere ai rigori, replicando esattamente la logica del
 * simulatore: base = quota λ, corretta dall'esperienza KO (knockout + storia).
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
 * Frazione della "vita" di una squadra nel torneo giocata ai gironi (dove il
 * vantaggio campo conta per le host) vs nei KO. Un torneo ha 3 partite di
 * girone + fino a 7 KO: pesiamo il campo in proporzione ai gironi, scontato.
 */
const GROUP_SHARE = 3 / 10; // ~3 gironi su ~10 partite totali potenziali

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

  const mod = input.modulators;

  for (const a of pool) {
    let sumWin = 0, sumNotLose = 0;
    let n = 0;
    for (const b of pool) {
      if (a.id === b.id) continue;

      // --- Scenario KO (neutro, con bonus esperienza sull'intera partita) ---
      const distKo = scorelineDist(
        strengthOf(a), strengthOf(b), globalParams, false,
        a.id, b.id, input.h2h, input.teamStats,
        a.elo, b.elo, a.squadValue ?? 0, b.squadValue ?? 0,
        modStats, mod, /* knockout */ true,
      );
      const ko = outcomesFrom(distKo.flat, distKo.cols);
      // Nei KO i pareggi vanno ai rigori: assegniamo i pari secondo l'edge
      // esperienza (knockout + storia), esattamente come nel simulatore.
      const pPenA = penaltyWinProb(a, b, distKo.lambdaHome, distKo.lambdaAway, input.teamStats, mod);
      const koWin = ko.win + ko.draw * pPenA;
      const koNotLose = ko.win + ko.draw; // non-perdere = non eliminato nei 90'

      // --- Scenario girone (vantaggio campo se a è host) ---
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

      // Forza complessiva = mix gironi (con campo) + KO (con rigori).
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

// ─── Scomposizione: quanto pesa ogni componente sul Punteggio Forza ──────────

export interface StrengthComponent {
  key: 'core' | 'elo' | 'value' | 'form' | 'h2h' | 'home' | 'koExp';
  label: string;
  /** Quota percentuale del contributo (0–100), somma ≈ 100. */
  pct: number;
}

/** Deviazione standard di una lista (quanto un fattore differenzia le squadre). */
function stdev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length);
}

/**
 * Scompone il Punteggio Forza nei contributi dei singoli fattori.
 *
 * Idea: tutti i fattori agiscono in scala log-λ (additiva). Per ciascuno
 * misuriamo quanto FA VARIARE la forza tra le squadre (deviazione standard del
 * suo contributo sul pool): un fattore che dà a tutti lo stesso valore non
 * differenzia nessuno e pesa 0; uno che separa molto le squadre pesa tanto.
 * Le quote sono normalizzate a 100. Reattivo ai pesi: azzerare un coeff in
 * Admin porta la sua fetta a 0.
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

  // Contributo log-λ di ciascun fattore, per ogni squadra.
  const core: number[] = [];   // attack + defense bayesiani (forza di gioco)
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
    // Esperienza KO: agisce sull'intera partita KO (koMatchCoeff, ~70% del
    // torneo) e sui rigori (koExperienceCoeff, solo i pari). Sommiamo i due
    // contributi pesati per la loro presenza nel torneo.
    const koScore = stats
      ? mod.koKnockoutWeight * stats.knockout.score + mod.koHistoryWeight * stats.history.score
      : 50;
    const koCentered = (koScore - 50) / 100;
    koExp.push(koCentered * (mod.koMatchCoeff * (1 - GROUP_SHARE) + mod.koExperienceCoeff * 0.1));
    // Vantaggio campo: solo host, scontato per la quota gironi.
    home.push(t.isHost ? mod.homeAdvBoost * GROUP_SHARE : 0);
  }

  // H2H: stima della magnitudine media (dipende da h2hMaxBoost e dai dati).
  // Usiamo una proxy: per ogni squadra, lo scarto medio del boost H2H vs 1.
  const h2hMag: number[] = pool.map((a) => {
    if (!input.h2h || input.h2h.size === 0) return 0;
    let sum = 0, c = 0;
    for (const b of pool) {
      if (a.id === b.id) continue;
      const rec = input.h2h.get([a.id, b.id].sort().join('|'));
      if (!rec || rec.n < 3) continue;
      // ampiezza tipica del boost ∝ h2hMaxBoost, pesata da quanti dati ci sono
      const w = Math.min(1, Math.sqrt(rec.n / config.h2h.h2hMinMatches));
      sum += mod.h2hMaxBoost * w;
      c++;
    }
    return c > 0 ? sum / c : 0;
  });

  // Magnitudine = quanto ogni fattore DIFFERENZIA le squadre.
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
    core: '⚔️ Forza di gioco (att/dif)',
    elo: '📊 Elo',
    value: '💰 Valore rosa',
    form: '🔥 Forma',
    koExp: '🏆 Esperienza KO/storia',
    home: '🏟️ Vantaggio campo',
    h2h: '📋 Scontri diretti',
  };

  return (Object.keys(mags) as StrengthComponent['key'][])
    .map((key) => ({ key, label: labels[key], pct: (mags[key] / total) * 100 }))
    .sort((a, b) => b.pct - a.pct);
}
