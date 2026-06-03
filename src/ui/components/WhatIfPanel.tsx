import { useState } from 'react';
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
  const teamsById = new Map(activeTeams.map((t) => [t.id, t]));
  const flagship = whatIfFactors.find((f) => f.flagship)!;
  const others = whatIfFactors.filter((f) => !f.flagship);

  const toggleFactor = (id: AppliedFactor['id']) => {
    const exists = scenario.factors.find((f) => f.id === id);
    if (exists) {
      onChange({ ...scenario, factors: scenario.factors.filter((f) => f.id !== id) });
    } else {
      onChange({ ...scenario, factors: [...scenario.factors, { id, teamIds: [] }] });
    }
  };

  /** Aggiunge/rimuove una squadra dalla lista del fattore. */
  const toggleFactorTeam = (id: AppliedFactor['id'], teamId: string) => {
    onChange({
      ...scenario,
      factors: scenario.factors.map((f) => {
        if (f.id !== id) return f;
        const current = f.teamIds ?? [];
        const next = current.includes(teamId)
          ? current.filter((t) => t !== teamId)
          : [...current, teamId];
        return { ...f, teamIds: next };
      }),
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
        Scenari ipotetici impilabili. Puoi applicare ogni scenario a più squadre.
      </p>

      <div className="factors">
        {others
          .filter((f) => !f.isSlider)
          .map((f) => {
            const applied = scenario.factors.find((a) => a.id === f.id);
            const selected = applied?.teamIds ?? [];
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
                <p className="small muted factor-desc">{f.description}</p>

                {applied && f.needsTeam && (
                  <div className="wf-teams">
                    {selected.length > 0 && (
                      <div className="wf-selected">
                        {selected.map((tid) => (
                          <button
                            key={tid}
                            type="button"
                            className="wf-chip"
                            onClick={() => toggleFactorTeam(f.id, tid)}
                            title="Rimuovi"
                          >
                            <span className={`fi fi-${teamsById.get(tid)?.flag}`} aria-hidden />
                            {teamsById.get(tid)?.name ?? tid}
                            <span className="wf-chip-x">×</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <TeamAdder
                      teams={activeTeams.filter((t) => !selected.includes(t.id))}
                      onAdd={(tid) => toggleFactorTeam(f.id, tid)}
                    />
                  </div>
                )}
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

/** Dropdown "aggiungi squadra" che si resetta dopo ogni selezione. */
function TeamAdder({ teams, onAdd }: { teams: Team[]; onAdd: (id: string) => void }) {
  const [val, setVal] = useState('');
  if (teams.length === 0) return null;
  return (
    <select
      className="wf-add"
      value={val}
      onChange={(e) => {
        if (e.target.value) {
          onAdd(e.target.value);
          setVal('');
        }
      }}
    >
      <option value="">+ Aggiungi squadra…</option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
