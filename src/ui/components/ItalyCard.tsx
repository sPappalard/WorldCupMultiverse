/**
 * ItalyCard — pagina Focus Italia. Niente hero foto.
 * Layout: header identità + griglia dati + percorso torneo (o CTA simula).
 */
import { useState } from 'react';
import type { Team, ModelParams, TeamStats, TeamAggregate } from '../../engine/types';
import { pctSmart, oddsFromProb } from '../odds';
import { useT } from '../../i18n';

interface Props {
  teams: Team[];
  params: ModelParams | null;
  teamStats: Map<string, TeamStats>;
  italyActive: boolean;
  aggregates?: TeamAggregate[];
  numRuns?: number;
  onActivate: () => void;
  heroImage?: string; // non usato — mantenuto per compatibilità prop
}

const ITALY_ID = 'ITA';
const LOADING_DURATION = 12000;

const PHASES = [
  { labelKey: 'italy.phase.groups',   field: 'reachRo32Prob'    as const, color: 'var(--cyan)',         emoji: '🏟️' },
  { labelKey: 'italy.phase.r32',      field: 'reachRo32Prob'    as const, color: 'var(--cyan-bright)',  emoji: '⚡' },
  { labelKey: 'italy.phase.r16',      field: 'reachRo16Prob'    as const, color: '#60a5fa',             emoji: '🔵' },
  { labelKey: 'italy.phase.quarter',  field: 'reachQuarterProb' as const, color: 'var(--green)',        emoji: '🟢' },
  { labelKey: 'italy.phase.semi',     field: 'reachSemiProb'    as const, color: 'var(--green-bright)', emoji: '🔥' },
  { labelKey: 'italy.phase.final',    field: 'reachFinalProb'   as const, color: 'var(--amber)',        emoji: '⭐' },
  { labelKey: 'italy.phase.champion', field: 'winProb'          as const, color: '#fbbf24',             emoji: '🏆' },
];

function StatRow({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="itc-stat-row">
      <span className="itc-stat-label">{label}</span>
      <span className="itc-stat-value" style={color ? { color } : undefined}>{value}</span>
      {sub && <span className="itc-stat-sub">{sub}</span>}
    </div>
  );
}

function BarRow({ label, pct, value, color }: { label: string; pct: number; value: string; color: string }) {
  return (
    <div className="itc-bar-row">
      <span className="itc-bar-label">{label}</span>
      <div className="itc-bar-track">
        <div className="itc-bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
      </div>
      <span className="itc-bar-value">{value}</span>
    </div>
  );
}

export function ItalyCard({ teams, params, teamStats, italyActive, aggregates, numRuns, onActivate }: Props) {
  const { t, tList, nf } = useT();
  const loadingMessages = tList('italy.loadingMessages');
  const MSG_INTERVAL = LOADING_DURATION / Math.max(1, loadingMessages.length);
  const [loading, setLoading] = useState(false);
  const [msgIdx, setMsgIdx] = useState(0);

  function handleActivate() {
    setLoading(true);
    setMsgIdx(0);
    onActivate();
    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i < loadingMessages.length) {
        setMsgIdx(i);
      } else {
        clearInterval(interval);
      }
    }, MSG_INTERVAL);
    setTimeout(() => {
      setLoading(false);
    }, LOADING_DURATION);
  }

  const italy = teams.find((tm) => tm.id === ITALY_ID);
  if (!italy) return <p className="muted">{t('italy.unavailable')}</p>;

  if (loading) {
    return (
      <div className="itc-loading">
        <span className="fi fi-it itc-loading-flag" aria-hidden />
        <div className="itc-loading-spinner" />
        <p className="itc-loading-msg">{loadingMessages[msgIdx] ?? ''}</p>
        <div className="itc-loading-dots"><span /><span /><span /></div>
      </div>
    );
  }

  const tp = params?.teams[ITALY_ID];
  const ts = teamStats.get(ITALY_ID);
  const agg = italyActive ? aggregates?.find((a) => a.teamId === ITALY_ID) : undefined;

  const winPct = agg?.winProb !== undefined ? Math.round(agg.winProb * 100) : undefined;
  const quote = italyActive && winPct !== undefined
    ? (winPct >= 10
      ? t('italy.quote.high', { pct: String(winPct) })
      : t('italy.quote.low', { pct: String(winPct) }))
    : '';

  const worldCup = ts?.knockout.byTournament.find(t => t.label.includes('Mondiali'));
  const euros    = ts?.knockout.byTournament.find(t => t.label.includes('Euro'));
  const histWC   = ts?.history.byTournament.find(t => t.label.includes('Mondiali'));

  return (
    <div className="itc-root">

      {/* ── Header identità ── */}
      <div className="itc-header">
        <span className="fi fi-it itc-flag" aria-hidden />
        <div className="itc-header-text">
          <h2 className="itc-name">{t('italy.name')}</h2>
          <p className="itc-tagline">
            {italyActive ? t('italy.tagline.active') : t('italy.tagline.inactive')}
          </p>
        </div>
        <div className="itc-header-elo">
          <span className="itc-elo-num">{italy.elo}</span>
          <span className="itc-elo-label">Elo</span>
        </div>
      </div>

      {/* ── Risultati simulazione (solo se attiva) — in evidenza prima della griglia ── */}
      {italyActive && agg && numRuns && (
        <div className="itc-sim-hero">
          <div className="itc-sim-hero-header">
            <span className="itc-sim-hero-title">{t('italy.sim.title')}</span>
            <span className="itc-sim-badge">{t('italy.sim.badge', { n: nf(numRuns) })}</span>
          </div>

          {/* Stat chiave: Campione + Finale in grande */}
          <div className="itc-sim-hero-stats">
            <div className="itc-sim-hero-stat">
              <span className="itc-sim-hero-val" style={{ color: '#fbbf24' }}>{pctSmart(agg.winProb)}</span>
              <span className="itc-sim-hero-label">{t('italy.label.champion')}</span>
              <span className="itc-sim-hero-odds">@{oddsFromProb(agg.winProb)}</span>
            </div>
            <div className="itc-sim-hero-divider" />
            <div className="itc-sim-hero-stat">
              <span className="itc-sim-hero-val" style={{ color: 'var(--amber)' }}>{pctSmart(agg.reachFinalProb)}</span>
              <span className="itc-sim-hero-label">{t('italy.label.final')}</span>
              <span className="itc-sim-hero-odds">@{oddsFromProb(agg.reachFinalProb)}</span>
            </div>
            <div className="itc-sim-hero-divider" />
            <div className="itc-sim-hero-stat">
              <span className="itc-sim-hero-val" style={{ color: 'var(--green-bright)' }}>{pctSmart(agg.reachSemiProb)}</span>
              <span className="itc-sim-hero-label">{t('italy.label.semi')}</span>
              <span className="itc-sim-hero-odds">@{oddsFromProb(agg.reachSemiProb)}</span>
            </div>
          </div>

          {/* Frase ironica */}
          {quote && (
            <div className="itc-sim-hero-quote">
              <span className="itc-quote-mark">"</span>
              <p className="itc-quote-text">{quote}</p>
            </div>
          )}

          {/* Percorso completo */}
          <div className="itc-phases">
            {PHASES.map((p) => {
              const prob = agg[p.field] as number;
              return (
                <div key={p.labelKey} className="itc-phase-row">
                  <span className="itc-phase-label">{t(p.labelKey)}</span>
                  <div className="itc-phase-track">
                    <div className="itc-phase-fill" style={{ width: `${prob * 100}%`, background: p.color }} />
                  </div>
                  <span className="itc-phase-pct" style={{ color: p.color }}>{pctSmart(prob)}</span>
                  <span className="itc-phase-odds">@{oddsFromProb(prob)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Citazione ironica quando l'Italia NON è attiva */}
      {!italyActive && quote && (
        <div className="itc-quote">
          <span className="itc-quote-mark">"</span>
          <p className="itc-quote-text">{quote}</p>
        </div>
      )}

      {/* ── Griglia dati ── */}
      <div className="itc-grid">

        {/* Blocco 1: Parametri modello */}
        <div className="itc-block">
          <div className="itc-block-title">{t('italy.block.modelParams')}</div>
          <div className="itc-bars">
            <BarRow label={t('italy.bar.elo')} pct={((italy.elo - 1400) / 800) * 100} value={String(italy.elo)} color="var(--green)" />
            <BarRow label={t('italy.bar.squadValue')} pct={((italy.squadValue ?? 0) / 1500) * 100} value={`€${italy.squadValue ?? 0}M`} color="var(--cyan)" />
            {tp && <BarRow label={t('italy.bar.attack')} pct={((tp.attack + 0.6) / 1.8) * 100} value={tp.attack.toFixed(2)} color="var(--green-bright)" />}
            {tp && <BarRow label={t('italy.bar.defense')} pct={((tp.defense + 0.6) / 1.8) * 100} value={tp.defense.toFixed(2)} color="var(--cyan-bright)" />}
          </div>
        </div>

        {/* Blocco 2: Forma e score */}
        <div className="itc-block">
          <div className="itc-block-title">{t('italy.block.formAndIndices')}</div>
          <div className="itc-bars">
            {ts && <BarRow label={t('italy.bar.form')} pct={ts.form.score} value={`${Math.round(ts.form.score)}/100`} color="var(--amber)" />}
            {ts && <BarRow label={t('italy.bar.koExp')} pct={ts.knockout.score} value={`${Math.round(ts.knockout.score)}/100`} color="var(--violet)" />}
            {ts && <BarRow label={t('italy.bar.history')} pct={ts.history.score} value={`${Math.round(ts.history.score)}/100`} color="var(--pink)" />}
          </div>
          {ts && (
            <div className="itc-form-record">
              <span>{t('italy.formRecord.last', { n: String(ts.form.n) })}</span>
              <span className="itc-form-w">{ts.form.w}{t('common.winLetter')}</span>
              <span className="itc-form-d">{ts.form.d}{t('common.drawLetter')}</span>
              <span className="itc-form-l">{ts.form.l}{t('common.lossLetter')}</span>
            </div>
          )}
        </div>

        {/* Blocco 3: Palmarès Mondiali */}
        <div className="itc-block">
          <div className="itc-block-title">{t('italy.block.worldCup')}</div>
          <div className="itc-stats-col">
            <StatRow label={t('italy.stat.titles')} value={histWC ? String(histWC.titles) : '4'} color="var(--amber)" />
            <StatRow label={t('italy.stat.finals')} value={histWC ? String(histWC.finals) : '6'} />
            {worldCup && <>
              <StatRow label={t('italy.stat.koMatches')} value={`${worldCup.w + worldCup.d + worldCup.l}`} />
              <StatRow label={t('italy.stat.koRecord')} value={`${worldCup.w}${t('common.winLetter')} ${worldCup.d}${t('common.drawLetter')} ${worldCup.l}${t('common.lossLetter')}`} />
              <StatRow label={t('italy.stat.koScore')} value={`${Math.round(worldCup.score)}/100`} color="var(--violet)" />
            </>}
          </div>
        </div>

        {/* Blocco 4: Palmarès Europei */}
        <div className="itc-block">
          <div className="itc-block-title">{t('italy.block.euros')}</div>
          <div className="itc-stats-col">
            {ts && (() => {
              const histEU = ts.history.byTournament.find(tm => tm.label.includes('Euro'));
              return <>
                <StatRow label={t('italy.stat.titles')} value={histEU ? String(histEU.titles) : '2'} color="var(--amber)" />
                <StatRow label={t('italy.stat.finals')} value={histEU ? String(histEU.finals) : '3'} />
              </>;
            })()}
            {euros && <>
              <StatRow label={t('italy.stat.koMatches')} value={`${euros.w + euros.d + euros.l}`} />
              <StatRow label={t('italy.stat.koRecord')} value={`${euros.w}${t('common.winLetter')} ${euros.d}${t('common.drawLetter')} ${euros.l}${t('common.lossLetter')}`} />
              <StatRow label={t('italy.stat.koScore')} value={`${Math.round(euros.score)}/100`} color="var(--violet)" />
            </>}
          </div>
        </div>

      </div>

      {/* ── CTA quando Italia non attiva ── */}
      {!italyActive && (
        <div className="itc-tournament-block">
          <div className="itc-cta">
            <div className="itc-cta-text">
              <span className="fi fi-it itc-cta-flag" aria-hidden />
              <div>
                <strong>{t('italy.cta.title')}</strong>
                <p>{t('italy.cta.body')}</p>
              </div>
            </div>
            <button className="itc-cta-btn" onClick={handleActivate}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              {t('italy.cta.btn')}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
