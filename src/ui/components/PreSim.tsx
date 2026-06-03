/**
 * PreSim — schermata pre-simulazione. Riepiloga lo scenario scelto
 * nell'onboarding e offre un grande bottone "Simula". Ogni elemento è pensato
 * per essere immediato: si parte con un clic, oppure si salta alla dashboard.
 */
import type { Team } from '../../engine/types';
import { whatIfFactors } from '../../config';
import type { Scenario } from '../scenario';

interface Props {
  scenario: Scenario;
  teams: Team[];
  favoriteTeam: string | null;
  running: boolean;
  onSimulate: () => void;
  onEditScenario: () => void;
  onSkip: () => void;
}

export function PreSim({
  scenario, teams, favoriteTeam, running, onSimulate, onEditScenario, onSkip,
}: Props) {
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const fav = favoriteTeam ? teamsById.get(favoriteTeam) : null;

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
        <p className="presim-kicker">FIFA World Cup 2026 · 48 nazionali</p>
        <h1 className="presim-title">Tutto pronto.</h1>
        <p className="presim-sub">
          Il tuo scenario è impostato. Premi simula e guarda come va a finire.
        </p>

        {/* Riepilogo scenario */}
        <div className="presim-summary">
          <div className="presim-chip">
            <span className="presim-chip-label">Italia</span>
            <span className={`presim-chip-val ${scenario.italy ? 'on' : 'off'}`}>
              {scenario.italy ? <><span className="fi fi-it" style={{ width: 16, height: 11, borderRadius: 2, display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />Nel Girone B</> : 'Fuori (realistico)'}
            </span>
          </div>

          <div className="presim-chip">
            <span className="presim-chip-label">Squadra del cuore</span>
            <span className="presim-chip-val">
              {fav
                ? <><span className={`fi fi-${fav.flag}`} aria-hidden /> {fav.name} ♥</>
                : '— nessuna'}
            </span>
          </div>

          <div className="presim-chip">
            <span className="presim-chip-label">Caos</span>
            <span className="presim-chip-val">{scenario.chaos}%</span>
          </div>

          {activeFactors.length > 0 && (
            <div className="presim-chip presim-chip--wide">
              <span className="presim-chip-label">What-if</span>
              <span className="presim-chip-val">
                {activeFactors.map((f, i) => (
                  <span key={f.def!.id} className="presim-wf">
                    {i > 0 && ' · '}
                    {f.def!.emoji} {f.def!.label}
                    {' ('}
                    {f.teamIds.map((tid) => teamsById.get(tid)?.name ?? tid).join(', ')}
                    {')'}
                  </span>
                ))}
              </span>
            </div>
          )}

          <button className="presim-edit" onClick={onEditScenario}>
            ✎ Modifica scenario
          </button>
        </div>

        {/* Bottone gigante */}
        <button className="presim-go" onClick={onSimulate} disabled={running}>
          {running ? '⏳ Avvio…' : '▶ Simula i Mondiali'}
        </button>

        <button className="presim-skip" onClick={onSkip}>
          Vai direttamente alla dashboard tecnica →
        </button>
      </div>
    </div>
  );
}
