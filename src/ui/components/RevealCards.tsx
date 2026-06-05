/**
 * RevealCards — traghetto narrativo dal cinema alla dashboard.
 * Sequenza di schede che, una dopo l'altra, riportano l'utente dall'emozione
 * della singola run ai numeri aggregati. Onestà metodologica (invariante §6):
 * la prima scheda dichiara esplicitamente che il cinema era 1 run su 100.000.
 */
import { useState } from 'react';
import type { TeamAggregate, Team } from '../../engine/types';
import { oddsFromProb, pctSmart } from '../odds';
import { useT, useTeamName } from '../../i18n';

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
  const { t, nf } = useT();
  const teamName = useTeamName();
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
          <p className="rev-kicker">{t('reveal.honest.kicker')}</p>
          <h1 className="rev-title">
            {t('reveal.honest.title').split('{n}').map((part, i, arr) =>
              i < arr.length - 1 ? <span key={i}>{part}<br />{nf(numRuns)}</span> : <span key={i}>{part}</span>
            )}
          </h1>
          <p className="rev-body">
            {t('reveal.honest.body', { n: nf(numRuns) })}
            {champ && champAgg && (
              t('reveal.honest.body.champ', { name: teamName(champ), pct: pctSmart(champAgg.winProb) })
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
          <p className="rev-kicker">{t('reveal.probs.kicker')}</p>
          <h1 className="rev-title">{t('reveal.probs.title')}</h1>
          <p className="rev-body">{t('reveal.probs.body')}</p>
          <div className="rev-top5">
            <div className="rev-top5-head" aria-hidden>
              <span />
              <span />
              <span />
              <span className="rev-top5-bar" />
              <span className="rev-top5-odds">{t('common.odds')}</span>
              <span className="rev-top5-prob">{t('common.probShort')}</span>
            </div>
            {top5.map((a, i) => {
              const t = teamsById.get(a.teamId);
              return (
                <div key={a.teamId} className={`rev-top5-row ${a.teamId === favoriteTeam ? 'fav' : ''}`}>
                  <span className="rev-top5-rank">{i + 1}</span>
                  <span className={`fi fi-${t?.flag}`} aria-hidden />
                  <span className="rev-top5-name">{t ? teamName(t) : a.teamId}</span>
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
          <p className="rev-kicker">{t('reveal.path.kicker')}</p>
          <h1 className="rev-title">{t('reveal.path.title')}</h1>
          <p className="rev-body">{t('reveal.path.body')}</p>
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
            <button className="rev-next" onClick={() => setStep((s) => s + 1)}>{t('common.next')}</button>
          ) : (
            <button className="rev-next" onClick={onDone}>{t('reveal.openDashboard')}</button>
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
