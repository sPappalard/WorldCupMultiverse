/**
 * Central MonteCalcio configuration.
 * Every tunable parameter lives here, not hardcoded in the logic.
 */

export const config = {
  /**
   * Number of Monte Carlo runs. Set to 100,000 to cut statistical noise on the
   * probabilities (~±0.15pp instead of ±0.5pp at 10k). Cost: the simulation
   * runs in a Web Worker so the page stays responsive. Never below 5,000.
   */
  numRuns: 100_000,

  /**
   * Fallback global match-model parameters, used until the Python pipeline
   * generates model-params.json. Plausible values from the international-
   * football literature.
   */
  modelDefaults: {
    /** Intercept: log of the baseline expected goals per team. exp(0.05) ≈ 1.05. */
    intercept: 0.05,
    /**
     * FALLBACK home advantage (used only if model-params.json is missing).
     * At runtime it's overridden by modulators.homeAdvBoost, so this value only
     * takes effect in the pure-Elo fallback.
     */
    homeAdv: 0.3,
    /** Dixon-Coles low-score correlation correction. */
    rho: -0.05,
  },

  /**
   * Elo → attack/defense strength conversion, used ONLY as a fallback until
   * model-params.json exists. The Bayesian pipeline replaces these derived
   * values with estimated attack/defense.
   *
   * Idea: a team with average Elo has attack/defense = 0. Its scaled deviation
   * from the mean becomes the log-lambda bonus/penalty.
   */
  eloToStrength: {
    /** Reference Elo (approximate mean of the 48 teams). */
    referenceElo: 1780,
    /** How much 100 Elo points weigh in log-lambda scale. */
    scalePer100Elo: 0.11,
    /** Split of the Elo edge between attack (larger share) and defense. */
    attackShare: 0.55,
  },

  /** Group tiebreakers, in order of application. */
  groupTiebreakers: ['points', 'goalDifference', 'goalsFor'] as const,

  /**
   * Head-to-head adjustment parameters.
   * The boost is a multiplier on the lambdas: 1.0 = no effect.
   * Grows with sqrt(n / h2hMinMatches), capped at h2hMaxBoost.
   */
  h2h: {
    /** Match count above which the boost is at its maximum. */
    h2hMinMatches: 20,
    /** Max multiplier applicable to the lambdas (e.g. 0.25 = ±25%). */
    h2hMaxBoost: 0.25,
  },

  /**
   * Per-match lambda modulators.
   * Each coefficient sets how much its adjustment signal shifts expected goals
   * in log-lambda scale (exp(adj * coeff) → multiplier on goals).
   *
   * Effective hierarchy (max effect on goals, calibrated June 2026):
   *   Squad value z=±2: +27%
   *   Elo ±400pt: +27% (up to +57% on the tournament spread)
   *   Home advantage: +25% (hosts only)
   *   H2H history: +25% (pairs with history only)
   *   Form: +4% (spread between two teams)
   * Elo is kept moderate to reduce double-counting with the Bayesian parameters:
   * this slightly worsens bookmaker fit but keeps the model theoretically cleaner.
   */
  modulators: {
    /**
     * Recent form (last ~30 matches, score 0–100 centered on 50).
     * formAdj = (score - 50) / 50 → range [-1, +1]
     * λ *= exp(formAdj * formCoeff) → max effect ±2% goals.
     * Kept low: form is a noisy signal already largely captured by Elo/core
     * params, so it acts as little more than a tiebreaker between otherwise
     * equivalent teams.
     */
    formCoeff: 0.02,

    /**
     * Squad value (z-score normalized over the 48 teams).
     * λ *= exp(zValue * squadValueCoeff) → max effect ~±16% goals.
     * Calibrated against 2026 World Cup winner odds (June 2026, all 48 teams):
     * minimizes RMSE on the win distribution.
     */
    squadValueCoeff: 0.21,

    /**
     * Current Elo (distance from mean in 200-point units).
     * eloAdj = (elo - eloMean) / 200
     * λ *= exp(eloAdj * eloCoeff) → +10% per +200pt, +22% per +400pt.
     * Highly correlated (0.87) with the Bayesian params, so a moderate weight
     * suffices to avoid double-counting. Co-calibrated on 2026 bookmaker odds.
     */
    eloCoeff: 0.10,

    /**
     * KO penalty-shootout experience/maturity.
     * koExp = 0.6 * knockout.score + 0.4 * history.score (0–100)
     * expEdge = (koExpHome - koExpAway) / 100 * koExperienceCoeff
     * Applied ONLY to penalties in knockout rounds. Kept low so high-experience
     * sides (e.g. Argentina) aren't over-weighted vs the bookmakers.
     */
    koExperienceCoeff: 0.04,

    /**
     * KO-experience bonus on the WHOLE knockout match (not just penalties).
     * koMatchEdge = (koExpHome - koExpAway) / 100 * koMatchCoeff, applied as a
     * ± adjustment to the λ. Small (max ~±4% goals at a 100 gap): teams used to
     * the latter stages get a slight edge in the one-off game without overturning
     * the ratings. Acts ONLY from the Round of 32 onward.
     */
    koMatchCoeff: 0.04,

    /** Knockout/history mix for the KO-experience score. */
    koKnockoutWeight: 0.6,
    koHistoryWeight: 0.4,

    /**
     * Home advantage in log-lambda scale, applied ONLY to the 3 hosts (USA,
     * Canada, Mexico). exp(0.22) ≈ +25% expected goals at home. Kept moderate
     * because World Cup venues are effectively neutral (international crowds) and
     * bookmakers don't price hosts higher. Mirrors homeAdv in globalParams —
     * overridable from Admin.
     */
    homeAdvBoost: 0.22,
    /** Max H2H boost on the lambdas (0 = off, 0.25 = default). */
    h2hMaxBoost: 0.25,
    /**
     * Lambda shrinkage toward the pair's mean. Raises per-match variance so that,
     * over 7 rounds, the big teams' edges don't compound excessively. Calibrated
     * on 2026 World Cup WINNER odds (all 48 teams, June 2026). PRODUCT CHOICE:
     * a moderate 0.30 rather than the statistical optimum (~0.54). At 0.54 the
     * odds fit better (RMSE ~0.7pp) BUT the tournament gets unrealistic: a weak
     * team (Elo<1650) reaches the semifinal in ~19% of runs. At 0.30 that drops
     * to ~6% (1 in 16, plausible) with still-reasonable odds (Spain ~24%). We
     * prefer a credible bracket over perfect odds. Tunable from Admin ("Balancer").
     */
    lambdaShrink: 0.30,
    /**
     * What-if factor magnitudes, in Elo-equivalent points.
     * Negative = weaken the team, positive = strengthen it. Tunable from the
     * Admin page. Defaults reflect the plausible impact of absences/returns on a
     * national team's strength.
     */
    whatIf: {
      missingStar: -40,
      injuries: -80,
      starReturn: 30,
      suspension: -35,
    },
  },
};

/**
 * What-if factor definitions. Each is a stackable modifier.
 * Magnitudes are in "Elo-equivalent points" where it makes sense, then converted.
 */
export type WhatIfFactorId =
  | 'italy'
  | 'missingStar'
  | 'injuries'
  | 'starReturn'
  | 'chaos'
  | 'suspension';

export interface WhatIfFactorDef {
  id: WhatIfFactorId;
  /** IT fallback label. The UI renders the translation via `labelKey`. */
  label: string;
  /** i18n key for the label. */
  labelKey: string;
  emoji: string;
  /** IT fallback short description shown in the UI. */
  description: string;
  /** i18n key for the description. */
  descKey: string;
  /** True for the flagship Italy factor (dedicated UI). */
  flagship?: boolean;
  /** True if it requires picking a target team. */
  needsTeam?: boolean;
  defaultEloDelta?: number;
  /** True if it's a 0–100 slider (chaos factor). */
  isSlider?: boolean;
}

export const whatIfFactors: WhatIfFactorDef[] = [
  {
    id: 'italy',
    label: "Inserisci l'Italia",
    labelKey: 'wif.italy.label',
    emoji: '🇮🇹',
    description: "L'Italia non si è qualificata (eliminata dalla Bosnia ai rigori). Questo toggle la rimette nel Girone B al posto della Bosnia e rilancia la simulazione.",
    descKey: 'wif.italy.desc',
    flagship: true,
  },
  {
    id: 'missingStar',
    label: 'Assenza di un big',
    labelKey: 'wif.missingStar.label',
    emoji: '🚑',
    description: "Una stella out (es. infortunio dell'ultimo minuto). Indebolisce la squadra.",
    descKey: 'wif.missingStar.desc',
    needsTeam: true,
    defaultEloDelta: -40,
  },
  {
    id: 'injuries',
    label: 'Infortuni a 2–3 titolari',
    labelKey: 'wif.injuries.label',
    emoji: '🩼',
    description: 'Più assenze pesanti. Riduzione maggiore della forza della squadra.',
    descKey: 'wif.injuries.desc',
    needsTeam: true,
    defaultEloDelta: -80,
  },
  {
    id: 'starReturn',
    label: 'Rientro / stato di grazia',
    labelKey: 'wif.starReturn.label',
    emoji: '🔥',
    description: 'Un big torna al top o la squadra è in forma smagliante. Piccolo bonus.',
    descKey: 'wif.starReturn.desc',
    needsTeam: true,
    defaultEloDelta: 30,
  },
  {
    id: 'suspension',
    label: 'Squalifica chiave',
    labelKey: 'wif.suspension.label',
    emoji: '🟥',
    description: 'Un titolare squalificato. Penalità una-tantum sulla forza.',
    descKey: 'wif.suspension.desc',
    needsTeam: true,
    defaultEloDelta: -35,
  },
  {
    id: 'chaos',
    label: 'Fattore Caos',
    labelKey: 'wif.chaos.label',
    emoji: '🎲',
    description: 'Aumenta la varianza: appiattisce le probabilità verso il 50/50. Più sorprese.',
    descKey: 'wif.chaos.desc',
    isSlider: true,
  },
];
