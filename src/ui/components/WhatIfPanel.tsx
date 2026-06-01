import { whatIfFactors } from '../../config';
import type { Team } from '../../engine/types';
import type { Scenario, AppliedFactor } from '../scenario';

interface Props {
  scenario: Scenario;
  teams: Team[];
  onChange: (s: Scenario) => void;
}

/** Pannello dei fattori what-if (§7). Il flagship Italia è separato sopra. */
export function WhatIfPanel({ scenario, teams, onChange }: Props) {
  const activeTeams = teams.filter((t) => t.active);
  const flagship = whatIfFactors.find((f) => f.flagship)!;
  const others = whatIfFactors.filter((f) => !f.flagship);

  const toggleFactor = (id: AppliedFactor['id']) => {
    const exists = scenario.factors.find((f) => f.id === id);
    if (exists) {
      onChange({ ...scenario, factors: scenario.factors.filter((f) => f.id !== id) });
    } else {
      const firstTeam = activeTeams[0]?.id;
      onChange({ ...scenario, factors: [...scenario.factors, { id, teamId: firstTeam }] });
    }
  };

  const setFactorTeam = (id: AppliedFactor['id'], teamId: string) => {
    onChange({
      ...scenario,
      factors: scenario.factors.map((f) => (f.id === id ? { ...f, teamId } : f)),
    });
  };

  return (
    <div className="card">
      {/* FLAGSHIP ITALIA — molto visibile */}
      <div className={`italy-toggle ${scenario.italy ? 'on' : ''}`}>
        <div className="italy-text">
          <div className="italy-title">
            {flagship.emoji} {flagship.label}
          </div>
          <p className="small muted">{flagship.description}</p>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={scenario.italy}
            onChange={(e) => onChange({ ...scenario, italy: e.target.checked })}
          />
          <span className="slider-toggle" />
        </label>
      </div>

      <h3>Altri scenari what-if</h3>
      <p className="small muted">
        Euristiche giocose, separate dal motore predittivo. Impilabili.
      </p>

      <div className="factors">
        {others
          .filter((f) => !f.isSlider)
          .map((f) => {
            const applied = scenario.factors.find((a) => a.id === f.id);
            return (
              <div key={f.id} className={`factor ${applied ? 'active' : ''}`}>
                <label className="factor-head">
                  <input
                    type="checkbox"
                    checked={!!applied}
                    onChange={() => toggleFactor(f.id)}
                  />
                  <span>
                    {f.emoji} {f.label}
                  </span>
                </label>
                {applied && f.needsTeam && (
                  <select
                    value={applied.teamId}
                    onChange={(e) => setFactorTeam(f.id, e.target.value)}
                  >
                    {activeTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
                <p className="small muted factor-desc">{f.description}</p>
              </div>
            );
          })}

        {/* Slider caos */}
        <div className="factor">
          <div className="factor-head">
            <span>🎲 Fattore Caos</span>
            <span className="chaos-val">{scenario.chaos}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={scenario.chaos}
            onChange={(e) => onChange({ ...scenario, chaos: Number(e.target.value) })}
          />
          <p className="small muted">Più alto = più sorprese (probabilità verso 50/50).</p>
        </div>
      </div>
    </div>
  );
}
