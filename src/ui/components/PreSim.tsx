/**
 * PreSim — schermata pre-simulazione. Riepiloga in modo minimale lo scenario
 * scelto e offre un grande bottone "Simula". Tutto è pensato per essere
 * immediato: si parte con un clic, oppure si torna indietro alla home.
 */
import type { Team } from '../../engine/types';
import { whatIfFactors } from '../../config';
import type { Scenario } from '../scenario';

interface Props {
  scenario: Scenario;
  teams: Team[];
  running: boolean;
  onSimulate: () => void;
  onEditScenario: () => void;
  /** Torna alla home/griglia (mostrato solo se c'è già una simulazione). */
  onBack?: () => void;
}

export function PreSim({
  scenario, teams, running, onSimulate, onEditScenario, onBack,
}: Props) {
  const teamsById = new Map(teams.map((t) => [t.id, t]));

  const activeFactors = scenario.factors
    .filter((f) => (f.teamIds?.length ?? 0) > 0)
    .map((f) => {
      const def = whatIfFactors.find((d) => d.id === f.id);
      return { def, teamIds: f.teamIds ?? [] };
    })
    .filter((x) => x.def);

  return (
    <div className="presim">
      <div className="presim-stadium" aria-hidden />

      <div className="presim-inner">
        <p className="presim-kicker">Mondiali 2026 · 48 nazionali</p>
        <h1 className="presim-title">Tutto pronto.</h1>
        <p className="presim-sub">
          Il tuo scenario è impostato.<br />Premi simula e guarda come va a finire.
        </p>

        {/* Card scenario — minimale ma curata: Italia + eventuali what-if */}
        <div className="presim-card">
          <div className="presim-card-head">
            <span className="presim-card-title">Il tuo scenario</span>
            <button className="presim-edit" onClick={onEditScenario}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              {activeFactors.length > 0 ? 'Modifica' : 'Aggiungi o modifica'}
            </button>
          </div>

          <div className="presim-card-body">
            {/* Stato Italia come riga "etichetta → badge" */}
            <div className="presim-row">
              <span className="presim-row-label">Italia</span>
              {scenario.italy ? (
                <span className="presim-badge presim-badge--italy">
                  <span className="fi fi-it" aria-hidden />
                  Nel Girone B
                </span>
              ) : (
                <span className="presim-badge presim-badge--off">Fuori · realistico</span>
              )}
            </div>

            {activeFactors.length > 0 && (
              <div className="presim-row presim-row--wf">
                <span className="presim-row-label">What-if</span>
                <span className="presim-wf-list">
                  {activeFactors.map((f) => (
                    <span key={f.def!.id} className="presim-wf-pill">
                      <span className="presim-wf-emoji">{f.def!.emoji}</span>
                      {f.def!.label}
                      <span className="presim-wf-teams">
                        {f.teamIds.map((tid) => teamsById.get(tid)?.name ?? tid).join(', ')}
                      </span>
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Bottone gigante con profondità + shimmer */}
        <button className="presim-go" onClick={onSimulate} disabled={running}>
          <span className="presim-go-shine" aria-hidden />
          <span className="presim-go-label">
            {running ? '⏳ Avvio…' : <>▶ Simula i Mondiali</>}
          </span>
        </button>

        {onBack && (
          <button className="presim-back" onClick={onBack}>
            ← Torna indietro
          </button>
        )}
      </div>
    </div>
  );
}
