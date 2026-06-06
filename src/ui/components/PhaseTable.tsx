/**
 * PhaseTable — "The teams' run".
 * One tab per phase (Groups → R16 → Quarters → Semifinal → Final).
 * Each tab lists teams by probability of reaching that phase.
 * Top 10 by default, expandable to all.
 * The title win is already shown in Standings — excluded here.
 */
import { useState } from 'react';
import type { TeamAggregate, Team } from '../../engine/types';
import { oddsFromProb, pctSmart } from '../odds';
import { useT, useTeamName } from '../../i18n';

interface Props {
  aggregates: TeamAggregate[];
  teamsById: Map<string, Team>;
  numRuns: number;
  italyActive: boolean;
  favoriteTeam?: string | null;
}

const PHASES = [
  { key: 'group',   labelKey: 'phase.group.label', field: 'reachRo32Prob'    as const, color: 'var(--cyan)',         descKey: 'phase.group.desc' },
  { key: 'ro16',    labelKey: 'phase.ro16.label',  field: 'reachRo16Prob'    as const, color: 'var(--cyan-bright)',  descKey: 'phase.ro16.desc' },
  { key: 'quarter', labelKey: 'phase.quarter.label', field: 'reachQuarterProb' as const, color: 'var(--green)',      descKey: 'phase.quarter.desc' },
  { key: 'semi',    labelKey: 'phase.semi.label',  field: 'reachSemiProb'    as const, color: 'var(--green-bright)', descKey: 'phase.semi.desc' },
  { key: 'final',   labelKey: 'phase.final.label', field: 'reachFinalProb'   as const, color: 'var(--amber)',        descKey: 'phase.final.desc' },
] as const;

type PhaseKey = typeof PHASES[number]['key'];
const DEFAULT_SHOWN = 10;

export function PhaseTable({ aggregates, teamsById, italyActive, favoriteTeam }: Props) {
  const { t } = useT();
  const teamName = useTeamName();
  const [activePhase, setActivePhase] = useState<PhaseKey>('group');
  const [showAll, setShowAll] = useState(false);

  const phase = PHASES.find(p => p.key === activePhase)!;

  // On tab change, reset to "show 10".
  function handlePhaseChange(key: PhaseKey) {
    setActivePhase(key);
    setShowAll(false);
  }

  const all = aggregates
    .filter(a => (a[phase.field] as number) > 0)
    .slice()
    .sort((a, b) => (b[phase.field] as number) - (a[phase.field] as number));

  const maxProb = (all[0]?.[phase.field] as number) ?? 1;

  // Extra rows: favorite and Italy if outside the top 10.
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
        <h2 className="dash-section-title">{t('phase.title')}</h2>
        <span className="dash-section-sub">{t('phase.sub')}</span>
      </div>

      {/* Phase tabs */}
      <div className="pt-phase-tabs">
        {PHASES.map(p => (
          <button
            key={p.key}
            className={`pt-phase-tab ${activePhase === p.key ? 'on' : ''}`}
            style={{ '--phase-color': p.color } as React.CSSProperties}
            onClick={() => handlePhaseChange(p.key)}
          >
            {t(p.labelKey)}
          </button>
        ))}
      </div>

      {/* Active phase description */}
      <p className="pt-phase-desc">{t('phase.topN', { desc: t(phase.descKey), n: String(showAll ? all.length : Math.min(DEFAULT_SHOWN, all.length)) })}</p>

      {/* Table */}
      <div className="pt-table">
        <div className="pt-thead">
          <span className="pt-col-rank">#</span>
          <span className="pt-col-team">{t('common.team')}</span>
          <span className="pt-col-bar" />
          <span className="pt-col-odds-h">{t('common.odds')}</span>
          <span className="pt-col-prob-h">{t('common.prob')}</span>
        </div>

        {rows.map((a) => {
          const team = teamsById.get(a.teamId);
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
                <span className={`fi fi-${team?.flag}`} aria-hidden />
                <span className="pt-name">
                  {team ? teamName(team) : a.teamId}
                  {isFav && <span className="pt-fav"> ♥</span>}
                </span>
              </span>
              <span className="pt-col-bar">
                <span className="pt-bar-track">
                  <span
                    className="pt-bar-fill"
                    style={{ width: `${barW}%`, background: phase.color }}
                  />
                </span>
              </span>
              <span className="pt-col-odds">
                <span className="pt-odds">@{oddsFromProb(prob)}</span>
              </span>
              <span className="pt-col-prob">
                <strong className="pt-prob">{pctSmart(prob)}</strong>
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
              {t('common.showLess')}
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              {t('common.showAllTeams', { n: String(all.length) })}
            </>
          )}
        </button>
      )}
    </section>
  );
}
