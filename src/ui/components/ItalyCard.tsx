/**
 * ItalyCard — pagina Focus Italia. Niente hero foto.
 * Layout: header identità + griglia dati + percorso torneo (o CTA simula).
 */
import { useState } from 'react';
import type { Team, ModelParams, TeamStats, TeamAggregate } from '../../engine/types';
import { pctSmart, oddsFromProb } from '../odds';

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

const LOADING_MESSAGES = [
  "Sto chiedendo alla Bosnia se ci fa il favore di farci giocare al posto loro…",
  "Convinco il sorteggio FIFA che era solo un errore di stampa…",
  "Spiego alla UEFA che tre play-off persi sono una fase di costruzione…",
  "Preparo le scuse del ct per quando usciremo ai gironi nella realtà…",
  "Ok, la Bosnia ha accettato. In bocca al lupo, Italia.",
];
const LOADING_DURATION = 12000; // ms totali
const MSG_INTERVAL = LOADING_DURATION / LOADING_MESSAGES.length;

function getIronicQuote(italyActive: boolean, winProb?: number): string {
  if (!italyActive) return '';
  if (winProb === undefined) return '';

  const winPct = Math.round(winProb * 100);

  if (winPct >= 10) {
    return `${winPct}% di vincere. Quattro stelle sul petto, zero presenze negli ultimi due Mondiali. Il modello ha la memoria corta — fortuna nostra.`;
  }
  return `Avremmo avuto il ${winPct}% di vincere. A quanto pare il problema non era solo qualificarsi.`;
}

const PHASES = [
  { label: 'Fase a gironi',  field: 'reachRo32Prob'    as const, color: 'var(--cyan)',         emoji: '🏟️' },
  { label: 'Sedicesimi',     field: 'reachRo32Prob'    as const, color: 'var(--cyan-bright)',   emoji: '⚡' },
  { label: 'Ottavi',         field: 'reachRo16Prob'    as const, color: '#60a5fa',              emoji: '🔵' },
  { label: 'Quarti',         field: 'reachQuarterProb' as const, color: 'var(--green)',         emoji: '🟢' },
  { label: 'Semifinale',     field: 'reachSemiProb'    as const, color: 'var(--green-bright)',  emoji: '🔥' },
  { label: 'Finale',         field: 'reachFinalProb'   as const, color: 'var(--amber)',         emoji: '⭐' },
  { label: 'Campione',       field: 'winProb'          as const, color: '#fbbf24',              emoji: '🏆' },
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
  const [loading, setLoading] = useState(false);
  const [msgIdx, setMsgIdx] = useState(0);

  function handleActivate() {
    setLoading(true);
    setMsgIdx(0);
    onActivate(); // avvia subito la simulazione in parallelo
    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i < LOADING_MESSAGES.length) {
        setMsgIdx(i);
      } else {
        clearInterval(interval);
      }
    }, MSG_INTERVAL);
    setTimeout(() => {
      setLoading(false);
    }, LOADING_DURATION);
  }

  const italy = teams.find((t) => t.id === ITALY_ID);
  if (!italy) return <p className="muted">Dati Italia non disponibili.</p>;

  if (loading) {
    return (
      <div className="itc-loading">
        <span className="fi fi-it itc-loading-flag" aria-hidden />
        <div className="itc-loading-spinner" />
        <p className="itc-loading-msg">{LOADING_MESSAGES[msgIdx]}</p>
        <div className="itc-loading-dots"><span /><span /><span /></div>
      </div>
    );
  }

  const tp = params?.teams[ITALY_ID];
  const ts = teamStats.get(ITALY_ID);
  const agg = italyActive ? aggregates?.find((a) => a.teamId === ITALY_ID) : undefined;

  // Storico tornei dall'oggetto knockout
  const quote = getIronicQuote(italyActive, agg?.winProb);

  const worldCup = ts?.knockout.byTournament.find(t => t.label.includes('Mondiali'));
  const euros    = ts?.knockout.byTournament.find(t => t.label.includes('Euro'));
  const histWC   = ts?.history.byTournament.find(t => t.label.includes('Mondiali'));

  return (
    <div className="itc-root">

      {/* ── Header identità ── */}
      <div className="itc-header">
        <span className="fi fi-it itc-flag" aria-hidden />
        <div className="itc-header-text">
          <h2 className="itc-name">Italia</h2>
          <p className="itc-tagline">
            {italyActive
              ? <>Girone B — scenario what-if attivo</>
              : <>Non qualificata ai Mondiali 2026 — <strong>scenario what-if</strong></>}
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
            <span className="itc-sim-hero-title">🇮🇹 Risultati simulazione</span>
            <span className="itc-sim-badge">su {numRuns.toLocaleString('it-IT')} simulazioni</span>
          </div>

          {/* Stat chiave: Campione + Finale in grande */}
          <div className="itc-sim-hero-stats">
            <div className="itc-sim-hero-stat">
              <span className="itc-sim-hero-val" style={{ color: '#fbbf24' }}>{pctSmart(agg.winProb)}</span>
              <span className="itc-sim-hero-label">🏆 Campione</span>
              <span className="itc-sim-hero-odds">@{oddsFromProb(agg.winProb)}</span>
            </div>
            <div className="itc-sim-hero-divider" />
            <div className="itc-sim-hero-stat">
              <span className="itc-sim-hero-val" style={{ color: 'var(--amber)' }}>{pctSmart(agg.reachFinalProb)}</span>
              <span className="itc-sim-hero-label">⭐ Finale</span>
              <span className="itc-sim-hero-odds">@{oddsFromProb(agg.reachFinalProb)}</span>
            </div>
            <div className="itc-sim-hero-divider" />
            <div className="itc-sim-hero-stat">
              <span className="itc-sim-hero-val" style={{ color: 'var(--green-bright)' }}>{pctSmart(agg.reachSemiProb)}</span>
              <span className="itc-sim-hero-label">🔥 Semifinale</span>
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
                <div key={p.label} className="itc-phase-row">
                  <span className="itc-phase-label">{p.label}</span>
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
          <div className="itc-block-title">Parametri del modello</div>
          <div className="itc-bars">
            <BarRow label="Elo" pct={((italy.elo - 1400) / 800) * 100} value={String(italy.elo)} color="var(--green)" />
            <BarRow label="Valore rosa" pct={((italy.squadValue ?? 0) / 1500) * 100} value={`€${italy.squadValue ?? 0}M`} color="var(--cyan)" />
            {tp && <BarRow label="Attacco" pct={((tp.attack + 0.6) / 1.8) * 100} value={tp.attack.toFixed(2)} color="var(--green-bright)" />}
            {tp && <BarRow label="Difesa" pct={((tp.defense + 0.6) / 1.8) * 100} value={tp.defense.toFixed(2)} color="var(--cyan-bright)" />}
          </div>
        </div>

        {/* Blocco 2: Forma e score */}
        <div className="itc-block">
          <div className="itc-block-title">Forma e indici</div>
          <div className="itc-bars">
            {ts && <BarRow label="Forma recente" pct={ts.form.score} value={`${Math.round(ts.form.score)}/100`} color="var(--amber)" />}
            {ts && <BarRow label="Esperienza KO" pct={ts.knockout.score} value={`${Math.round(ts.knockout.score)}/100`} color="var(--violet)" />}
            {ts && <BarRow label="Storia" pct={ts.history.score} value={`${Math.round(ts.history.score)}/100`} color="var(--pink)" />}
          </div>
          {ts && (
            <div className="itc-form-record">
              <span>Ultime {ts.form.n} partite:</span>
              <span className="itc-form-w">{ts.form.w}V</span>
              <span className="itc-form-d">{ts.form.d}P</span>
              <span className="itc-form-l">{ts.form.l}S</span>
            </div>
          )}
        </div>

        {/* Blocco 3: Palmarès Mondiali */}
        <div className="itc-block">
          <div className="itc-block-title">Palmarès Mondiali FIFA</div>
          <div className="itc-stats-col">
            <StatRow label="Titoli" value={histWC ? String(histWC.titles) : '4'} color="var(--amber)" />
            <StatRow label="Finali raggiunte" value={histWC ? String(histWC.finals) : '6'} />
            {worldCup && <>
              <StatRow label="Partite KO" value={`${worldCup.w + worldCup.d + worldCup.l}`} />
              <StatRow label="Record KO" value={`${worldCup.w}V ${worldCup.d}P ${worldCup.l}S`} />
              <StatRow label="Score KO" value={`${Math.round(worldCup.score)}/100`} color="var(--violet)" />
            </>}
          </div>
        </div>

        {/* Blocco 4: Palmarès Europei */}
        <div className="itc-block">
          <div className="itc-block-title">Europei UEFA</div>
          <div className="itc-stats-col">
            {ts && (() => {
              const histEU = ts.history.byTournament.find(t => t.label.includes('Euro'));
              return <>
                <StatRow label="Titoli" value={histEU ? String(histEU.titles) : '2'} color="var(--amber)" />
                <StatRow label="Finali raggiunte" value={histEU ? String(histEU.finals) : '3'} />
              </>;
            })()}
            {euros && <>
              <StatRow label="Partite KO" value={`${euros.w + euros.d + euros.l}`} />
              <StatRow label="Record KO" value={`${euros.w}V ${euros.d}P ${euros.l}S`} />
              <StatRow label="Score KO" value={`${Math.round(euros.score)}/100`} color="var(--violet)" />
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
                <strong>Tre qualificazioni mondiali mancate di fila.</strong>
                <p>A questo punto ci siamo presi una piccola libertà: cambiare la storia. Simula il torneo e scopri cosa sarebbe successo con l'Italia in campo.</p>
              </div>
            </div>
            <button className="itc-cta-btn" onClick={handleActivate}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Inserisci l'Italia e simula
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
