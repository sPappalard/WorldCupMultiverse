/**
 * Configurazione centrale di MonteCalcio.
 * Tutti i parametri "regolabili" vivono qui, non hardcodati nella logica.
 */

export const config = {
  /**
   * Numero di run Monte Carlo. Portato a 100.000 per ridurre il rumore
   * statistico sulle probabilità (~±0.15pp invece di ±0.5pp a 10k).
   * Costo: ~7-10s di calcolo sincrono nel browser (la pagina si blocca
   * durante la simulazione). Mai sotto 5.000 (spec §5.5).
   */
  numRuns: 100_000,

  /**
   * Fallback per i parametri globali del modello-partita, usati finché la
   * pipeline Python non genera model-params.json. Sono valori plausibili
   * di letteratura per il calcio internazionale.
   */
  modelDefaults: {
    /** Intercetta: log dei gol attesi di base per squadra. exp(0.05) ≈ 1.05. */
    intercept: 0.05,
    /**
     * Vantaggio campo di FALLBACK (usato solo se model-params.json manca).
     * A runtime viene comunque sovrascritto da modulators.homeAdvBoost (0.27),
     * quindi questo valore è effettivo solo nel fallback Elo puro.
     */
    homeAdv: 0.3,
    /** Correzione/correlazione Dixon-Coles sui risultati bassi. */
    rho: -0.05,
  },

  /**
   * Conversione Elo → forza attacco/difesa, usata SOLO come fallback finché
   * model-params.json non esiste. La pipeline bayesiana (§5.6) sostituirà
   * questi valori derivati con attacco/difesa stimati.
   *
   * Idea: un team con Elo pari alla media ha attacco/difesa = 0.
   * Lo scarto dalla media, scalato, diventa il bonus/malus in log-lambda.
   */
  eloToStrength: {
    /** Elo di riferimento (media approssimativa delle 48). */
    referenceElo: 1780,
    /** Quanto pesa 100 punti Elo in scala log-lambda. */
    scalePer100Elo: 0.11,
    /** Split del vantaggio Elo tra attacco (più forte) e difesa. */
    attackShare: 0.55,
  },

  /** Criteri di spareggio nei gironi, in ordine di applicazione. */
  groupTiebreakers: ['points', 'goalDifference', 'goalsFor'] as const,

  /**
   * Parametri dell'aggiustamento Head-to-Head.
   * Il boost è un moltiplicatore sui lambda: 1.0 = nessun effetto.
   * Cresce con sqrt(n / h2hMinMatches), cappato a h2hMaxBoost.
   */
  h2h: {
    /** Numero di partite storico oltre cui il boost è al massimo. */
    h2hMinMatches: 20,
    /** Massimo moltiplicatore applicabile ai lambda (es. 0.25 = ±25%). */
    h2hMaxBoost: 0.25,
  },

  /**
   * Modulatori dei lambda per ogni partita.
   * Ogni coefficiente determina quanto ogni segnale aggiustativo sposta
   * i gol attesi in scala log-lambda (exp(adj * coeff) → moltiplicatore sui gol).
   *
   * Gerarchia effetti REALE (effetto max sui gol, calibrato giugno 2026):
   *   Valore rosa z=±2: +27%
   *   Elo ±400pt: +27% (fino a +57% sullo spread torneo)
   *   Vantaggio campo: +25% (solo host)
   *   H2H storico: +25% (solo coppie con storico)
   *   Forma: +4% (spread tra due squadre)
   * Elo a 0.12 (era 0.25): riduce il double counting con i parametri
   * bayesiani. Nota: ciò peggiora un po' l'aderenza ai bookmaker (RMSE
   * ~9.6 vs 7.7pp a 0.25) ma rende il modello più pulito teoricamente.
   */
  modulators: {
    /**
     * Forma recente (ultime 30 partite, score 0–100 centrato su 50).
     * formAdj = (score - 50) / 50 → range [-1, +1]
     * λ *= exp(formAdj * formCoeff) → effetto max ±2% gol.
     * Abbassato a 0.02: la forma è un segnale rumoroso e già largamente
     * dentro Elo/parametri core; deve avere solo un peso marginale, poco
     * più di un tiebreaker tra squadre altrimenti equivalenti.
     */
    formCoeff: 0.02,

    /**
     * Valore rosa (z-score normalizzato sulle 48 squadre).
     * λ *= exp(zValue * squadValueCoeff) → effetto max ~±16% gol.
     * Calibrato sulle quote bookmaker del vincitore Mondiale 2026 (giugno 2026,
     * tutte e 48 le squadre): minimizza l'RMSE sulla distribuzione di vittoria.
     */
    squadValueCoeff: 0.21,

    /**
     * Elo corrente (distanza dalla media in unità di 200 punti).
     * eloAdj = (elo - eloMean) / 200
     * λ *= exp(eloAdj * eloCoeff) → +10% per +200pt, +22% per +400pt.
     * A 0.10: c'è alta correlazione (0.87) con i parametri bayesiani — l'Elo li
     * "doppia" parzialmente, quindi un peso moderato basta. Calibrato insieme
     * agli altri sulle quote bookmaker 2026.
     */
    eloCoeff: 0.10,

    /**
     * Esperienza/maturità nei rigori KO.
     * koExp = 0.6 * knockout.score + 0.4 * history.score (0–100)
     * expEdge = (koExpCasa - koExpOspite) / 100 * koExperienceCoeff
     * Applicato SOLO ai rigori nelle fasi a eliminazione diretta.
     * Abbassato da 0.08 a 0.04: a 0.08 l'Argentina (esperienza altissima) era
     * sovra-pesata vs i bookmaker; 0.04 la riallinea.
     */
    koExperienceCoeff: 0.04,

    /**
     * Bonus esperienza KO sull'INTERA partita a eliminazione diretta (non solo
     * rigori). koMatchEdge = (koExpCasa - koExpOspite) / 100 * koMatchCoeff,
     * applicato come ±aggiustamento ai λ. Piccolo (max ~±4% gol con gap 100):
     * chi è abituato alle fasi finali ha un leggero vantaggio nella gara secca,
     * senza ribaltare i valori. Agisce SOLO dal Round of 32 in poi.
     */
    koMatchCoeff: 0.04,

    /** Mix knockout/storia per il calcolo dell'esperienza KO. */
    koKnockoutWeight: 0.6,
    koHistoryWeight: 0.4,

    /**
     * Vantaggio campo in scala log-lambda, applicato SOLO alle 3 ospitanti
     * (USA, Canada, Messico). exp(0.22) ≈ +25% gol attesi in casa.
     * Abbassato da 0.27 a 0.22: a Mondiali gli stadi sono di fatto neutri
     * (tifo internazionale) e i bookmaker non prezzano alle host il +31% che
     * davamo prima. Verificato: riduce il RMSE vs mercato.
     * Corrisponde al homeAdv nei globalParams — sovrascrivibile dall'Admin.
     */
    homeAdvBoost: 0.22,
    /** Boost massimo H2H sui lambda (0 = disattivato, 0.25 = default). */
    h2hMaxBoost: 0.25,
    /**
     * Shrinkage dei lambda verso la media della coppia. Aumenta la varianza
     * per-partita così che, su 7 turni, i vantaggi delle big non si compongano
     * in modo esagerato. Calibrato sulle quote bookmaker del VINCITORE Mondiale
     * 2026 (tutte e 48 le squadre, giugno 2026). SCELTA DI PRODOTTO: valore
     * moderato 0.30 invece dell'ottimo statistico (~0.54). A 0.54 le quote
     * sono più fedeli (RMSE ~0.7pp) MA il torneo diventa irrealistico: una
     * squadra debole (Elo<1650) raggiunge la semifinale nel ~19% delle run.
     * A 0.30 quel rischio scende al ~6% (1 su 16, plausibile) con quote ancora
     * ragionevoli (Spagna ~24%). Preferiamo un tabellone credibile a quote
     * perfette. Regolabile dall'Admin ("Equilibratore").
     */
    lambdaShrink: 0.30,
    /**
     * Magnitudini dei fattori what-if, in punti Elo-equivalenti.
     * Negativi = indeboliscono la squadra, positivi = la rafforzano.
     * Gestibili dalla pagina Admin. Default ispirati all'impatto plausibile
     * di assenze/rientri sulla forza di una nazionale.
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
 * Definizione dei fattori "what-if" (§7). Ognuno è un modificatore impilabile.
 * Le magnitudini sono in "punti Elo-equivalenti" dove sensato, poi convertite.
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
  label: string;
  emoji: string;
  /** Descrizione breve mostrata in UI. */
  description: string;
  /** True per il fattore flagship Italia (UI dedicata). */
  flagship?: boolean;
  /** True se richiede di scegliere una squadra target. */
  needsTeam?: boolean;
  /**
   * Magnitudine di riferimento (punti Elo-equivalenti). NB: il valore
   * effettivo usato a runtime viene da config.modulators.whatIf (gestibile
   * da Admin); questo resta solo come riferimento/documentazione.
   */
  defaultEloDelta?: number;
  /** True se è uno slider 0–100 (fattore caos). */
  isSlider?: boolean;
}

export const whatIfFactors: WhatIfFactorDef[] = [
  {
    id: 'italy',
    label: 'Inserisci l’Italia',
    emoji: '🇮🇹',
    description:
      'L’Italia non si è qualificata (eliminata dalla Bosnia ai rigori). Questo toggle la rimette nel Girone B al posto della Bosnia e rilancia la simulazione.',
    flagship: true,
  },
  {
    id: 'missingStar',
    label: 'Assenza di un big',
    emoji: '🚑',
    description: 'Una stella out (es. infortunio dell’ultimo minuto). Indebolisce la squadra.',
    needsTeam: true,
    defaultEloDelta: -40,
  },
  {
    id: 'injuries',
    label: 'Infortuni a 2–3 titolari',
    emoji: '🩼',
    description: 'Più assenze pesanti. Riduzione maggiore della forza della squadra.',
    needsTeam: true,
    defaultEloDelta: -80,
  },
  {
    id: 'starReturn',
    label: 'Rientro / stato di grazia',
    emoji: '🔥',
    description: 'Un big torna al top o la squadra è in forma smagliante. Piccolo bonus.',
    needsTeam: true,
    defaultEloDelta: 30,
  },
  {
    id: 'suspension',
    label: 'Squalifica chiave',
    emoji: '🟥',
    description: 'Un titolare squalificato. Penalità una-tantum sulla forza.',
    needsTeam: true,
    defaultEloDelta: -35,
  },
  {
    id: 'chaos',
    label: 'Fattore Caos',
    emoji: '🎲',
    description:
      'Aumenta la varianza: appiattisce le probabilità verso il 50/50. Più sorprese.',
    isSlider: true,
  },
];
