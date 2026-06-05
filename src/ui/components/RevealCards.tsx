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
  /** Solo se italyActive: apre la card Focus Italia nella dashboard. */
  onOpenItaly?: () => void;
}

export function RevealCards({
  aggregates, teamsById, numRuns, favoriteTeam, championId, italyActive, onDone, onOpenItaly,
}: Props) {
  const { t, nf } = useT();
  const teamName = useTeamName();
  const [step, setStep] = useState(0);
  const top5 = aggregates.filter((a) => a.winProb > 0).slice(0, 5);
  const champ = teamsById.get(championId);
  const champAgg = aggregates.find((a) => a.teamId === championId);

  // Posizione e dati dell'Italia nell'aggregato (solo se attiva e fuori dalla top5).
  const italyRank = italyActive ? aggregates.findIndex((a) => a.teamId === 'ITA') : -1;
  const italyAgg  = italyRank >= 0 ? aggregates[italyRank] : undefined;
  const italyTeam = teamsById.get('ITA');
  const showItalyRow = italyActive && italyAgg && italyTeam && italyRank >= 5;

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
              const tm = teamsById.get(a.teamId);
              return (
                <div key={a.teamId} className={`rev-top5-row ${a.teamId === favoriteTeam ? 'fav' : ''} ${italyActive && a.teamId === 'ITA' ? 'rev-italy' : ''}`}>
                  <span className="rev-top5-rank">{i + 1}</span>
                  <span className={`fi fi-${tm?.flag}`} aria-hidden />
                  <span className="rev-top5-name">{tm ? teamName(tm) : a.teamId}</span>
                  <span className="rev-top5-bar">
                    <span className="rev-top5-fill" style={{ width: `${(a.winProb / top5[0].winProb) * 100}%` }} />
                  </span>
                  <span className="rev-top5-odds">@{oddsFromProb(a.winProb)}</span>
                  <span className="rev-top5-prob">{pctSmart(a.winProb)}</span>
                </div>
              );
            })}
            {/* Riga Italia se è fuori dalla top 5 */}
            {showItalyRow && (
              <>
                <div className="rev-top5-separator" aria-hidden>···</div>
                <div className="rev-top5-row rev-italy">
                  <span className="rev-top5-rank">{italyRank + 1}</span>
                  <span className={`fi fi-${italyTeam!.flag}`} aria-hidden />
                  <span className="rev-top5-name">{teamName(italyTeam!)}</span>
                  <span className="rev-top5-bar">
                    <span className="rev-top5-fill" style={{ width: `${(italyAgg!.winProb / top5[0].winProb) * 100}%` }} />
                  </span>
                  <span className="rev-top5-odds">@{oddsFromProb(italyAgg!.winProb)}</span>
                  <span className="rev-top5-prob">{pctSmart(italyAgg!.winProb)}</span>
                </div>
              </>
            )}
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
            <div className="rev-actions-last">
              <button className="rev-next" onClick={onDone}>{t('reveal.openDashboard')}</button>
              {italyActive && onOpenItaly && (
                <button className="rev-next rev-next--italy" onClick={() => { onDone(); setTimeout(onOpenItaly!, 50); }}>
                  {t('reveal.focusItaly')}
                </button>
              )}
            </div>
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
