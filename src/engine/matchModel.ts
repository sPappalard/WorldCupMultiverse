/**
 * Motore-partita: Poisson bivariato in stile Dixon-Coles (spec §5.3).
 *
 *   λ_home = exp(intercept + attack_home − defense_away + homeAdv)
 *   λ_away = exp(intercept + attack_away − defense_home)
 *
 * I lambda vengono poi aggiustati con lo storico H2H (head-to-head): se
 * Francia e Italia si sono incontrate 13 volte e la Francia ha vinto 7,
 * il lambda francese riceve un bonus e quello italiano un malus, proporzionale
 * a quante partite ci sono (pochi dati → aggiustamento piccolo).
 */

import type { GlobalParams, TeamStrength, H2HRecord, ModulatorConfig, TeamStats } from './types';
import { config } from '../config';

const MAX_GOALS = 8; // troncamento: P(>8 gol) è trascurabile.

/** Poisson PMF: P(X = k | λ). */
function poissonPmf(k: number, lambda: number): number {
  // exp(-λ) * λ^k / k!
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

/** Correzione Dixon-Coles τ sui risultati bassi. */
function dcTau(i: number, j: number, lambda: number, mu: number, rho: number): number {
  if (i === 0 && j === 0) return 1 - lambda * mu * rho;
  if (i === 0 && j === 1) return 1 + lambda * rho;
  if (i === 1 && j === 0) return 1 + mu * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

export interface ScorelineDist {
  /** Matrice cumulata appiattita per campionamento O(log n) o lineare. */
  flat: Float64Array;
  /** Numero di colonne (MAX_GOALS+1) per decodificare indice → (i,j). */
  cols: number;
  /** Gol attesi, utili per inclinare il coin-flip dei rigori. */
  lambdaHome: number;
  lambdaAway: number;
}

/**
 * Aggiustamento H2H dei lambda: se esiste uno storico tra homeId e awayId,
 * spostiamo i lambda verso la distribuzione storica (win rate osservato).
 *
 * Meccanica:
 *   - Calcoliamo il win-rate storico di home (wRate) e away (1−wRate−dRate).
 *   - Confrontiamo col win-rate implicito nei lambda Poisson.
 *   - Se lo storico dice che home vince di più di quanto Elo suggerisca,
 *     moltiplichiamo λ_home per un bonus > 1 (e viceversa per λ_away).
 *   - Il peso dell'aggiustamento cresce con sqrt(n): con n=4 è debole,
 *     con n≥25 pesa fino al massimo configurato (H2H_MAX_BOOST in config).
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
 * Statistiche pre-calcolate una volta sola per i modulatori.
 * Evita di ricalcolare media/sd O(n) per ogni coppia di squadre.
 */
export interface ModulatorStats {
  eloMean: number;
  valueMean: number;
  valueSd: number;
}

/** Calcola le statistiche aggregate una volta sola sulle squadre attive. */
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
 * Calcola il log-aggiustamento modulatori per una squadra.
 * Riceve statistiche pre-calcolate per evitare ricalcoli O(n) per ogni coppia.
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

  // --- Forma recente ---
  const formScore = stats?.form.score ?? 50;
  const formAdj = ((formScore - 50) / 50) * mod.formCoeff;

  // --- Valore rosa (z-score sulle squadre attive) ---
  const zValue = (teamValue - ms.valueMean) / ms.valueSd;
  const valueAdj = zValue * mod.squadValueCoeff;

  // --- Elo corrente (distanza dalla media in unità 200 punti) ---
  const eloAdj = ((teamElo - ms.eloMean) / 200) * mod.eloCoeff;

  return formAdj + valueAdj + eloAdj;
}

/** Calcola la distribuzione di scoreline per una partita home vs away. */
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
): ScorelineDist {
  let lambdaHome = Math.exp(
    g.intercept + home.attack - away.defense + (homeAdvantage ? g.homeAdv : 0),
  );
  let lambdaAway = Math.exp(g.intercept + away.attack - home.defense);

  // Aggiusta con lo storico H2H se disponibile
  if (homeId && awayId && h2h && h2h.size > 0) {
    [lambdaHome, lambdaAway] = applyH2H(lambdaHome, lambdaAway, homeId, awayId, h2h, modulators?.h2hMaxBoost);
  }

  // Applica modulatori forma/valore/elo se disponibili (statistiche pre-calcolate)
  if (homeId && awayId && statsMap && modStats && modulators &&
      homeElo !== undefined && awayElo !== undefined &&
      homeValue !== undefined && awayValue !== undefined) {
    const adjHome = computeModulatorAdj(homeId, statsMap, modStats, homeElo, homeValue, modulators);
    const adjAway = computeModulatorAdj(awayId, statsMap, modStats, awayElo, awayValue, modulators);
    lambdaHome *= Math.exp(adjHome);
    lambdaAway *= Math.exp(adjAway);
  }

  // Shrinkage: tira i due lambda verso la loro media geometrica, riducendo lo
  // scarto fra favorita e sfavorita. Aumenta la varianza degli esiti (più
  // sorprese) → la distribuzione di vittoria del torneo non si concentra
  // eccessivamente sulle big (es. evita Spagna al 28%, più vicina al ~16-18%
  // dei bookmaker). I singoli match restano coerenti, ma su 7 turni i piccoli
  // vantaggi non si compongono in modo esagerato.
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
      const v = p > 0 ? p : 0; // τ può rendere P leggermente negativa: clamp.
      flat[i * cols + j] = v;
      total += v;
    }
  }
  // Normalizza in cumulata per campionamento.
  let acc = 0;
  for (let k = 0; k < flat.length; k++) {
    acc += flat[k] / total;
    flat[k] = acc;
  }
  return { flat, cols, lambdaHome, lambdaAway };
}

/** Campiona uno scoreline (gol home, gol away) dalla distribuzione. */
export function sampleScoreline(
  dist: ScorelineDist,
  rand: () => number,
): [number, number] {
  const k = sampleScorelineIndex(dist, rand);
  return [Math.floor(k / dist.cols), k % dist.cols];
}

/**
 * Variante hot-path: restituisce l'indice piatto della cella campionata
 * (niente allocazione di tuple). Usa ricerca binaria sulla cumulata.
 * Il chiamante decodifica con Math.floor(idx/cols) e idx%cols.
 */
export function sampleScorelineIndex(
  dist: ScorelineDist,
  rand: () => number,
): number {
  const u = rand();
  const flat = dist.flat;
  // Ricerca binaria sulla cumulata (monotòna crescente).
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
 * Converte Elo → forza attacco/difesa (fallback finché model-params.json non
 * esiste). Vedi config.eloToStrength.
 */
export function eloToStrength(elo: number): TeamStrength {
  const { referenceElo, scalePer100Elo, attackShare } = config.eloToStrength;
  const edge = ((elo - referenceElo) / 100) * scalePer100Elo;
  return {
    attack: edge * attackShare,
    defense: edge * (1 - attackShare),
  };
}
