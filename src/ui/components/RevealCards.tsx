/**
 * RevealCards — traghetto narrativo dal cinema alla dashboard.
 * Sequenza di schede che, una dopo l'altra, riportano l'utente dall'emozione
 * della singola run ai numeri aggregati. Onestà metodologica (invariante §6):
 * la prima scheda dichiara esplicitamente che il cinema era 1 run su 100.000.
 */
import { useState } from 'react';
import type { TeamAggregate, Team } from '../../engine/types';
import { oddsFromProb, pctSmart } from '../odds';

interface Props {
  aggregates: TeamAggregate[];
  teamsById: Map<string, Team>;
  numRuns: number;
  favoriteTeam: string | null;
  championId: string;
  italyActive: boolean;
  onDone: () => void;
}

export function RevealCards({
  aggregates, teamsById, numRuns, favoriteTeam, championId, onDone,
}: Props) {
  const [step, setStep] = useState(0);
  const top5 = aggregates.filter((a) => a.winProb > 0).slice(0, 5);
  const champ = teamsById.get(championId);
  const champAgg = aggregates.find((a) => a.teamId === championId);

  const cards = [
    // 1. Frame onesto
    {
      key: 'honest',
      render: () => (
        <>
          <p className="rev-kicker">Quella era una possibilità</p>
          <h1 className="rev-title">
            1 simulazione<br />su {numRuns.toLocaleString('it-IT')}
          </h1>
          <p className="rev-body">
            Il torneo che hai appena visto è <strong>una</strong> delle{' '}
            {numRuns.toLocaleString('it-IT')} partite del Mondiale che abbiamo
            simulato. Ogni volta può vincere una squadra diversa.
            {champ && champAgg && (
              <> Stavolta ha vinto <strong>{champ.name}</strong>, che però vince
              solo nel <strong>{pctSmart(champAgg.winProb)}</strong> dei casi.</>
            )}
          </p>
        </>
      ),
    },
    // 2. Probabilità reali
    {
      key: 'probs',
      render: () => (
        <>
          <p className="rev-kicker">Ecco i numeri veri</p>
          <h1 className="rev-title">Le probabilità reali</h1>
          <p className="rev-body">Mettendo insieme tutte le simulazioni, ecco chi ha più probabilità di vincere.</p>
          <div className="rev-top5">
            <div className="rev-top5-head" aria-hidden>
              <span />
              <span />
              <span />
              <span />
              <span className="rev-top5-odds">Quota</span>
              <span className="rev-top5-prob">Probab.</span>
            </div>
            {top5.map((a, i) => {
              const t = teamsById.get(a.teamId);
              return (
                <div key={a.teamId} className={`rev-top5-row ${a.teamId === favoriteTeam ? 'fav' : ''}`}>
                  <span className="rev-top5-rank">{i + 1}</span>
                  <span className={`fi fi-${t?.flag}`} aria-hidden />
                  <span className="rev-top5-name">{t?.name ?? a.teamId}</span>
                  <span className="rev-top5-bar">
                    <span className="rev-top5-fill" style={{ width: `${(a.winProb / top5[0].winProb) * 100}%` }} />
                  </span>
                  <span className="rev-top5-odds">@{oddsFromProb(a.winProb)}</span>
                  <span className="rev-top5-prob">{pctSmart(a.winProb)}</span>
                </div>
              );
            })}
          </div>
        </>
      ),
    },
    // 3. Percorso
    {
      key: 'path',
      render: () => (
        <>
          <p className="rev-kicker">C'è molto di più</p>
          <h1 className="rev-title">Il percorso di ogni squadra</h1>
          <p className="rev-body">
            Nella dashboard trovi, per ogni nazionale, la probabilità (e la quota)
            di superare i gironi, arrivare agli ottavi, ai quarti, in semifinale,
            in finale e di alzare la coppa. Più il dettaglio della
            <strong> tua </strong> simulazione, partita per partita.
          </p>
        </>
      ),
    },
  ];

  const isLast = step === cards.length - 1;

  return (
    <div className="rev">
      <div className="rev-stadium" aria-hidden />
      <div className="rev-card" key={cards[step].key}>
        {cards[step].render()}

        <div className="rev-actions">
          {!isLast ? (
            <button className="rev-next" onClick={() => setStep((s) => s + 1)}>Avanti →</button>
          ) : (
            <button className="rev-next" onClick={onDone}>Apri la dashboard →</button>
          )}
        </div>

        <div className="rev-dots">
          {cards.map((c, i) => (
            <span key={c.key} className={`rev-dot ${i === step ? 'on' : ''} ${i < step ? 'past' : ''}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
