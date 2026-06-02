import type { TeamAggregate, Team } from '../../engine/types';

interface Props {
  aggregates: TeamAggregate[];
  teamsById: Map<string, Team>;
  italyActive: boolean;
}

/**
 * Percentuale leggibile: per le big arrotonda all'intero, ma per le code
 * (sotto l'1%) mostra un decimale così non collassano tutte a "0%".
 * Sotto lo 0.05% mostra "<0.1%" invece di "0.0%".
 */
const pct = (x: number) => {
  const p = x * 100;
  if (p >= 1) return `${Math.round(p)}%`;
  if (p >= 0.05) return `${p.toFixed(1)}%`;
  if (p > 0) return '<0.1%';
  return '0%';
};

/**
 * Quota decimale in stile bookmaker dalla probabilità del modello.
 * Applichiamo un margine (overround) ~18% riducendo la prob, così le quote
 * sono realistiche (un po' più basse di quelle "eque" 1/p). Cappata a 999.
 */
const oddsFromProb = (x: number): string => {
  if (x <= 0) return '—';
  const margin = 0.85; // riduce la prob → quota più "da banco"
  const o = 1 / (x * margin);
  if (o >= 100) return Math.round(o).toString();
  if (o >= 10) return o.toFixed(1);
  return o.toFixed(2);
};

/** Classifica aggregata: probabilità di vittoria torneo (top 24). */
export function Standings({ aggregates, teamsById, italyActive }: Props) {
  const top = aggregates.filter((a) => a.winProb > 0).slice(0, 24);
  return (
    <div className="card">
      <h2>Probabilità di vittoria del torneo</h2>
      <p className="muted small">
        Dall'aggregato delle run Monte Carlo, calibrato sulle quote bookmaker.
        Accanto alla %, la quota decimale stile scommessa.
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
              <span className="odds" title="Quota decimale (stile bookmaker)">@{oddsFromProb(a.winProb)}</span>
              <span className="prob">{pct(a.winProb)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
