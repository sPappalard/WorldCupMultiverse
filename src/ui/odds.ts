/**
 * Helper condivisi per quote e percentuali, usati in tutta la dashboard.
 * Tenere un'unica fonte di verità per il "look" delle quote (stile bookmaker).
 */

/**
 * Quota decimale stile bookmaker da una probabilità.
 * Applica un margine (overround): riducendo la prob effettiva, la quota risulta
 * un po' più bassa di quella "equa" 1/p — come da banco reale.
 * @param p probabilità 0–1
 * @param margin fattore < 1 (default 0.85 ≈ overround 18%)
 */
export const oddsFromProb = (p: number, margin = 0.85): string => {
  if (p <= 0) return '—';
  const o = 1 / (p * margin);
  if (o >= 100) return Math.round(o).toString();
  if (o >= 10) return o.toFixed(1);
  return o.toFixed(2);
};

/**
 * Percentuale leggibile: per le big arrotonda all'intero, per le code (sotto
 * l'1%) mostra un decimale così non collassano a "0%". Sotto 0.05% → "<0.1%".
 */
export const pctSmart = (x: number): string => {
  const p = x * 100;
  if (p >= 1) return `${Math.round(p)}%`;
  if (p >= 0.05) return `${p.toFixed(1)}%`;
  if (p > 0) return '<0.1%';
  return '0%';
};

/** Percentuale intera semplice (per le partite). */
export const pctInt = (x: number): string => `${Math.round(x * 100)}%`;

/** Conteggio assoluto su N run, formattato all'italiana. */
export const countOf = (prob: number, numRuns: number): string =>
  Math.round(prob * numRuns).toLocaleString('it-IT');
