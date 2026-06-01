import { useState } from 'react';
import type { MatchResult, SampleRun } from '../../engine/types';
import type { Team } from '../../engine/types';

interface Props {
  sample: SampleRun;
  teamsById: Map<string, Team>;
}

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
const pct = (x: number) => `${Math.round(x * 100)}%`;

function MatchRow({ match, teamsById }: { match: MatchResult; teamsById: Map<string, Team> }) {
  const home = teamsById.get(match.homeId);
  const away = teamsById.get(match.awayId);
  const probHome = match.winProbHome ?? 0.5;
  const probAway = 1 - probHome;
  const homeWon = match.homeGoals > match.awayGoals;
  const awayWon = match.awayGoals > match.homeGoals;

  return (
    <div className="gm-match">
      {/* Home */}
      <div className={`gm-team gm-team--home ${homeWon ? 'gm-team--winner' : ''}`}>
        <span className={`fi fi-${home?.flag}`} aria-hidden />
        <span className="gm-name">{home?.name ?? match.homeId}</span>
        <span className="gm-prob muted small">{pct(probHome)}</span>
      </div>

      {/* Score */}
      <div className="gm-score-block">
        <span className={`gm-score ${homeWon ? 'gm-score--win-left' : awayWon ? 'gm-score--win-right' : 'gm-score--draw'}`}>
          {match.homeGoals} – {match.awayGoals}
        </span>
        {match.penalties && (
          <span className="gm-rig">rig.</span>
        )}
      </div>

      {/* Away */}
      <div className={`gm-team gm-team--away ${awayWon ? 'gm-team--winner' : ''}`}>
        <span className="gm-prob muted small">{pct(probAway)}</span>
        <span className="gm-name">{away?.name ?? match.awayId}</span>
        <span className={`fi fi-${away?.flag}`} aria-hidden />
      </div>
    </div>
  );
}

/** Partite di un singolo girone: 6 match (round-robin 4 squadre). */
function GroupMatchesBlock({ group, matches, teamsById }: {
  group: string;
  matches: MatchResult[];
  teamsById: Map<string, Team>;
}) {
  return (
    <div className="gm-group">
      <div className="gm-group-title">Girone {group}</div>
      {matches.map((m, i) => (
        <MatchRow key={i} match={m} teamsById={teamsById} />
      ))}
    </div>
  );
}

export function GroupMatches({ sample, teamsById }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card">
      <button className="gm-toggle-btn" onClick={() => setOpen((v) => !v)}>
        {open ? '▲' : '▼'} Risultati gironi — simulazione campione
      </button>
      {open && (
        <div className="gm-grid">
          {GROUPS.map((g) => {
            const matches = sample.groupResults[g];
            if (!matches || matches.length === 0) return null;
            return (
              <GroupMatchesBlock
                key={g}
                group={g}
                matches={matches}
                teamsById={teamsById}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
