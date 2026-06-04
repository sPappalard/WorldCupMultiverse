import { useEffect, useState } from 'react';
import { useT } from '../../i18n';

interface Props {
  /** Frazione di completamento 0–1. */
  progress: number;
  /** Numero totale di run, per il conteggio mostrato. */
  numRuns: number;
}

/** Overlay a schermo intero mostrato durante la simulazione Monte Carlo. */
export function SimLoadingOverlay({ progress, numRuns }: Props) {
  const { t, tList, nf } = useT();
  const messages = tList('simloading.messages');
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setMsgIdx((i) => (i + 1) % Math.max(1, messages.length));
    }, 900);
    return () => clearInterval(id);
  }, [messages.length]);

  const pct = Math.round(progress * 100);
  const runsDone = Math.round(progress * numRuns);

  return (
    <div className="sim-overlay">
      <div className="sim-overlay-card">
        <div className="sim-ball" aria-hidden>⚽</div>
        <div className="sim-overlay-title">{t('simloading.title')}</div>
        <div className="sim-overlay-msg">{messages[msgIdx] ?? ''}</div>

        <div className="sim-progress-bar">
          <div className="sim-progress-fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="sim-overlay-stats">
          <span className="sim-pct">{pct}%</span>
          <span className="sim-runs">
            {t('simloading.runs', { done: nf(runsDone), total: nf(numRuns) })}
          </span>
        </div>
      </div>
    </div>
  );
}
