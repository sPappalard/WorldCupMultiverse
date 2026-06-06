/**
 * PreSim — pre-simulation screen with an inline modal to edit the scenario.
 * No full onboarding: an overlay to toggle Italy and what-ifs, then back to the
 * Simulate button.
 */
import { useState } from 'react';
import type { Team } from '../../engine/types';
import { whatIfFactors } from '../../config';
import { type Scenario, type AppliedFactor } from '../scenario';
import { useT, useTeamName } from '../../i18n';
import { cinemaAudio } from '../cinemaAudio';

interface Props {
  scenario: Scenario;
  teams: Team[];
  running: boolean;
  onSimulate: () => void;
  /** Save the edited scenario and stay in PreSim. */
  onSaveScenario: (s: Scenario) => void;
  /** Back to the home/grid (only if a simulation already exists). */
  onBack?: () => void;
}

export function PreSim({
  scenario, teams, running, onSimulate, onSaveScenario, onBack,
}: Props) {
  const { t: tr } = useT();
  const teamName = useTeamName();
  const [editOpen, setEditOpen] = useState(false);
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
        <div className="presim-brand">
          <img src="/logo.png" alt="World Cup Multiverse" className="presim-brand-logo" />
          <div className="presim-brand-text">
            <span className="presim-brand-title">World Cup Multiverse</span>
            <span className="presim-brand-sub">{tr('presim.kicker')}</span>
          </div>
        </div>
        <h1 className="presim-title">{tr('presim.title')}</h1>
        <p className="presim-sub">
          {tr('presim.sub.line1')}<br />{tr('presim.sub.line2')}
        </p>

        {/* Scenario card */}
        <div className="presim-card">
          <div className="presim-card-head">
            <span className="presim-card-title">{tr('presim.cardTitle')}</span>
            <button className="presim-edit" onClick={() => setEditOpen(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              {activeFactors.length > 0 ? tr('presim.edit') : tr('presim.addOrEdit')}
            </button>
          </div>

          <div className="presim-card-body">
            <div className="presim-row">
              <span className="presim-row-label">{tr('presim.row.italy')}</span>
              {scenario.italy ? (
                <span className="presim-badge presim-badge--italy">
                  <span className="fi fi-it" aria-hidden />
                  {tr('presim.badge.italyIn')}
                </span>
              ) : (
                <span className="presim-badge presim-badge--off">{tr('presim.badge.italyOut')}</span>
              )}
            </div>

            {activeFactors.length > 0 && (
              <div className="presim-row presim-row--wf">
                <span className="presim-row-label">{tr('presim.row.whatif')}</span>
                <span className="presim-wf-list">
                  {activeFactors.map((f) => (
                    <span key={f.def!.id} className="presim-wf-pill">
                      <span className="presim-wf-emoji">{f.def!.emoji}</span>
                      {tr(f.def!.labelKey)}
                      <span className="presim-wf-teams">
                        {f.teamIds.map((tid) => { const tm = teamsById.get(tid); return tm ? teamName(tm) : tid; }).join(', ')}
                      </span>
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* CTA */}
        <button className="presim-go" onClick={() => { cinemaAudio.warm(); onSimulate(); }} disabled={running}>
          <span className="presim-go-shine" aria-hidden />
          <span className="presim-go-label">
            {running ? tr('presim.go.starting') : <>{tr('presim.go')}</>}
          </span>
        </button>

        {onBack && (
          <button className="presim-back" onClick={onBack}>
            {tr('common.backArrow')}
          </button>
        )}
      </div>

      {/* Inline modal to edit the scenario */}
      {editOpen && (
        <ScenarioEditModal
          scenario={scenario}
          teams={teams}
          onSave={(s) => { onSaveScenario(s); setEditOpen(false); }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}

/* ─── Scenario-edit modal ─── */
function ScenarioEditModal({
  scenario, teams, onSave, onClose,
}: {
  scenario: Scenario;
  teams: Team[];
  onSave: (s: Scenario) => void;
  onClose: () => void;
}) {
  const { t: tr } = useT();
  const teamName = useTeamName();
  const [italy, setItaly] = useState(scenario.italy);
  const [factors, setFactors] = useState<AppliedFactor[]>(scenario.factors);
  const [chaos, setChaos] = useState(scenario.chaos);

  const activePool = teams.filter((t) => t.active || (italy && t.id === 'ITA'));
  const teamsById = new Map(activePool.map((t) => [t.id, t]));
  const extraDefs = whatIfFactors.filter((f) => !f.flagship && !f.isSlider && f.needsTeam);

  const toggleFactor = (id: AppliedFactor['id'], defaultDelta?: number) => {
    setFactors((prev) =>
      prev.some((f) => f.id === id)
        ? prev.filter((f) => f.id !== id)
        : [...prev, { id, teamIds: [], eloDelta: defaultDelta }]
    );
  };
  const toggleFactorTeam = (id: AppliedFactor['id'], teamId: string) => {
    setFactors((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const cur = f.teamIds ?? [];
        return { ...f, teamIds: cur.includes(teamId) ? cur.filter((t) => t !== teamId) : [...cur, teamId] };
      })
    );
  };

  const save = () => {
    const validFactors = factors.filter((f) => (f.teamIds?.length ?? 0) > 0);
    onSave({ italy, factors: validFactors, chaos });
  };

  return (
    <div className="sedit-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sedit-panel">
        <div className="sedit-header">
          <h2 className="sedit-title">{tr('sedit.title')}</h2>
          <button className="sedit-close" onClick={onClose} aria-label={tr('common.close')}>✕</button>
        </div>

        <div className="sedit-body">
          {/* Italy toggle */}
          <div className="sedit-section">
            <p className="sedit-label">{tr('sedit.italyQ')}</p>
            <div className="sedit-toggle-row">
              <button
                className={`sedit-toggle ${italy ? 'on' : ''}`}
                onClick={() => setItaly(true)}
              >
                <span className="fi fi-it sedit-flag" aria-hidden />
                {tr('sedit.withItaly')}
              </button>
              <button
                className={`sedit-toggle ${!italy ? 'on' : ''}`}
                onClick={() => setItaly(false)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                {tr('sedit.withoutItaly')}
              </button>
            </div>
          </div>

          {/* What-if factors */}
          <div className="sedit-section">
            <p className="sedit-label">{tr('sedit.whatifLabel')} <span className="sedit-label-opt">{tr('sedit.optional')}</span></p>
            <div className="ob-factors">
              {extraDefs.map((f) => {
                const applied = factors.find((a) => a.id === f.id);
                const on = !!applied;
                const selected = applied?.teamIds ?? [];
                const delta = f.defaultEloDelta ?? 0;
                return (
                  <div key={f.id} className={`ob-factor-block ${on ? 'on' : ''}`}>
                    <button className="ob-factor" onClick={() => toggleFactor(f.id, f.defaultEloDelta)}>
                      <span className="ob-factor-emoji">{f.emoji}</span>
                      <span className="ob-factor-body">
                        <span className="ob-factor-label">
                          {tr(f.labelKey)}
                          <span className={`ob-factor-delta ${delta >= 0 ? 'pos' : 'neg'}`}>
                            {delta >= 0 ? '+' : ''}{delta} {tr('sedit.eloUnit')}
                          </span>
                        </span>
                        <span className="ob-factor-desc">{tr(f.descKey)}</span>
                      </span>
                      <span className="ob-factor-check">{on ? '✓' : '+'}</span>
                    </button>
                    {on && (
                      <div className="ob-factor-teams">
                        {selected.length > 0 && (
                          <div className="ob-factor-chips">
                            {selected.map((tid) => (
                              <button key={tid} className="ob-chip" onClick={() => toggleFactorTeam(f.id, tid)} title={tr('ob.factor.removeTeam')}>
                                <span className={`fi fi-${teamsById.get(tid)?.flag}`} aria-hidden />
                                {(() => { const tm = teamsById.get(tid); return tm ? teamName(tm) : tid; })()}
                                <span className="ob-chip-x">×</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <select className="ob-team-select" value="" onChange={(e) => { if (e.target.value) toggleFactorTeam(f.id, e.target.value); }}>
                          <option value="">{selected.length ? tr('ob.factor.addAnother') : tr('ob.factor.chooseTarget')}</option>
                          {activePool.filter((t) => !selected.includes(t.id)).sort((a, b) => teamName(a).localeCompare(teamName(b))).map((t) => (
                            <option key={t.id} value={t.id}>{teamName(t)}</option>
                          ))}
                        </select>
                        {selected.length === 0 && <p className="ob-factor-warn">{tr('ob.factor.warnNoTeam')}</p>}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Chaos */}
              <div className={`ob-factor-block ${chaos > 0 ? 'on' : ''}`}>
                <div className="ob-factor ob-factor--static">
                  <span className="ob-factor-emoji">🎲</span>
                  <span className="ob-factor-body">
                    <span className="ob-factor-label">{tr('ob.chaos.title')} <span className="ob-factor-delta">{chaos}</span></span>
                    <span className="ob-factor-desc">{tr('ob.chaos.desc')}</span>
                  </span>
                </div>
                <div className="ob-factor-teams">
                  <input type="range" min={0} max={100} value={chaos} className="ob-chaos-range" onChange={(e) => setChaos(Number(e.target.value))} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="sedit-footer">
          <button className="sedit-cancel" onClick={onClose}>{tr('common.cancel')}</button>
          <button className="sedit-save" onClick={save}>{tr('sedit.save')}</button>
        </div>
      </div>
    </div>
  );
}
