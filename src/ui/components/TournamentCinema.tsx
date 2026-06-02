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

interface Props {
  sample: SampleRun;
  teamsById: Map<string, Team>;
  favoriteTeam?: string | null;
  italyActive: boolean;
  onDone: () => void;
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

// ── Geometria bracket ─────────────────────────────────────────────────────────
// R32(×16): CARD_W×CARD_H_FULL ; Ottavi(×8): CARD_W×CARD_H_FLAG ; Quarti+(×4,2,1): CARD_W×CARD_H_QF
const CARD_W      = 168;
const CARD_H_FULL = 56;   // R32: bandiera+nome+gol
const CARD_H_FLAG = 54;   // Ottavi: solo bandiera grande
const CARD_H_QF   = 68;   // Quarti+: bandiera+nome piccolo sotto
const COL_GAP     = 48;
const ROW_BASE    = 76;   // slot altezza per match R32

interface PlacedMatch {
  roundIdx: number;
  matchIdx: number;
  side: 'L' | 'R' | 'C';
  x: number; y: number;
  cx: number; cy: number;
  cardH: number;
  parentRoundIdx: number;
  parentMatchIdx: number;
}

function cardHeight(roundIdx: number): number {
  if (roundIdx === 0) return CARD_H_FULL;           // R32
  if (roundIdx === 1) return CARD_H_FLAG;           // R16/Ottavi
  return CARD_H_QF;                                  // QF, SF, Finale
}

function buildBracketLayout(rounds: { matches: unknown[] }[]) {
  const nRounds  = rounds.length;
  const finalIdx = nRounds - 1;
  const r32Count = rounds[0]?.matches.length ?? 0;
  const perSide0 = r32Count / 2;

  const colSpan = CARD_W + COL_GAP;
  const worldH  = perSide0 * ROW_BASE;
  const centerY = worldH / 2;
  const worldW  = (2 * finalIdx + 1) * colSpan;

  const placed: PlacedMatch[] = [];

  for (let r = 0; r < nRounds; r++) {
    const total  = rounds[r].matches.length;
    const cH     = cardHeight(r);

    if (r === finalIdx) {
      placed.push({
        roundIdx: r, matchIdx: 0, side: 'C',
        x: finalIdx * colSpan, y: centerY - cH / 2,
        cx: finalIdx * colSpan + CARD_W / 2, cy: centerY,
        cardH: cH, parentRoundIdx: -1, parentMatchIdx: -1,
      });
      continue;
    }

    const perSide = total / 2;
    const step    = worldH / perSide;

    for (let i = 0; i < total; i++) {
      const side: 'L' | 'R' = i < perSide ? 'L' : 'R';
      const localIdx = side === 'L' ? i : i - perSide;
      const col = side === 'L' ? r : (2 * finalIdx - r);
      const x   = col * colSpan;
      const y   = localIdx * step + step / 2 - cH / 2;

      const nextTotal    = rounds[r + 1]?.matches.length ?? 0;
      const perSideNext  = nextTotal / 2;
      const isNextFinal  = r + 1 === finalIdx;
      const parentMatchIdx = isNextFinal
        ? 0
        : side === 'L'
          ? Math.floor(localIdx / 2)
          : perSideNext + Math.floor(localIdx / 2);

      placed.push({
        roundIdx: r, matchIdx: i, side,
        x, y, cx: x + CARD_W / 2, cy: y + cH / 2,
        cardH: cH,
        parentRoundIdx: r + 1, parentMatchIdx,
      });
    }
  }

  return { placed, worldW, worldH, colSpan, finalIdx, perSide0 };
}

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

export function TournamentCinema({ sample, teamsById, favoriteTeam, italyActive, onDone }: Props) {
  const rounds = sample.knockoutRounds;
  const [speed,   setSpeed]   = useState(1);
  const [leaving, setLeaving] = useState(false);

  // Stato regia
  const [stage, setStage] = useState<'kickoff' | 'groups' | 'ko' | 'champion'>('kickoff');
  // groups: indice girone attivo (0-11), risultati svelati in quel girone
  const [activeGroup,    setActiveGroup]    = useState(0);
  const [groupRevealed,  setGroupRevealed]  = useState(0); // partite svelate nel girone attivo
  // overlay terze: appare sopra i gironi (stage='groups', showThirds=true)
  const [showThirds,     setShowThirds]     = useState(false);
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

    } else if (stage === 'groups' && !showThirds) {
      cinemaAudio.setTension(0);
      const total = currentGroupMatches.length;
      if (groupRevealed < total) {
        // Rivela la prossima partita del girone corrente
        after(BASE.groupStagger, () => setGroupRevealed((n) => n + 1));
      } else if (activeGroup < GROUPS.length - 1) {
        // Girone finito: pausa poi passa al successivo
        after(BASE.groupBetween, () => { setActiveGroup((g) => g + 1); setGroupRevealed(0); });
      } else {
        // Tutti i gironi finiti: pausa poi mostra overlay terze
        after(BASE.groupTail, () => { setShowThirds(true); setThirdsRevealed(0); });
      }

    } else if (stage === 'groups' && showThirds) {
      if (thirdsRevealed < thirds.length) {
        after(BASE.thirdsReveal, () => setThirdsRevealed((n) => n + 1));
      } else {
        after(BASE.thirdsTail, () => {
          setShowThirds(false); setStage('ko'); setKoRound(0); setKoPhase('appear'); setKoRevealed(0);
        });
      }

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
  }, [stage, activeGroup, groupRevealed, showThirds, thirdsRevealed, koRound, koPhase, koRevealed, koTotal, speed, paused]);

  // ── Suoni ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (stage === 'kickoff') cinemaAudio.kickoff();
    if (stage === 'champion') cinemaAudio.champion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useEffect(() => {
    if (stage === 'groups' && !showThirds && groupRevealed > 0) cinemaAudio.groupTick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupRevealed]);

  useEffect(() => {
    if (showThirds && thirdsRevealed > 0) {
      thirds[thirdsRevealed - 1]?.qualified ? cinemaAudio.advance() : cinemaAudio.groupTick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thirdsRevealed]);

  useEffect(() => {
    if (stage !== 'ko' || koPhase !== 'results' || koRevealed === 0) return;
    const m = rounds[koRound]?.matches[koRevealed - 1];
    const t = tensionForRound(koRound);
    if (t >= 3) cinemaAudio.keyMatch(t);
    else if (m?.penalties) cinemaAudio.penalties();
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
      setStage('kickoff');
    } else if (c === 1) {
      // Mostra tutti i gironi completi, nessun overlay
      setStage('groups');
      setActiveGroup(GROUPS.length - 1);
      setGroupRevealed(groupMatches[GROUPS[GROUPS.length - 1]]?.length ?? 0);
      setShowThirds(false);
    } else if (c === TIMELINE.length - 1) {
      setStage('champion');
    } else {
      const r = c - 2;
      setStage('ko'); setShowThirds(false);
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
  if (stage === 'groups' && !showThirds) {
    title = `Girone ${GROUPS[activeGroup] ?? ''}`;
    sub   = `${groupRevealed} / ${currentGroupMatches.length} partite`;
  } else if (stage === 'groups' && showThirds) {
    title = 'Migliori terze';
    sub   = `${Math.min(thirdsRevealed, thirds.length)} / ${thirds.length}`;
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

      {/* ── TITLEBAR: solo per KO e champion, non per gironi (il titolo è dentro la scena) ── */}
      {stage !== 'kickoff' && stage !== 'groups' && (
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
              {italyActive && ' Con l’Italia nel Girone B. 🇮🇹'}
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
              title={title} sub={sub}
              name={name} flag={flag} isFav={isFav} italyActive={italyActive}
            />
            {showThirds && (
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

        {stage !== 'champion' ? (
          <button className="cin-skip" onClick={skip}>Salta alla fine →</button>
        ) : (
          <button className="cin-skip" onClick={finish}>Vedi statistiche ✕</button>
        )}
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
  sample, revealedByGroup, activeGroupKey, groupMatches, title, sub, name, flag, isFav, italyActive,
}: {
  sample: SampleRun;
  revealedByGroup: Record<string, number>;
  activeGroupKey: string;
  groupMatches: Record<string, MatchResult[]>;
  title: string; sub: string;
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
      <div className="cin-groups-title">
        <h2 className="cin-groups-h">{title}</h2>
        {sub && <span className="cin-groups-sub">{sub}</span>}
      </div>
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
                    idx < 2 && complete ? 'qualified' : '',
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
  // specifico è stato deciso — usato per mostrare il vincitore progressivamente.
  const teamSlotKnown = (r: number, i: number, slot: 'home' | 'away'): boolean => {
    if (r > activeRound) return false;
    if (r === 0) return true;
    const total    = rounds[r]?.matches.length ?? 0;
    const perSide  = total / 2;
    const side: 'L' | 'R' = i < perSide ? 'L' : 'R';
    const localIdx = side === 'L' ? i : i - perSide;
    const prevPerSide = (rounds[r - 1]?.matches.length ?? 0) / 2;
    // home viene dal child con indice pari, away dall'indice dispari
    const childBase = side === 'L' ? localIdx * 2 : prevPerSide + localIdx * 2;
    const childIdx  = slot === 'home' ? childBase : childBase + 1;
    const prevTotal = rounds[r - 1]?.matches.length ?? 0;
    if (childIdx >= prevTotal) return false;
    return isDecided(r - 1, childIdx);
  };

  // ── Camera ──
  const fit = vp.w && vp.h
    ? Math.min((vp.w * 0.96) / worldW, (vp.h * 0.94) / worldH)
    : 0.5;
  const rel = activeRound === 0 ? 1.0
            : activeRound === 1 ? 1.0
            : activeRound === 2 ? 1.55
            : activeRound === 3 ? 2.1
            : 2.8;
  const scale = fit * rel;
  const activeXs = placed.filter((p) => p.roundIdx === activeRound).map((p) => p.cx);
  const focusX   = activeXs.length ? activeXs.reduce((a, b) => a + b, 0) / activeXs.length : worldW / 2;
  const camStyle: React.CSSProperties = {
    width: worldW, height: worldH,
    transform: `scale(${scale}) translate(${(worldW / 2 - focusX)}px, 0)`,
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

  const isR16    = roundIdx === 1;
  const isQFplus = roundIdx >= 2;
  const sideLayout = isR16 ? 'flag-only' : isQFplus ? 'flag-lg' : '';
  const showName   = !isR16;

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
      {decided && slotKnown && <span className="cin-bx-goal">{goals}</span>}
    </div>
  );

  return (
    <div className={cls} style={{ left: p.x, top: p.y, width: CARD_W, height: p.cardH }}>
      <Side id={m.homeId} goals={m.homeGoals} won={homeWon} slotKnown={homeKnown} />
      <div className="cin-bx-divider" />
      <Side id={m.awayId} goals={m.awayGoals} won={awayWon} slotKnown={awayKnown} />
      {decided && m.penalties && <span className="cin-bx-pen">dcr</span>}
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
        <p className="cin-champ-fav">🇮🇹 L&apos;Italia campione del mondo. In questa run, almeno.</p>
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
