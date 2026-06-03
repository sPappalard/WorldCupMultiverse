/**
 * PhaseTable — "Il percorso delle squadre".
 * Una tab per ogni fase (Gironi → Ottavi → Quarti → Semifinale → Finale).
 * Ogni tab mostra le squadre ordinate per probabilità di raggiungere quella fase.
 * Top 10 di default, espandibile a tutte.
 * La vittoria è mostrata già in Standings — qui la escludiamo.
 */
import { useState } from 'react';
import type { TeamAggregate, Team } from '../../engine/types';
import { oddsFromProb, pctSmart } from '../odds';

interface Props {
  aggregates: TeamAggregate[];
  teamsById: Map<string, Team>;
  numRuns: number;
  italyActive: boolean;
  favoriteTeam?: string | null;
}

const PHASES = [
  { key: 'group',   label: 'Gironi',    field: 'reachRo32Prob'    as const, color: 'var(--cyan)',         desc: 'Si qualifica dalla fase a gironi' },
  { key: 'ro16',    label: 'Ottavi',    field: 'reachRo16Prob'    as const, color: 'var(--cyan-bright)',  desc: 'Raggiunge gli ottavi di finale' },
  { key: 'quarter', label: 'Quarti',    field: 'reachQuarterProb' as const, color: 'var(--green)',        desc: 'Raggiunge i quarti di finale' },
  { key: 'semi',    label: 'Semifinale', field: 'reachSemiProb'   as const, color: 'var(--green-bright)', desc: 'Raggiunge la semifinale' },
  { key: 'final',   label: 'Finale',    field: 'reachFinalProb'   as const, color: 'var(--amber)',        desc: 'Raggiunge la finale' },
] as const;

type PhaseKey = typeof PHASES[number]['key'];
const DEFAULT_SHOWN = 10;

export function PhaseTable({ aggregates, teamsById, italyActive, favoriteTeam }: Props) {
  const [activePhase, setActivePhase] = useState<PhaseKey>('group');
  const [showAll, setShowAll] = useState(false);

  const phase = PHASES.find(p => p.key === activePhase)!;

  // Quando si cambia tab, riporta a "mostra 10"
  function handlePhaseChange(key: PhaseKey) {
    setActivePhase(key);
    setShowAll(false);
  }

  const all = aggregates
    .filter(a => (a[phase.field] as number) > 0)
    .slice()
    .sort((a, b) => (b[phase.field] as number) - (a[phase.field] as number));

  const maxProb = (all[0]?.[phase.field] as number) ?? 1;

  // Extra rows: favorito e Italia se fuori dalla top 10
  const extraIds = new Set<string>();
  if (!showAll) {
    const top = all.slice(0, DEFAULT_SHOWN);
    if (italyActive && !top.find(a => a.teamId === 'ITA') && all.find(a => a.teamId === 'ITA'))
      extraIds.add('ITA');
    if (favoriteTeam && !top.find(a => a.teamId === favoriteTeam) && all.find(a => a.teamId === favoriteTeam))
      extraIds.add(favoriteTeam);
  }
  const rows = showAll
    ? all
    : [...all.slice(0, DEFAULT_SHOWN), ...all.filter(a => extraIds.has(a.teamId))];

  return (
    <section className="dash-section">
      <div className="dash-section-header">
        <h2 className="dash-section-title">Il percorso delle squadre</h2>
        <span className="dash-section-sub">Probabilità di raggiungere ogni fase</span>
      </div>

      {/* Tab fasi */}
      <div className="pt-phase-tabs">
        {PHASES.map(p => (
          <button
            key={p.key}
            className={`pt-phase-tab ${activePhase === p.key ? 'on' : ''}`}
            style={{ '--phase-color': p.color } as React.CSSProperties}
            onClick={() => handlePhaseChange(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Descrizione fase attiva */}
      <p className="pt-phase-desc">{phase.desc} · top {showAll ? all.length : Math.min(DEFAULT_SHOWN, all.length)}</p>

      {/* Tabella */}
      <div className="pt-table">
        <div className="pt-thead">
          <span className="pt-col-rank">#</span>
          <span className="pt-col-team">Squadra</span>
          <span className="pt-col-phase">{phase.label}</span>
        </div>

        {rows.map((a) => {
          const t = teamsById.get(a.teamId);
          const isItaly = a.teamId === 'ITA' && italyActive;
          const isFav = a.teamId === favoriteTeam;
          const prob = a[phase.field] as number;
          const realRank = all.findIndex(x => x.teamId === a.teamId);
          const barW = Math.min(100, (prob / maxProb) * 100);
          const isExtra = extraIds.has(a.teamId);

          return (
            <div
              key={a.teamId}
              className={[
                'pt-flat-row',
                isItaly ? 'italy' : '',
                isFav ? 'fav' : '',
                isExtra ? 'extra' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="pt-col-rank">{realRank + 1}</span>
              <span className="pt-col-team">
                <span className={`fi fi-${t?.flag}`} aria-hidden />
                <span className="pt-name">
                  {t?.name ?? a.teamId}
                  {isFav && <span className="pt-fav"> ♥</span>}
                </span>
              </span>
              <span className="pt-col-phase">
                <span className="pt-bar-track">
                  <span
                    className="pt-bar-fill"
                    style={{ width: `${barW}%`, background: phase.color }}
                  />
                </span>
                <span className="pt-prob">{pctSmart(prob)}</span>
                <span className="pt-odds">@{oddsFromProb(prob)}</span>
              </span>
            </div>
          );
        })}
      </div>

      {all.length > DEFAULT_SHOWN && (
        <button className="stn-expand-btn" onClick={() => setShowAll(v => !v)}>
          {showAll ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
              Mostra meno
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              Mostra tutte le {all.length} squadre
            </>
          )}
        </button>
      )}
    </section>
  );
}
