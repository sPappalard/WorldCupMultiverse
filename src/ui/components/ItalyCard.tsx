/**
 * ItalyCard — pagina Focus Italia. Niente hero foto.
 * Layout: header identità + griglia dati + percorso torneo (o CTA simula).
 */
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

function getIronicQuote(italyActive: boolean, winProb?: number, semiProb?: number): string {
  if (!italyActive) {
    return "Tranquilli, non ci perdiamo nulla. Tre qualificazioni mondiali consecutive mancate — a questo punto è una scelta di vita. Noi però l'abbiamo rimessa dentro lo stesso. Di forza.";
  }
  if (winProb === undefined) return '';

  const winPct = Math.round(winProb * 100);
  const semiPct = Math.round((semiProb ?? 0) * 100);

  if (winPct >= 20) {
    return `${winPct}% di vincere il Mondiale. Nella simulazione l'Italia è una delle favorite. Nella realtà non si è qualificata per la terza volta di fila. Fate voi.`;
  }
  if (winPct >= 10) {
    return `${winPct}% di vincere. Quattro Coppe del Mondo in bacheca, tre qualificazioni di fila saltate. Il modello dice che ce la faremmo — peccato che nessuno abbia avvisato la Federazione.`;
  }
  if (winPct >= 5) {
    return `${winPct}% di vincere, ${semiPct}% di arrivare in semifinale. Non malissimo, per una squadra che di solito guarda i Mondiali in televisione. Almeno qui ci siamo tolti lo sfizio.`;
  }
  if (winPct >= 2) {
    return `${winPct}% di vincere il Mondiale. Il modello non è crudele — è onesto. L'Italia è competitiva, non favorita. Esattamente come si sentivano i tifosi prima delle ultime tre eliminazioni alle qualificazioni.`;
  }
  return `${winPct}% di vincere. Sì, è poco. Ma è comunque più delle probabilità che aveva di qualificarsi nella realtà — dove ha fatto ${winPct === 0 ? 'zero' : 'quasi zero'}. Almeno qui siamo in campo.`;
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
  const italy = teams.find((t) => t.id === ITALY_ID);
  if (!italy) return <p className="muted">Dati Italia non disponibili.</p>;

  const tp = params?.teams[ITALY_ID];
  const ts = teamStats.get(ITALY_ID);
  const agg = italyActive ? aggregates?.find((a) => a.teamId === ITALY_ID) : undefined;

  // Storico tornei dall'oggetto knockout
  const quote = getIronicQuote(italyActive, agg?.winProb, agg?.reachSemiProb);

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

      {/* ── Citazione ironica ── */}
      {quote && (
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

      {/* ── Percorso nel torneo ── */}
      <div className="itc-tournament-block">
        <div className="itc-block-title">
          Percorso nel torneo
          {italyActive && agg && numRuns && (
            <span className="itc-sim-badge">su {numRuns.toLocaleString('it-IT')} simulazioni</span>
          )}
        </div>

        {italyActive && agg && numRuns ? (
          <div className="itc-phases">
            {PHASES.map((p) => {
              const prob = agg[p.field] as number;
              const pctVal = prob * 100;
              return (
                <div key={p.label} className="itc-phase-row">
                  <span className="itc-phase-label">{p.label}</span>
                  <div className="itc-phase-track">
                    <div className="itc-phase-fill" style={{ width: `${pctVal}%`, background: p.color }} />
                  </div>
                  <span className="itc-phase-pct" style={{ color: p.color }}>{pctSmart(prob)}</span>
                  <span className="itc-phase-odds">@{oddsFromProb(prob)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="itc-cta">
            <div className="itc-cta-text">
              <span className="fi fi-it itc-cta-flag" aria-hidden />
              <div>
                <strong>L'Italia non è in questa simulazione.</strong>
                <p>Attivala per scoprire fin dove può arrivare nel Girone B — le probabilità vengono calcolate su 100.000 tornei completi.</p>
              </div>
            </div>
            <button className="itc-cta-btn" onClick={onActivate}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Attiva l'Italia e simula
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
