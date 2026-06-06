import { useState } from 'react';
import type { TeamAggregate, Team } from '../../engine/types';
import { useT, useTeamName } from '../../i18n';

interface Props {
  aggregates: TeamAggregate[];
  teamsById: Map<string, Team>;
  italyActive: boolean;
  favoriteTeam?: string | null;
}

const pct = (x: number) => {
  const p = x * 100;
  if (p >= 1) return `${Math.round(p)}%`;
  if (p >= 0.05) return `${p.toFixed(1)}%`;
  if (p > 0) return '<0.1%';
  return '0%';
};

const oddsFromProb = (x: number): string => {
  if (x <= 0) return '—';
  const o = 1 / (x * 0.85);
  if (o >= 100) return Math.round(o).toString();
  if (o >= 10) return o.toFixed(1);
  return o.toFixed(2);
};

const MEDALS = ['🥇', '🥈', '🥉'];
const DEFAULT_SHOWN = 10;

export function Standings({ aggregates, teamsById, italyActive, favoriteTeam }: Props) {
  const { t } = useT();
  const teamName = useTeamName();
  const [showAll, setShowAll] = useState(false);
  const all = aggregates.filter((a) => a.winProb > 0);
  const maxProb = all[0]?.winProb ?? 1;
  const displayed = showAll ? all : all.slice(0, DEFAULT_SHOWN);

  // If the favorite or Italy are outside the top 10, add them anyway when collapsed.
  const extraIds = new Set<string>();
  if (!showAll) {
    if (italyActive && !displayed.find(a => a.teamId === 'ITA'))
      extraIds.add('ITA');
    if (favoriteTeam && !displayed.find(a => a.teamId === favoriteTeam))
      extraIds.add(favoriteTeam);
  }
  const rows = showAll
    ? all
    : [...displayed, ...all.filter(a => extraIds.has(a.teamId))];

  return (
    <section className="dash-section">
      <div className="dash-section-header">
        <h2 className="dash-section-title">{t('standings.title')}</h2>
        <span className="dash-section-sub">{t('standings.sub')}</span>
      </div>

      <div className="stn-table">
        <div className="stn-row stn-row--header">
          <span className="stn-rank">#</span>
          <span className="stn-team-col">{t('common.team')}</span>
          <span className="stn-bar-col" />
          <span className="stn-odds-col">{t('common.odds')}</span>
          <span className="stn-prob-col">{t('common.prob')}</span>
        </div>

        {rows.map((a) => {
          const t = teamsById.get(a.teamId);
          const isItaly = a.teamId === 'ITA' && italyActive;
          const isFav = a.teamId === favoriteTeam;
          const realRank = all.findIndex(x => x.teamId === a.teamId);
          const barW = Math.min(100, (a.winProb / maxProb) * 100);
          const isMedal = realRank < 3;
          const isExtra = extraIds.has(a.teamId);

          return (
            <div
              key={a.teamId}
              className={[
                'stn-row',
                isItaly ? 'stn-row--italy' : '',
                isFav ? 'stn-row--fav' : '',
                isMedal ? `stn-row--medal-${realRank + 1}` : '',
                isExtra ? 'stn-row--extra' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="stn-rank">
                {isMedal
                  ? <span className="stn-medal">{MEDALS[realRank]}</span>
                  : <span className="stn-rank-num">{realRank + 1}</span>}
              </span>
              <span className="stn-team-col">
                <span className={`fi fi-${t?.flag}`} aria-hidden />
                <span className="stn-name">
                  {t ? teamName(t) : a.teamId}
                  {isFav && <span className="stn-fav"> ♥</span>}
                  {isItaly && <span className="stn-italy-badge">ITA</span>}
                </span>
              </span>
              <span className="stn-bar-col">
                <span className="stn-bar-track">
                  <span className={`stn-bar-fill${isItaly ? ' italy' : isFav ? ' fav' : ''}`} style={{ width: `${barW}%` }} />
                </span>
              </span>
              <span className="stn-odds-col">
                <span className="stn-odds">@{oddsFromProb(a.winProb)}</span>
              </span>
              <span className="stn-prob-col">
                <strong className="stn-prob">{pct(a.winProb)}</strong>
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
