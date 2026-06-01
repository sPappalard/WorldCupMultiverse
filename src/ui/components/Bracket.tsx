import type { SampleRun, Team, TeamAggregate } from '../../engine/types';

interface Props {
  sample: SampleRun;
  teamsById: Map<string, Team>;
  aggregates: TeamAggregate[];
  /** Round attualmente svelato dall'animazione (0 = solo gironi). */
  revealedRound: number;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Tabellone della SINGOLA simulazione d'esempio (spec §8): "una simulazione
 * possibile", distinta dall'aggregato. Accanto a ogni squadra la % aggregata.
 */
export function Bracket({ sample, teamsById, aggregates, revealedRound }: Props) {
  const winProbById = new Map(aggregates.map((a) => [a.teamId, a.winProb]));

  const TeamChip = ({ id, highlight }: { id: string; highlight?: boolean }) => {
    const t = teamsById.get(id);
    return (
      <span className={highlight ? 'chip chip-win' : 'chip'}>
        <span className={`fi fi-${t?.flag}`} aria-hidden />
        <span className="chip-name">{t?.name ?? id}</span>
        <span className="chip-prob">{pct(winProbById.get(id) ?? 0)}</span>
      </span>
    );
  };

  return (
    <div className="card">
      <h2>
        Tabellone — <span className="badge">una simulazione possibile</span>
      </h2>
      <p className="muted small">
        Questa è UNA run giocata dal vivo, non la previsione. I numeri sopra
        vengono dall'aggregato. Campione di questa run:{' '}
        <strong>{teamsById.get(sample.championId)?.name}</strong> 🏆
      </p>

      {/* Gironi */}
      <h3>Gironi (prime 2 + migliori terze)</h3>
      <div className="groups-grid">
        {Object.entries(sample.groupStandings).map(([g, standings]) => (
          <div key={g} className="group-box">
            <div className="group-title">Girone {g}</div>
            {standings.map((s, idx) => (
              <div key={s.teamId} className={`group-row pos-${idx + 1}`}>
                <span className="pos">{idx + 1}</span>
                <span className={`fi fi-${teamsById.get(s.teamId)?.flag}`} aria-hidden />
                <span className="g-name">{teamsById.get(s.teamId)?.name}</span>
                <span className="g-pts">{s.points}p</span>
                <span className="g-gd">
                  {s.goalDifference >= 0 ? '+' : ''}
                  {s.goalDifference}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Eliminazione diretta */}
      <h3>Fase a eliminazione</h3>
      <div className="knockout">
        {sample.knockoutRounds.map((round, idx) => (
          <div
            key={round.name}
            className={`ko-round ${idx <= revealedRound ? 'revealed' : 'hidden-round'}`}
          >
            <div className="ko-round-title">{round.name}</div>
            {round.matches.map((m, mi) => (
              <div key={mi} className="ko-match">
                <div className="ko-side">
                  <TeamChip id={m.homeId} highlight={m.winnerId === m.homeId} />
                  <span className="score">{m.homeGoals}</span>
                </div>
                <div className="ko-side">
                  <TeamChip id={m.awayId} highlight={m.winnerId === m.awayId} />
                  <span className="score">{m.awayGoals}</span>
                </div>
                {(m.winProbHome !== undefined || m.penalties) && (
                  <div className="ko-match-meta">
                    {m.winProbHome !== undefined && (
                      <span className="ko-matchprob">
                        {pct(m.winProbHome)} – {pct(1 - m.winProbHome)}
                      </span>
                    )}
                    {m.penalties && <span className="ko-pen">rig.</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
