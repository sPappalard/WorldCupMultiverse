import { useEffect, useState } from 'react';

interface Props {
  /** Frazione di completamento 0–1. */
  progress: number;
  /** Numero totale di run, per il conteggio mostrato. */
  numRuns: number;
}

const MESSAGES = [
  '⚽ Sorteggio dei gironi…',
  '🥅 Si gioca la fase a gironi…',
  '📊 Calcolo delle migliori terze…',
  '🏟️ Eliminazione diretta…',
  '🔥 Quarti e semifinali…',
  '🏆 Verso la finale…',
];

/** Overlay a schermo intero mostrato durante la simulazione Monte Carlo. */
export function SimLoadingOverlay({ progress, numRuns }: Props) {
  const [msgIdx, setMsgIdx] = useState(0);

  // Ruota i messaggi ogni 900ms (indipendente dal progresso reale, è scenico).
  useEffect(() => {
    const id = setInterval(() => {
      setMsgIdx((i) => (i + 1) % MESSAGES.length);
    }, 900);
    return () => clearInterval(id);
  }, []);

  const pct = Math.round(progress * 100);
  const runsDone = Math.round(progress * numRuns);

  return (
    <div className="sim-overlay">
      <div className="sim-overlay-card">
        <div className="sim-ball" aria-hidden>⚽</div>
        <div className="sim-overlay-title">Simulazione in corso</div>
        <div className="sim-overlay-msg">{MESSAGES[msgIdx]}</div>

        <div className="sim-progress-bar">
          <div className="sim-progress-fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="sim-overlay-stats">
          <span className="sim-pct">{pct}%</span>
          <span className="sim-runs">
            {runsDone.toLocaleString('it-IT')} / {numRuns.toLocaleString('it-IT')} mondiali
          </span>
        </div>
      </div>
    </div>
  );
}
