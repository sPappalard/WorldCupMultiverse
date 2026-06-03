import { useState } from 'react';
import type { MatchResult, SampleRun, Team } from '../../engine/types';

interface Props {
  sample: SampleRun;
  teamsById: Map<string, Team>;
  favoriteTeam?: string | null;
}

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
const pct = (x: number) => `${Math.round(x * 100)}%`;

function MatchRow({ match, teamsById, favoriteTeam }: {
  match: MatchResult; teamsById: Map<string, Team>; favoriteTeam?: string | null;
}) {
  const home = teamsById.get(match.homeId);
  const away = teamsById.get(match.awayId);
  const probHome = match.winProbHome ?? 0.5;
  const homeWon = match.homeGoals > match.awayGoals;
  const awayWon = match.awayGoals > match.homeGoals;

  return (
    <div className="gm3-match">
      <div className={`gm3-side gm3-side--home ${homeWon ? 'won' : ''} ${match.homeId === favoriteTeam ? 'fav' : ''}`}>
        <span className={`fi fi-${home?.flag} gm3-flag`} aria-hidden />
        <span className="gm3-name">{home?.name ?? match.homeId}</span>
        <span className="gm3-prob">{pct(probHome)}</span>
      </div>
      <div className={`gm3-score ${homeWon ? 'home-win' : awayWon ? 'away-win' : 'draw'}`}>
        <span>{match.homeGoals}</span>
        <span className="gm3-sep">–</span>
        <span>{match.awayGoals}</span>
        {match.penalties && <span className="gm3-rig">rig</span>}
      </div>
      <div className={`gm3-side gm3-side--away ${awayWon ? 'won' : ''} ${match.awayId === favoriteTeam ? 'fav' : ''}`}>
        <span className="gm3-prob">{pct(1 - probHome)}</span>
        <span className="gm3-name">{away?.name ?? match.awayId}</span>
        <span className={`fi fi-${away?.flag} gm3-flag`} aria-hidden />
      </div>
    </div>
  );
}

function GroupPanel({ group, sample, teamsById, favoriteTeam }: {
  group: string; sample: SampleRun; teamsById: Map<string, Team>; favoriteTeam?: string | null;
}) {
  const matches = sample.groupResults[group] ?? [];
  const standings = sample.groupStandings[group] ?? [];
  const [showMatches, setShowMatches] = useState(false);

  return (
    <div className="gm3-group">
      <div className="gm3-group-head">Girone {group}</div>

      {/* Classifica compatta */}
      <div className="gm3-standings">
        {standings.map((s, idx) => {
          const t = teamsById.get(s.teamId);
          const qual = idx < 2;
          return (
            <div key={s.teamId} className={`gm3-standing ${qual ? 'qualified' : ''} ${s.teamId === favoriteTeam ? 'fav' : ''}`}>
              <span className="gm3-pos">{idx + 1}</span>
              <span className={`fi fi-${t?.flag} gm3-sflag`} aria-hidden />
              <span className="gm3-sname">{t?.name ?? s.teamId}</span>
              <span className="gm3-pts">{s.points}</span>
              <span className="gm3-gd">{s.goalDifference >= 0 ? '+' : ''}{s.goalDifference}</span>
            </div>
          );
        })}
      </div>

      {/* Toggle partite */}
      <button className="gm3-matches-toggle" onClick={() => setShowMatches(v => !v)}>
        {showMatches ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
            Nascondi partite
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            {matches.length} partite
          </>
        )}
      </button>

      {showMatches && (
        <div className="gm3-matches-list">
          {matches.map((m, i) => (
            <MatchRow key={i} match={m} teamsById={teamsById} favoriteTeam={favoriteTeam} />
          ))}
        </div>
      )}
    </div>
  );
}

export function GroupMatches({ sample, teamsById, favoriteTeam }: Props) {
  const [open, setOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  return (
    <section className="dash-section">
      <div className="dash-section-header">
        <h2 className="dash-section-title">Risultati gironi</h2>
        <span className="dash-section-sub">Questa simulazione</span>
        <button className="gm3-expand-btn" onClick={() => setOpen(v => !v)}>
          {open ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
              Chiudi
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              Tutti i gironi
            </>
          )}
        </button>
      </div>

      {open && (
        <>
          {/* Tab navigazione gruppi */}
          <div className="gm3-tabs">
            <button
              className={`gm3-tab ${activeGroup === null ? 'on' : ''}`}
              onClick={() => setActiveGroup(null)}
            >
              Tutti
            </button>
            {GROUPS.map(g => (
              <button
                key={g}
                className={`gm3-tab ${activeGroup === g ? 'on' : ''}`}
                onClick={() => setActiveGroup(activeGroup === g ? null : g)}
              >
                {g}
              </button>
            ))}
          </div>

          <div className="gm3-grid">
            {(activeGroup ? [activeGroup] : GROUPS).map(g => (
              <GroupPanel key={g} group={g} sample={sample} teamsById={teamsById} favoriteTeam={favoriteTeam} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
