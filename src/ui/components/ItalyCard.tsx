/**
 * ItalyCard — Italy focus page. No hero photo.
 * Layout: identity header + data grid + tournament run (or simulate CTA).
 */
import { useState, useRef, useEffect } from 'react';
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
  heroImage?: string; // unused — kept for prop compatibility
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
  // Loading timers: kept in refs so they can be cancelled on unmount (avoids
  // setState on an unmounted component if the user closes the card mid-load).
  const loadTimers = useRef<{ interval: number; timeout: number }>({ interval: 0, timeout: 0 });
  useEffect(() => () => {
    if (loadTimers.current.interval) clearInterval(loadTimers.current.interval);
    if (loadTimers.current.timeout) clearTimeout(loadTimers.current.timeout);
  }, []);

  function handleActivate() {
    setLoading(true);
    setMsgIdx(0);
    onActivate();
    let i = 0;
    loadTimers.current.interval = window.setInterval(() => {
      i++;
      if (i < loadingMessages.length) {
        setMsgIdx(i);
      } else {
        clearInterval(loadTimers.current.interval);
      }
    }, MSG_INTERVAL);
    loadTimers.current.timeout = window.setTimeout(() => {
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

      {/* ── Identity header ── */}
      <div className="itc-header">
        <div className="itc-header-top">
          <span className="fi fi-it itc-flag" aria-hidden />
          <div className="itc-header-text">
            <h2 className="itc-name">{t('italy.name')}</h2>
          </div>
          <div className="itc-header-elo">
            <span className="itc-elo-num">{italy.elo}</span>
            <span className="itc-elo-label">Elo</span>
          </div>
        </div>
        <p className="itc-tagline">
          {italyActive
            ? t('italy.tagline.active')
            : t('italy.tagline.inactive').split('·').map((part, i, arr) =>
                i < arr.length - 1
                  ? <span key={i}>{part.trim()}<br />· </span>
                  : <span key={i}>{part.trim()}</span>
              )
          }
        </p>
      </div>

      {/* ── Simulation results (only if active) — highlighted before the grid ── */}
      {italyActive && agg && numRuns && (
        <div className="itc-sim-hero">
          <div className="itc-sim-hero-header">
            <span className="itc-sim-hero-title">{t('italy.sim.title')}</span>
            <span className="itc-sim-badge">{t('italy.sim.badge', { n: nf(numRuns) })}</span>
          </div>

          {/* Key stats: Champion + Final, large */}
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

          {/* Tongue-in-cheek line */}
          {quote && (
            <div className="itc-sim-hero-quote">
              <span className="itc-quote-mark">"</span>
              <p className="itc-quote-text">{quote}</p>
            </div>
          )}

          {/* Full run */}
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

      {/* ── CTA when Italy is inactive — at the top, right after the header ── */}
      {!italyActive && (
        <div className="itc-tournament-block">
          <div className="itc-cta">
            <p className="itc-cta-body">{t('italy.cta.body')}</p>
            <button className="itc-cta-btn" onClick={handleActivate}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              {t('italy.cta.btn')}
            </button>
          </div>
        </div>
      )}

      {/* Tongue-in-cheek quote when Italy is NOT active */}
      {!italyActive && quote && (
        <div className="itc-quote">
          <span className="itc-quote-mark">"</span>
          <p className="itc-quote-text">{quote}</p>
        </div>
      )}

      {/* ── Data grid ── */}
      <div className="itc-grid">

        {/* Block 1: Model parameters */}
        <div className="itc-block">
          <div className="itc-block-title">{t('italy.block.modelParams')}</div>
          <div className="itc-bars">
            <BarRow label={t('italy.bar.elo')} pct={((italy.elo - 1400) / 800) * 100} value={String(italy.elo)} color="var(--green)" />
            <BarRow label={t('italy.bar.squadValue')} pct={((italy.squadValue ?? 0) / 1500) * 100} value={`€${italy.squadValue ?? 0}M`} color="var(--cyan)" />
            {tp && <BarRow label={t('italy.bar.attack')} pct={((tp.attack + 0.6) / 1.8) * 100} value={tp.attack.toFixed(2)} color="var(--green-bright)" />}
            {tp && <BarRow label={t('italy.bar.defense')} pct={((tp.defense + 0.6) / 1.8) * 100} value={tp.defense.toFixed(2)} color="var(--cyan-bright)" />}
          </div>
        </div>

        {/* Block 2: Form and scores */}
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

        {/* Block 3: World Cup honours */}
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

        {/* Block 4: European Championship honours */}
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

    </div>
  );
}
