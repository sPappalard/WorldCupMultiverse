import type { TeamAggregate, Team } from '../../engine/types';

interface Props {
  aggregates: TeamAggregate[];
  teamsById: Map<string, Team>;
  italyActive: boolean;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Classifica aggregata: probabilità di vittoria torneo (top 16). */
export function Standings({ aggregates, teamsById, italyActive }: Props) {
  const top = aggregates.filter((a) => a.winProb > 0).slice(0, 16);
  return (
    <div className="card">
      <h2>Probabilità di vittoria del torneo</h2>
      <p className="muted small">
        Dall'aggregato delle run Monte Carlo. Percentuali arrotondate.
      </p>
      <ol className="standings">
        {top.map((a, i) => {
          const t = teamsById.get(a.teamId);
          const isItaly = a.teamId === 'ITA';
          return (
            <li
              key={a.teamId}
              className={isItaly && italyActive ? 'standings-row italy' : 'standings-row'}
            >
              <span className="rank">{i + 1}</span>
              <span className={`fi fi-${t?.flag}`} aria-hidden />
              <span className="team-name">{t?.name ?? a.teamId}</span>
              <span className="bar-wrap">
                <span className="bar" style={{ width: `${a.winProb * 100 * 3}%` }} />
              </span>
              <span className="prob">{pct(a.winProb)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
