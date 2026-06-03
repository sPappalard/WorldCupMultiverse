/**
 * TournamentCinema — regia cinematografica di UNA simulazione.
 *
 * Flusso: kickoff → groups (per girone, completo) → overlay terze (sopra i gironi)
 *         → ko R32 → ko R16 → ko QF → ko SF → ko Final → champion
 *
 * Bracket: R32 mostra bandiera+nome, ottavi solo bandiera grande, quarti+
 * bandiera grande + nome piccolo. I vincitori appaiono nel round successivo
 * SOLO dopo il reveal del risultato.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SampleRun, Team, MatchResult } from '../../engine/types';
import { cinemaAudio } from '../cinemaAudio';
import { buildBracketLayout, CARD_W, CARD_H, type PlacedMatch } from '../bracketLayout';

interface Props {
  sample: SampleRun;
  teamsById: Map<string, Team>;
  favoriteTeam?: string | null;
  italyActive: boolean;
  onDone: () => void;
  /** Salta tutto il flusso guidato e va alla dashboard (opzionale). */
  onSkip?: () => void;
}

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

interface Stop { key: string; label: string; date: string; }

// Timeline: 7 stop (terze non è più step separato, è overlay dentro i gironi)
const TIMELINE: Stop[] = [
  { key: 'kickoff', label: "Calcio d'inizio", date: '11 GIU' },
  { key: 'groups',  label: 'Gironi',          date: '11–27 GIU' },
  { key: 'r32',     label: 'Sedicesimi',       date: '28 GIU' },
  { key: 'r16',     label: 'Ottavi',           date: '4 LUG' },
  { key: 'qf',      label: 'Quarti',           date: '9 LUG' },
  { key: 'sf',      label: 'Semifinali',       date: '14 LUG' },
  { key: 'final',   label: 'Finale',           date: '19 LUG' },
];

const ROUND_LABEL: Record<string, string> = {
  'Round of 32': 'Sedicesimi', 'Round of 16': 'Ottavi',
  'Quarter-finals': 'Quarti', 'Semi-finals': 'Semifinali',
  Semifinali: 'Semifinali', Final: 'Finale', Finale: 'Finale',
};

// Geometria bracket condivisa con la dashboard (src/ui/bracketLayout.ts).

// ── Durate base (ms) ─────────────────────────────────────────────────────────
const BASE = {
  kickoff:      2800,
  groupStagger: 480,    // tra un risultato e il successivo (stesso girone)
  groupBetween: 900,    // pausa tra un girone finito e il successivo
  groupTail:    800,    // pausa dopo l'ultimo girone prima dell'overlay terze
  thirdsReveal: 550,
  thirdsTail:   2400,
  koAppear:     1200,
  koResult:     820,
  koRoundTail:  1000,
  championHold: 600,
};

export function TournamentCinema({ sample, teamsById, favoriteTeam, italyActive, onDone, onSkip }: Props) {
  const rounds = sample.knockoutRounds;
  const [speed,   setSpeed]   = useState(1);
  const [leaving, setLeaving] = useState(false);

  // Stato regia
  const [stage, setStage] = useState<'kickoff' | 'groups' | 'ko' | 'champion'>('kickoff');
  // groups: indice girone attivo (0-11), risultati svelati in quel girone
  const [activeGroup,    setActiveGroup]    = useState(0);
  const [groupRevealed,  setGroupRevealed]  = useState(0); // partite svelate nel girone attivo
  // overlay terze: 'hidden'=non ancora mostrato, 'showing'=in corso, 'done'=completato
  const [thirdsState,    setThirdsState]    = useState<'hidden' | 'showing' | 'done'>('hidden');
  const [thirdsRevealed, setThirdsRevealed] = useState(0);
  // KO
  const [koRound,   setKoRound]   = useState(0);
  const [koPhase,   setKoPhase]   = useState<'appear' | 'results'>('appear');
  const [koRevealed, setKoRevealed] = useState(0);
  const [paused,  setPaused]  = useState(false);
  const [muted,   setMuted]   = useState(false);

  const speedRef  = useRef(speed);  speedRef.current  = speed;
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const timers    = useRef<number[]>([]);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const after = (ms: number, fn: () => void) => {
    if (pausedRef.current) return;
    const id = window.setTimeout(fn, ms / speedRef.current);
    timers.current.push(id);
  };

  useEffect(() => { cinemaAudio.setMuted(muted); }, [muted]);
  useEffect(() => () => { cinemaAudio.setTension(0); }, []);

  const name  = (id: string) => teamsById.get(id)?.name ?? id;
  const flag  = (id: string) => teamsById.get(id)?.flag ?? '';
  const isFav = (id: string) => id === favoriteTeam;

  // ── Struttura per girone: lista match ordinata per girone
  const groupMatches = useMemo(() => {
    const result: Record<string, MatchResult[]> = {};
    for (const g of GROUPS) result[g] = sample.groupResults[g] ?? [];
    return result;
  }, [sample]);

  // ── Terze ─────────────────────────────────────────────────────────────────
  const thirds = useMemo(() => {
    const r32Teams = new Set<string>();
    for (const m of rounds[0]?.matches ?? []) { r32Teams.add(m.homeId); r32Teams.add(m.awayId); }
    const list = GROUPS.map((g) => {
      const s = sample.groupStandings[g]?.[2];
      return s ? { group: g, ...s } : null;
    }).filter(Boolean) as { group: string; teamId: string; points: number; goalDifference: number; goalsFor: number }[];
    list.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
    return list.map((t) => ({ ...t, qualified: r32Teams.has(t.teamId) }));
  }, [sample, rounds]);

  // ── Layout bracket ────────────────────────────────────────────────────────
  const layout = useMemo(() => buildBracketLayout(rounds), [rounds]);

  const tensionForRound = (r: number): 0 | 1 | 2 | 3 | 4 => {
    const fromEnd = rounds.length - 1 - r;
    if (fromEnd === 0) return 4;
    if (fromEnd === 1) return 3;
    if (fromEnd === 2) return 2;
    return 1;
  };

  const koTotal = rounds[koRound]?.matches.length ?? 0;
  const currentGroupKey = GROUPS[activeGroup] ?? 'A';
  const currentGroupMatches = groupMatches[currentGroupKey] ?? [];

  // ── Macchina a stati ──────────────────────────────────────────────────────
  useEffect(() => {
    clearTimers();
    if (paused) return;

    if (stage === 'kickoff') {
      after(BASE.kickoff, () => { setStage('groups'); setActiveGroup(0); setGroupRevealed(0); });

    } else if (stage === 'groups' && thirdsState === 'hidden') {
      cinemaAudio.setTension(0);
      const total = currentGroupMatches.length;
      if (groupRevealed < total) {
        after(BASE.groupStagger, () => setGroupRevealed((n) => n + 1));
      } else if (activeGroup < GROUPS.length - 1) {
        after(BASE.groupBetween, () => { setActiveGroup((g) => g + 1); setGroupRevealed(0); });
      } else {
        // Tutti i gironi finiti → apri overlay terze
        after(BASE.groupTail, () => { setThirdsState('showing'); setThirdsRevealed(0); });
      }

    } else if (stage === 'groups' && thirdsState === 'showing') {
      if (thirdsRevealed < thirds.length) {
        after(BASE.thirdsReveal, () => setThirdsRevealed((n) => n + 1));
      } else {
        // Overlay completato: chiudi, mostra gironi con terze in verde per 3s, poi KO.
        // Il secondo timer è un window.setTimeout diretto (non passa per after/clearTimers)
        // così non viene annullato quando thirdsState cambia a 'done'.
        after(BASE.thirdsTail, () => {
          cinemaAudio.advance();
          setThirdsState('done');
          window.setTimeout(() => {
            setStage('ko'); setKoRound(0); setKoPhase('appear'); setKoRevealed(0);
          }, 3000 / speedRef.current);
        });
      }

    } else if (stage === 'groups' && thirdsState === 'done') {
      // In attesa del timer diretto sopra — non fare nulla qui.

    } else if (stage === 'ko') {
      cinemaAudio.setTension(tensionForRound(koRound));
      if (koPhase === 'appear') {
        after(BASE.koAppear, () => setKoPhase('results'));
      } else if (koRevealed < koTotal) {
        after(BASE.koResult, () => setKoRevealed((n) => n + 1));
      } else if (koRound < rounds.length - 1) {
        after(BASE.koRoundTail, () => { setKoRound((r) => r + 1); setKoPhase('appear'); setKoRevealed(0); });
      } else {
        after(BASE.championHold, () => setStage('champion'));
      }
    }

    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, activeGroup, groupRevealed, thirdsState, thirdsRevealed, koRound, koPhase, koRevealed, koTotal, speed, paused]);

  // ── Suoni ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (stage === 'kickoff') cinemaAudio.kickoff();
    if (stage === 'champion') cinemaAudio.champion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useEffect(() => {
    if (stage === 'groups' && thirdsState === 'hidden' && groupRevealed > 0) cinemaAudio.groupTick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupRevealed]);

  useEffect(() => {
    if (thirdsState === 'showing' && thirdsRevealed > 0) {
      thirds[thirdsRevealed - 1]?.qualified ? cinemaAudio.advance() : cinemaAudio.groupTick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thirdsRevealed]);

  useEffect(() => {
    if (stage !== 'ko' || koPhase !== 'results' || koRevealed === 0) return;
    const t = tensionForRound(koRound);
    if (t >= 3) cinemaAudio.keyMatch(t);
    else cinemaAudio.advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [koRevealed, koPhase, koRound, stage]);

  useEffect(() => clearTimers, []);

  const finish = () => { cinemaAudio.setTension(0); setLeaving(true); window.setTimeout(onDone, 450); };
  const skip   = () => { clearTimers(); setStage('champion'); };

  // Indice stop nella timeline (7 stop: 0=kickoff,1=gironi,2+=KO per round)
  const stopIndex = useMemo(() => {
    if (stage === 'kickoff')  return 0;
    if (stage === 'groups')   return 1;
    if (stage === 'champion') return TIMELINE.length - 1;
    return 2 + koRound;  // KO: stop 2(R32)..5(Finale)
  }, [stage, koRound]);

  const goToStop = (idx: number) => {
    clearTimers();
    const c = Math.max(0, Math.min(TIMELINE.length - 1, idx));
    if (c === 0) {
      setStage('kickoff'); setThirdsState('hidden'); setThirdsRevealed(0);
    } else if (c === 1) {
      // Mostra tutti i gironi completi, nessun overlay
      setStage('groups');
      setActiveGroup(GROUPS.length - 1);
      setGroupRevealed(groupMatches[GROUPS[GROUPS.length - 1]]?.length ?? 0);
      setThirdsState('done'); setThirdsRevealed(thirds.length);
    } else if (c === TIMELINE.length - 1) {
      setStage('champion');
    } else {
      const r = c - 2;
      setStage('ko'); setThirdsState('done');
      setActiveGroup(GROUPS.length - 1);
      setGroupRevealed(groupMatches[GROUPS[GROUPS.length - 1]]?.length ?? 0);
      setKoRound(r); setKoPhase('results'); setKoRevealed(rounds[r]?.matches.length ?? 0);
      cinemaAudio.setTension(tensionForRound(r));
    }
    setPaused(true);
  };
  const prevStop = () => goToStop(stopIndex - 1);
  const nextStop = () => goToStop(stopIndex + 1);

  const championId = sample.championId;

  let title = '', sub = '';
  if (stage === 'groups' && thirdsState === 'hidden') {
    title = `Girone ${GROUPS[activeGroup] ?? ''}`;
    sub   = `${groupRevealed} / ${currentGroupMatches.length} partite`;
  } else if (stage === 'groups' && thirdsState === 'showing') {
    title = 'Migliori terze';
    sub   = `${Math.min(thirdsRevealed, thirds.length)} / ${thirds.length}`;
  } else if (stage === 'groups' && thirdsState === 'done') {
    title = 'Gironi completati';
    sub   = 'Le qualificate ai sedicesimi';
  } else if (stage === 'ko') {
    title = ROUND_LABEL[rounds[koRound]?.name] ?? rounds[koRound]?.name ?? '';
    sub   = koPhase === 'appear' ? 'Accoppiamenti'
          : koRevealed < koTotal ? `${koRevealed} / ${koTotal} risultati`
          : 'Round completato';
  } else if (stage === 'champion') {
    title = 'Campione del Mondo';
  }

  // I gironi svelati per la visualizzazione (quante partite di ogni girone sono note)
  const revealedByGroup = useMemo(() => {
    const m: Record<string, number> = {};
    for (const g of GROUPS) {
      const gIdx = GROUPS.indexOf(g);
      if (gIdx < activeGroup) {
        m[g] = groupMatches[g]?.length ?? 0; // girone completato
      } else if (gIdx === activeGroup) {
        m[g] = groupRevealed;
      } else {
        m[g] = 0;
      }
    }
    return m;
  }, [activeGroup, groupRevealed, groupMatches]);

  return (
    <div className={`cin ${leaving ? 'cin--leaving' : ''}`}>
      <div className="cin-stadium" aria-hidden />

      {/* ── TIMELINE ── */}
      <Timeline stopIndex={stopIndex} onStopClick={goToStop} />

      {/* ── TITLEBAR ── */}
      {stage !== 'kickoff' && (
        <div className="cin-titlebar">
          <h2 className="cin-title" key={title}>{title}</h2>
          {sub && <span className="cin-title-sub">{sub}</span>}
        </div>
      )}

      {/* ── STAGE ── */}
      <div className="cin-stage">
        {stage === 'kickoff' && (
          <div className="cin-scene cin-intro">
            <p className="cin-kicker">FIFA World Cup 2026 · 48 nazionali</p>
            <h1 className="cin-bigtitle">Il sorteggio è fatto.<br />Si gioca.</h1>
            <p className="cin-sub">
              Una simulazione possibile su {(100000).toLocaleString('it-IT')}.
              {italyActive && <> Con l&apos;Italia nel Girone B. <span className="fi fi-it" style={{display:'inline-block',width:18,height:13,borderRadius:2,verticalAlign:'middle',marginLeft:3}} /></>}
            </p>
          </div>
        )}

        {stage === 'groups' && (
          <div className="cin-scene cin-groups" style={{ position: 'relative', width: '100%' }}>
            <GroupsScene
              sample={sample}
              revealedByGroup={revealedByGroup}
              activeGroupKey={GROUPS[activeGroup] ?? ''}
              groupMatches={groupMatches}
              thirdsQualified={thirdsState === 'done' ? new Set(thirds.filter(t => t.qualified).map(t => t.teamId)) : undefined}
              name={name} flag={flag} isFav={isFav} italyActive={italyActive}
            />
            {thirdsState === 'showing' && (
              <div className="cin-thirds-overlay">
                <ThirdsModal
                  thirds={thirds} revealed={thirdsRevealed}
                  name={name} flag={flag} isFav={isFav} italyActive={italyActive}
                />
              </div>
            )}
          </div>
        )}

        {stage === 'ko' && (
          <BracketScene
            rounds={rounds} layout={layout} activeRound={koRound}
            phase={koPhase} revealed={koRevealed}
            name={name} flag={flag} isFav={isFav}
          />
        )}

        {stage === 'champion' && (
          <ChampionScene
            championId={championId} name={name} flag={flag} isFav={isFav}
            italyActive={italyActive} onClose={finish}
          />
        )}
      </div>

      {/* ── CONTROLLI ── */}
      <footer className="cin-controls">
        <div className="cin-ctrl-group">
          <button className="cin-ctrl-btn" onClick={prevStop} disabled={stopIndex === 0} title="Fase precedente">‹</button>
          {stage !== 'champion' ? (
            <button className="cin-ctrl-btn cin-ctrl-play" onClick={() => setPaused((p) => !p)} title={paused ? 'Riprendi' : 'Pausa'}>
              {paused ? '►' : '❚❚'}
            </button>
          ) : (
            <button className="cin-ctrl-btn cin-ctrl-play" onClick={() => goToStop(0)} title="Rivedi da capo">↺</button>
          )}
          <button className="cin-ctrl-btn" onClick={nextStop} disabled={stopIndex >= TIMELINE.length - 1} title="Fase successiva">›</button>
          <button className={`cin-ctrl-btn ${muted ? 'off' : ''}`} onClick={() => setMuted((m) => !m)} title={muted ? 'Riattiva audio' : 'Silenzia'}>
            {muted ? '🔇' : '🔊'}
          </button>
        </div>

        <div className="cin-speed">
          <span className="cin-speed-label">Velocità</span>
          {[1, 2, 3].map((s) => (
            <button key={s} className={`cin-speed-btn ${speed === s ? 'on' : ''}`} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>

        <div className="cin-skip-group">
          {stage !== 'champion' ? (
            <button className="cin-skip" onClick={skip}>Salta alla fine →</button>
          ) : (
            <button className="cin-skip" onClick={finish}>Vedi statistiche ✕</button>
          )}
          {onSkip && (
            <button className="cin-skip cin-skip--dash" onClick={onSkip}>Dashboard →</button>
          )}
        </div>
      </footer>
    </div>
  );
}

/* ───────────── TIMELINE ───────────── */
function Timeline({ stopIndex, onStopClick }: { stopIndex: number; onStopClick: (i: number) => void }) {
  const pct = (stopIndex / (TIMELINE.length - 1)) * 100;
  return (
    <div className="cin-tl">
      <div className="cin-tl-track">
        <div className="cin-tl-fill" style={{ width: `${pct}%` }} />
        <div className="cin-tl-cursor" style={{ left: `${pct}%` }} />
        {TIMELINE.map((s, i) => (
          <button
            key={s.key} type="button"
            className={`cin-tl-stop ${i === stopIndex ? 'active' : ''} ${i < stopIndex ? 'past' : ''}`}
            style={{ left: `${(i / (TIMELINE.length - 1)) * 100}%` }}
            onClick={() => onStopClick(i)} title={`Vai a: ${s.label}`}
          >
            <span className="cin-tl-label">{s.label}</span>
            <span className="cin-tl-date">{s.date}</span>
            <span className="cin-tl-dot" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────────── GIRONI ───────────── */
function GroupsScene({
  sample, revealedByGroup, activeGroupKey, groupMatches, thirdsQualified, name, flag, isFav, italyActive,
}: {
  sample: SampleRun;
  revealedByGroup: Record<string, number>;
  activeGroupKey: string;
  groupMatches: Record<string, MatchResult[]>;
  thirdsQualified?: Set<string>;
  name: (id: string) => string; flag: (id: string) => string;
  isFav: (id: string) => boolean; italyActive: boolean;
}) {
  // Classifica live: punti e GD calcolati sui match già svelati del girone
  const liveStanding = (g: string) => {
    const all   = groupMatches[g] ?? [];
    const shown = all.slice(0, revealedByGroup[g] ?? 0);
    const table = new Map<string, { pts: number; gd: number }>();
    for (const t of sample.groupStandings[g] ?? []) table.set(t.teamId, { pts: 0, gd: 0 });
    const ens = (id: string) => table.get(id) ?? { pts: 0, gd: 0 };
    for (const m of shown) {
      const h = ens(m.homeId), a = ens(m.awayId);
      h.gd += m.homeGoals - m.awayGoals; a.gd += m.awayGoals - m.homeGoals;
      if (m.homeGoals > m.awayGoals) h.pts += 3;
      else if (m.awayGoals > m.homeGoals) a.pts += 3;
      else { h.pts += 1; a.pts += 1; }
      table.set(m.homeId, h); table.set(m.awayId, a);
    }
    return [...table.entries()]
      .sort((x, y) => y[1].pts - x[1].pts || y[1].gd - x[1].gd)
      .map(([id, v]) => ({ id, ...v }));
  };

  return (
    <>
      <div className="cin-groups-grid">
      {GROUPS.map((g, gi) => {
        const standing   = liveStanding(g);
        const shownCount = revealedByGroup[g] ?? 0;
        const total      = groupMatches[g]?.length ?? 0;
        const isActive   = g === activeGroupKey;
        const complete   = shownCount === total && total > 0;
        return (
          <div
            className={`cin-group ${isActive ? 'playing' : ''}`}
            key={g}
            style={{ animationDelay: `${gi * 40}ms` }}
          >
            <div className="cin-group-head">
              <span className="cin-group-title">Girone {g}</span>
              {isActive
                ? <span className="cin-group-live">● LIVE</span>
                : <span className="cin-group-count">{shownCount}/{total}</span>}
            </div>
            <div className="cin-group-rows">
              {standing.map((s, idx) => (
                <div
                  key={s.id}
                  className={[
                    'cin-group-row',
                    (idx < 2 && complete) || (idx === 2 && complete && thirdsQualified?.has(s.id)) ? 'qualified' : '',
                    isFav(s.id) ? 'fav' : '',
                    italyActive && s.id === 'ITA' ? 'italy' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <span className="cin-gpos">{idx + 1}</span>
                  <span className={`fi fi-${flag(s.id)}`} aria-hidden />
                  <span className="cin-gname">{name(s.id)}</span>
                  <span className="cin-gpts">{s.pts}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      </div>
    </>
  );
}

/* ───────────── OVERLAY MIGLIORI TERZE ───────────── */
interface ThirdRow {
  group: string; teamId: string; points: number;
  goalDifference: number; goalsFor: number; qualified: boolean;
}
function ThirdsModal({
  thirds, revealed, name, flag, isFav, italyActive,
}: {
  thirds: ThirdRow[]; revealed: number;
  name: (id: string) => string; flag: (id: string) => string;
  isFav: (id: string) => boolean; italyActive: boolean;
}) {
  return (
    <div className="cin-thirds-modal">
      <p className="cin-thirds-modal-title">Calcolo migliori terze</p>
      <p className="cin-thirds-modal-sub">
        Passano le <strong>8 migliori</strong> su 12 (punti → differenza reti)
      </p>
      <div className="cin-thirds-list">
        {thirds.map((t, i) => {
          const shown   = i < revealed;
          const cutoff  = i === 8;
          return (
            <div key={t.teamId}>
              {cutoff && shown && <div className="cin-thirds-cut">— linea di taglio · sotto, eliminate —</div>}
              <div
                className={[
                  'cin-thirds-row',
                  shown ? 'shown' : 'hidden',
                  shown && t.qualified  ? 'ok'   : '',
                  shown && !t.qualified ? 'ko'   : '',
                  isFav(t.teamId) ? 'fav' : '',
                  italyActive && t.teamId === 'ITA' ? 'italy' : '',
                ].filter(Boolean).join(' ')}
              >
                <span className="cin-thirds-rank">{i + 1}</span>
                <span className={`fi fi-${flag(t.teamId)}`} aria-hidden />
                <span className="cin-thirds-name">{name(t.teamId)}</span>
                <span className="cin-thirds-grp">Gir. {t.group}</span>
                <span className="cin-thirds-stat">{t.points} pt</span>
                <span className="cin-thirds-stat dim">{t.goalDifference >= 0 ? '+' : ''}{t.goalDifference}</span>
                {shown && (
                  <span className={`cin-thirds-badge ${t.qualified ? 'ok' : 'ko'}`}>
                    {t.qualified ? '✓' : '✕'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────── BRACKET ───────────── */
function BracketScene({
  rounds, layout, activeRound, phase, revealed, name, flag, isFav,
}: {
  rounds: { name: string; matches: MatchResult[] }[];
  layout: ReturnType<typeof buildBracketLayout>;
  activeRound: number; phase: 'appear' | 'results'; revealed: number;
  name: (id: string) => string; flag: (id: string) => string; isFav: (id: string) => boolean;
}) {
  const { placed, worldW, worldH } = layout;

  const vpRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setVp({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Un risultato è "svelato" solo se il round è già passato (completato al 100%),
  // oppure è il round corrente in fase 'results' con quell'indice già rivelato.
  const isDecided = (r: number, i: number) =>
    r < activeRound || (r === activeRound && phase === 'results' && i < revealed);

  // Una singola squadra (home o away) è visibile solo se il suo match-figlio
  // specifico è stato deciso. Funziona anche per il round activeRound+1:
  // i vincitori compaiono in tempo reale mentre i risultati vengono rivelati.
  const teamSlotKnown = (r: number, i: number, slot: 'home' | 'away'): boolean => {
    // Round 0 (R32): squadre sempre note appena entriamo nel round
    if (r === 0) return r <= activeRound;
    // Round oltre activeRound+1: mai visibili
    if (r > activeRound + 1) return false;
    // Round activeRound+1 (il "prossimo"): mostra solo i vincitori già decisi
    // Round <= activeRound (già completati): tutti i vincitori noti
    const total    = rounds[r]?.matches.length ?? 0;
    const perSide  = total / 2;
    const side: 'L' | 'R' = i < perSide ? 'L' : 'R';
    const localIdx = side === 'L' ? i : i - perSide;
    const prevPerSide = (rounds[r - 1]?.matches.length ?? 0) / 2;
    const childBase = side === 'L' ? localIdx * 2 : prevPerSide + localIdx * 2;
    const childIdx  = slot === 'home' ? childBase : childBase + 1;
    const prevTotal = rounds[r - 1]?.matches.length ?? 0;
    if (childIdx >= prevTotal) return false;
    return isDecided(r - 1, childIdx);
  };

  // ── Camera ──
  // Durante i sedicesimi (r=0) NON zoommare: mostra tutto il bracket
  // così il vincitore compare subito nello slot degli ottavi sullo stesso schermo.
  // Lo zoom scatta solo quando si entra negli ottavi (activeRound=1+).
  const fit = vp.w && vp.h
    ? Math.min((vp.w * 0.96) / worldW, (vp.h * 0.94) / worldH)
    : 0.5;
  // Zoom: sedicesimi=fit completo, poi crescita moderata verso la finale.
  const rel = activeRound === 0 ? 1.0
            : activeRound === 1 ? 1.15
            : activeRound === 2 ? 1.55
            : activeRound === 3 ? 1.9
            : 1.9;  // finale: stesso zoom delle semifinali, non più grande
  const scale = fit * rel;

  // Camera centrata sul round attivo.
  // Con transform-origin:center e scale(s) translateX(dx):
  // il translateX è nel sistema di coordinate post-scale (cioè in pixel viewport / s).
  // Vogliamo che focusX (world coords) finisca al centro del viewport.
  // Centro viewport in world coords = worldW/2 (perché transform-origin=center).
  // Shift necessario = worldW/2 - focusX, ma in post-scale = shift/scale non serve
  // perché translateX con scale già applicata si muove di dx*scale px sullo schermo.
  // Formula corretta: translateX((worldW/2 - focusX)px) — il browser applica scale prima.
  const activeXs = placed.filter((p) => p.roundIdx === activeRound).map((p) => p.cx);
  const focusX   = activeXs.length ? activeXs.reduce((a, b) => a + b, 0) / activeXs.length : worldW / 2;
  // Con transform-origin:center e transform:scale(s) translateX(dx):
  // il viewport vede il punto (worldW/2 + dx) del world centrato sullo schermo.
  // Vogliamo che focusX sia al centro → dx = worldW/2 - focusX.
  // Ma translateX in questo ordine è nel sistema post-origin (world coords) → dx diretto.
  const shiftX = worldW / 2 - focusX;
  const camStyle: React.CSSProperties = {
    width: worldW, height: worldH,
    // scale prima, poi translate: il translate è in world-coords (pre-scale),
    // quindi usiamo l'ordine inverso: translate prima, scale dopo.
    transform: `translateX(${shiftX}px) scale(${scale})`,
    transformOrigin: 'center center',
  };

  return (
    <div className="cin-scene cin-bracket">
      <div className="cin-bracket-viewport" ref={vpRef}>
        <div className="cin-bracket-world" style={camStyle}>
          {/* Connettori SVG */}
          <svg className="cin-bracket-links" width={worldW} height={worldH}>
            {placed.filter((p) => p.parentRoundIdx >= 0).map((p) => {
              const parent = placed.find((q) => q.roundIdx === p.parentRoundIdx && q.matchIdx === p.parentMatchIdx);
              if (!parent) return null;
              const linkOn      = isDecided(p.roundIdx, p.matchIdx);
              const childEdgeX  = p.side === 'L' ? p.x + CARD_W : p.x;
              const parentEdgeX = p.side === 'L' ? parent.x     : parent.x + CARD_W;
              const midX        = (childEdgeX + parentEdgeX) / 2;
              return (
                <polyline
                  key={`conn-${p.roundIdx}-${p.matchIdx}`}
                  className={`cin-link ${linkOn ? 'on' : ''}`}
                  points={`${childEdgeX},${p.cy} ${midX},${p.cy} ${midX},${parent.cy} ${parentEdgeX},${parent.cy}`}
                  fill="none"
                />
              );
            })}
          </svg>

          {/* Box partite */}
          {placed.map((p) => {
            const m       = rounds[p.roundIdx]?.matches[p.matchIdx];
            if (!m) return null;
            const decided = isDecided(p.roundIdx, p.matchIdx);
            const active  = p.roundIdx === activeRound;
            const homeKnown = teamSlotKnown(p.roundIdx, p.matchIdx, 'home');
            const awayKnown = teamSlotKnown(p.roundIdx, p.matchIdx, 'away');
            return (
              <BracketBox
                key={`${p.roundIdx}-${p.matchIdx}`}
                p={p} m={m} homeKnown={homeKnown} awayKnown={awayKnown}
                decided={decided} active={active}
                roundIdx={p.roundIdx}
                name={name} flag={flag} isFav={isFav}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BracketBox({
  p, m, homeKnown, awayKnown, decided, active, roundIdx, name, flag, isFav,
}: {
  p: PlacedMatch; m: MatchResult;
  homeKnown: boolean; awayKnown: boolean;
  decided: boolean; active: boolean;
  roundIdx: number;
  name: (id: string) => string; flag: (id: string) => string; isFav: (id: string) => boolean;
}) {
  const homeWon = m.winnerId === m.homeId;
  const awayWon = m.winnerId === m.awayId;
  const anyKnown = homeKnown || awayKnown;

  // Tutti i round dal R16 in poi: flag-lg (bandiera media + nome)
  // Solo R32 usa il layout compatto base
  const sideLayout = roundIdx === 0 ? '' : 'flag-lg';
  const showName   = true;

  const cls = [
    'cin-bx',
    `cin-bx--${p.side}`,
    active    ? 'active'  : '',
    decided   ? 'decided' : anyKnown ? 'known' : 'empty',
    p.side === 'C' ? 'final' : '',
  ].filter(Boolean).join(' ');

  const Side = ({ id, goals, won, slotKnown }: { id: string; goals: number; won: boolean; slotKnown: boolean }) => (
    <div className={`cin-bx-side ${sideLayout} ${decided ? (won ? 'won' : 'lost') : ''} ${slotKnown && isFav(id) ? 'fav' : ''}`}>
      {slotKnown
        ? <span className={`fi fi-${flag(id)}`} aria-hidden />
        : <span className="cin-bx-empty-flag" aria-hidden />}
      {showName && <span className="cin-bx-name">{slotKnown ? name(id) : '—'}</span>}
      <span className="cin-bx-goal" style={{ visibility: decided && slotKnown ? 'visible' : 'hidden' }}>{goals}</span>
    </div>
  );

  return (
    <div className={cls} style={{ left: p.x, top: p.y, width: CARD_W, height: CARD_H }}>
      <Side id={m.homeId} goals={m.homeGoals} won={homeWon} slotKnown={homeKnown} />
      <div className="cin-bx-divider" />
      <Side id={m.awayId} goals={m.awayGoals} won={awayWon} slotKnown={awayKnown} />
      {decided && m.penalties && <div className="cin-bx-pen-bar">rigori</div>}
    </div>
  );
}

/* ───────────── CAMPIONE ───────────── */
function ChampionScene({
  championId, name, flag, isFav, italyActive, onClose,
}: {
  championId: string; name: (id: string) => string; flag: (id: string) => string;
  isFav: (id: string) => boolean; italyActive: boolean; onClose: () => void;
}) {
  return (
    <div className="cin-scene cin-champion">
      <div className="cin-confetti" aria-hidden>
        {Array.from({ length: 70 }, (_, i) => (
          <span key={i} className="cin-confetto" style={confettoStyle(i)} />
        ))}
      </div>
      <p className="cin-kicker">Campione del Mondo · 19 luglio 2026</p>
      <div className={`cin-trophy ${isFav(championId) ? 'fav' : ''}`}>
        <span className={`fi fi-${flag(championId)} cin-champ-flag`} aria-hidden />
      </div>
      <h1 className="cin-champ-name">{name(championId)}</h1>
      {isFav(championId) && <p className="cin-champ-fav">La tua squadra del cuore ce l&apos;ha fatta ♥</p>}
      {italyActive && championId === 'ITA' && (
        <p className="cin-champ-fav"><span className="fi fi-it" style={{display:'inline-block',width:20,height:14,borderRadius:2,verticalAlign:'middle',marginRight:6}} /> L&apos;Italia campione del mondo. In questa run, almeno.</p>
      )}
      <p className="cin-champ-disclaimer">
        È <strong>una</strong> delle 100.000 simulazioni. Le probabilità reali
        sono nella dashboard qui sotto.
      </p>
      <button className="cin-cta" onClick={onClose}>Vedi le statistiche complete →</button>
    </div>
  );
}

function confettoStyle(i: number): React.CSSProperties {
  const colors = ['#2fe08a', '#2fd6e0', '#ffce4d', '#f472b6', '#a78bfa', '#ff6b6b'];
  const left  = (i * 37) % 100;
  const delay = (i % 12) * 0.16;
  const dur   = 2.4 + ((i * 13) % 18) / 10;
  const rot   = (i * 47) % 360;
  return {
    left: `${left}%`, background: colors[i % colors.length],
    animationDelay: `${delay}s`, animationDuration: `${dur}s`, transform: `rotate(${rot}deg)`,
  };
}
