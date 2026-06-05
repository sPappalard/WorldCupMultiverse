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
import { useT, useTeamName } from '../../i18n';

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

/** Vero su viewport stretti (smartphone). Solo per scegliere il rendering del
 *  bracket nel cinema: su mobile la "camera" zoomabile è illeggibile, quindi
 *  passiamo a una lista verticale per round. Allineato al breakpoint CSS. */
function useIsMobile(maxWidth = 720): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${maxWidth}px)`).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [maxWidth]);
  return isMobile;
}

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
  const { t } = useT();
  const rounds = sample.knockoutRounds;
  const isMobile = useIsMobile();
  const [speed,   setSpeed]   = useState(1);
  const [leaving, setLeaving] = useState(false);

  const TIMELINE: Stop[] = useMemo(() => [
    { key: 'kickoff', label: t('cinema.tl.kickoff'), date: '11 JUN' },
    { key: 'groups',  label: t('cinema.tl.groups'),  date: '11–27 JUN' },
    { key: 'r32',     label: t('cinema.tl.r32'),     date: '28 JUN' },
    { key: 'r16',     label: t('cinema.tl.r16'),     date: '4 JUL' },
    { key: 'qf',      label: t('cinema.tl.qf'),      date: '9 JUL' },
    { key: 'sf',      label: t('cinema.tl.sf'),      date: '14 JUL' },
    { key: 'final',   label: t('cinema.tl.final'),   date: '19 JUL' },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t]);

  const ROUND_LABEL: Record<string, string> = useMemo(() => ({
    'Round of 32':    t('cinema.round.r32'),
    'Round of 16':    t('cinema.round.r16'),
    'Quarter-finals': t('cinema.round.qf'),
    'Semi-finals':    t('cinema.round.sf'),
    Final:            t('cinema.round.final'),
    Finale:           t('cinema.round.final'),
    Semifinali:       t('cinema.round.sf'),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [t]);

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

  const speedRef      = useRef(speed);  speedRef.current  = speed;
  const pausedRef     = useRef(paused); pausedRef.current = paused;
  const timers = useRef<number[]>([]);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const after = (ms: number, fn: () => void) => {
    if (pausedRef.current) return;
    const id = window.setTimeout(fn, ms / speedRef.current);
    timers.current.push(id);
  };

  useEffect(() => { cinemaAudio.setMuted(muted); }, [muted]);
  useEffect(() => () => { cinemaAudio.setTension(0); }, []);

  const teamName = useTeamName();
  const name  = (id: string) => { const tm = teamsById.get(id); return tm ? teamName(tm) : id; };
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
    }).filter(Boolean) as { group: string; teamId: string; points: number; goalDifference: number; goalsFor: number; goalsAgainst: number }[];
    // Ordine identico al motore: punti → diff reti → gol fatti → gol subiti (meno=meglio)
    list.sort((a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.goalsAgainst - b.goalsAgainst
    );
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
      // Guard: se il girone non ha ancora match (stato transitorio), aspetta il
      // prossimo render invece di avanzare subito — evita il blocco al cambio blocco mobile.
      if (total === 0) return;
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
      } else if (isMobile) {
        // Mobile: niente recap dei gironi con le terze in verde — lo schermo non
        // li mostra tutti insieme. Dopo il calcolo terze si va dritti ai sedicesimi.
        after(BASE.thirdsTail, () => {
          cinemaAudio.advance();
          setThirdsState('done');
          setStage('ko'); setKoRound(0); setKoPhase('appear'); setKoRevealed(0);
        });
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
      // Il timer diretto (window.setTimeout) nel ramo 'showing' gestisce il passaggio al KO.
      // Non fare nulla qui — evita di avviare un secondo timer.

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
      // Kickoff: tutto azzerato
      setStage('kickoff'); setThirdsState('hidden'); setThirdsRevealed(0);
      setActiveGroup(0); setGroupRevealed(0);
    } else if (c === 1) {
      // Gironi: tutti i risultati visibili, terze NON evidenziate.
      // Play → parte il calcolo migliori terze (overlay 'showing').
      setStage('groups');
      setActiveGroup(GROUPS.length - 1);
      setGroupRevealed(groupMatches[GROUPS[GROUPS.length - 1]]?.length ?? 0);
      setThirdsState('hidden'); setThirdsRevealed(0);
    } else if (c === TIMELINE.length - 1) {
      setStage('champion');
    } else {
      // Round KO: mostra le squadre già posizionate (round attuale in 'appear', 0 rivelati).
      // Play → parte la rivelazione partita per partita.
      const r = c - 2;
      setStage('ko'); setThirdsState('done');
      setActiveGroup(GROUPS.length - 1);
      setGroupRevealed(groupMatches[GROUPS[GROUPS.length - 1]]?.length ?? 0);
      setKoRound(r); setKoPhase('appear'); setKoRevealed(0);
      cinemaAudio.setTension(tensionForRound(r));
    }
    setPaused(true);
  };
  const prevStop = () => goToStop(stopIndex - 1);
  const nextStop = () => goToStop(stopIndex + 1);

  const championId = sample.championId;

  let title = '', sub = '';
  if (stage === 'groups' && thirdsState === 'hidden') {
    title = t('cinema.group', { g: GROUPS[activeGroup] ?? '' });
    sub   = t('cinema.group.matches', { n: groupRevealed, total: currentGroupMatches.length });
  } else if (stage === 'groups' && thirdsState === 'showing') {
    title = t('cinema.thirds.title');
    sub   = `${Math.min(thirdsRevealed, thirds.length)} / ${thirds.length}`;
  } else if (stage === 'groups' && thirdsState === 'done') {
    title = t('cinema.groups.done');
    sub   = t('cinema.groups.qualifiedSub');
  } else if (stage === 'ko') {
    title = ROUND_LABEL[rounds[koRound]?.name] ?? rounds[koRound]?.name ?? '';
    sub   = koPhase === 'appear' ? t('cinema.ko.pairings')
          : koRevealed < koTotal ? t('cinema.ko.results', { n: koRevealed, total: koTotal })
          : t('cinema.ko.roundDone');
  } else if (stage === 'champion') {
    title = t('cinema.champion');
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
      <Timeline stopIndex={stopIndex} onStopClick={goToStop} timeline={TIMELINE} t={t} />

      {/* ── TITLEBAR ── (nascosta durante overlay terze) */}
      {stage !== 'kickoff' && thirdsState !== 'showing' && (
        <div className="cin-titlebar">
          <h2 className="cin-title" key={title}>{title}</h2>
          {sub && <span className="cin-title-sub">{sub}</span>}
        </div>
      )}

      {/* ── STAGE ── */}
      <div className="cin-stage">
        {stage === 'kickoff' && (
          <div className="cin-scene cin-intro">
            <p className="cin-kicker">{t('cinema.intro.kicker')}</p>
            <h1 className="cin-bigtitle">{t('cinema.intro.title.line1')}<br />{t('cinema.intro.title.line2')}</h1>
            <p className="cin-sub">
              {t('cinema.intro.sub', { n: (100000).toLocaleString() })}
              {italyActive && <> {t('cinema.intro.sub.italy')} <span className="fi fi-it" style={{display:'inline-block',width:18,height:13,borderRadius:2,verticalAlign:'middle',marginLeft:3}} /></>}
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
              isMobile={isMobile} activeGroupIdx={activeGroup}
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
            name={name} flag={flag} isFav={isFav} isMobile={isMobile}
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
          <button className="cin-ctrl-btn" onClick={prevStop} disabled={stopIndex === 0} title={t('cinema.ctrl.prev')}>‹</button>
          {stage !== 'champion' ? (
            <button className="cin-ctrl-btn cin-ctrl-play" onClick={() => setPaused((p) => !p)} title={paused ? t('cinema.ctrl.resume') : t('cinema.ctrl.pause')}>
              {paused ? '►' : '❚❚'}
            </button>
          ) : (
            <button className="cin-ctrl-btn cin-ctrl-play" onClick={() => goToStop(0)} title={t('cinema.ctrl.replay')}>↺</button>
          )}
          <button className="cin-ctrl-btn" onClick={nextStop} disabled={stopIndex >= TIMELINE.length - 1} title={t('cinema.ctrl.next')}>›</button>
          <button className={`cin-ctrl-btn ${muted ? 'off' : ''}`} onClick={() => setMuted((m) => !m)} title={muted ? t('cinema.ctrl.unmute') : t('cinema.ctrl.mute')}>
            {muted ? '🔇' : '🔊'}
          </button>
        </div>

        <div className="cin-speed">
          <span className="cin-speed-label">{t('cinema.speed')}</span>
          {[1, 2, 3].map((s) => (
            <button key={s} className={`cin-speed-btn ${speed === s ? 'on' : ''}`} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>

        <div className="cin-skip-group">
          {stage !== 'champion' ? (
            <button className="cin-skip" onClick={skip}>{t('cinema.skipToEnd')}</button>
          ) : (
            <button className="cin-skip" onClick={finish}>{t('cinema.seeStats')}</button>
          )}
          {onSkip && (
            <button className="cin-skip cin-skip--dash" onClick={onSkip}>{t('cinema.dashboard')}</button>
          )}
        </div>
      </footer>
    </div>
  );
}

/* ───────────── TIMELINE ───────────── */
function Timeline({ stopIndex, onStopClick, timeline, t }: { stopIndex: number; onStopClick: (i: number) => void; timeline: Stop[]; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const pct = (stopIndex / (timeline.length - 1)) * 100;
  return (
    <div className="cin-tl">
      <div className="cin-tl-track">
        <div className="cin-tl-fill" style={{ width: `${pct}%` }} />
        <div className="cin-tl-cursor" style={{ left: `${pct}%` }} />
        {timeline.map((s, i) => (
          <button
            key={s.key} type="button"
            className={`cin-tl-stop ${i === stopIndex ? 'active' : ''} ${i < stopIndex ? 'past' : ''}`}
            style={{ left: `${(i / (timeline.length - 1)) * 100}%` }}
            onClick={() => onStopClick(i)} title={t('cinema.tl.goto', { label: s.label })}
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
  isMobile, activeGroupIdx,
}: {
  sample: SampleRun;
  revealedByGroup: Record<string, number>;
  activeGroupKey: string;
  groupMatches: Record<string, MatchResult[]>;
  thirdsQualified?: Set<string>;
  name: (id: string) => string; flag: (id: string) => string;
  isFav: (id: string) => boolean; italyActive: boolean;
  isMobile: boolean; activeGroupIdx: number;
}) {
  const { t } = useT();
  // Su smartphone i 12 gironi non entrano in una schermata: li mostriamo a
  // blocchi di 6 (A–F, poi G–L). Il blocco visibile è quello del girone attivo;
  // quando l'animazione supera il 6° girone, scatta automaticamente al blocco 2.
  const BATCH = 6;
  const visibleGroups = isMobile
    ? GROUPS.slice(Math.floor(activeGroupIdx / BATCH) * BATCH, Math.floor(activeGroupIdx / BATCH) * BATCH + BATCH)
    : GROUPS;
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
      {visibleGroups.map((g, gi) => {
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
              <span className="cin-group-title">{t('cinema.group', { g })}</span>
              {isActive
                ? <span className="cin-group-live">{t('cinema.group.live')}</span>
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
  goalDifference: number; goalsFor: number; goalsAgainst: number; qualified: boolean;
}
function ThirdsModal({
  thirds, revealed, name, flag, isFav, italyActive,
}: {
  thirds: ThirdRow[]; revealed: number;
  name: (id: string) => string; flag: (id: string) => string;
  isFav: (id: string) => boolean; italyActive: boolean;
}) {
  const { t } = useT();
  return (
    <div className="cin-thirds-modal">
      <p className="cin-thirds-modal-title">{t('cinema.thirds.modalTitle')}</p>
      <p className="cin-thirds-modal-sub">
        {t('cinema.thirds.modalSub', { best: t('cinema.thirds.bestWord') })}
      </p>
      <div className="cin-thirds-list">
        {thirds.map((row, i) => {
          const shown   = i < revealed;
          const cutoff  = i === 8;
          return (
            <div key={row.teamId}>
              {cutoff && shown && <div className="cin-thirds-cut">{t('cinema.thirds.cutoff')}</div>}
              <div
                className={[
                  'cin-thirds-row',
                  shown ? 'shown' : 'hidden',
                  shown && row.qualified  ? 'ok'   : '',
                  shown && !row.qualified ? 'ko'   : '',
                  isFav(row.teamId) ? 'fav' : '',
                  italyActive && row.teamId === 'ITA' ? 'italy' : '',
                ].filter(Boolean).join(' ')}
              >
                <span className="cin-thirds-rank">{i + 1}</span>
                <span className={`fi fi-${flag(row.teamId)}`} aria-hidden />
                <span className="cin-thirds-name">{name(row.teamId)}</span>
                <span className="cin-thirds-grp">{t('cinema.thirds.groupShort', { g: row.group })}</span>
                <span className="cin-thirds-stat">{t('cinema.thirds.points', { n: row.points })}</span>
                <span className="cin-thirds-stat dim">{row.goalDifference >= 0 ? '+' : ''}{row.goalDifference}</span>
                {shown && (
                  <span className={`cin-thirds-badge ${row.qualified ? 'ok' : 'ko'}`}>
                    {row.qualified ? '✓' : '✕'}
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
  rounds, layout, activeRound, phase, revealed, name, flag, isFav, isMobile,
}: {
  rounds: { name: string; matches: MatchResult[] }[];
  layout: ReturnType<typeof buildBracketLayout>;
  activeRound: number; phase: 'appear' | 'results'; revealed: number;
  name: (id: string) => string; flag: (id: string) => string; isFav: (id: string) => boolean;
  isMobile: boolean;
}) {
  // Su smartphone la camera zoomabile è illeggibile: mostriamo il round attivo
  // come lista verticale, una partita alla volta, seguendo la stessa regia.
  if (isMobile) {
    return (
      <BracketMobileScene
        rounds={rounds} activeRound={activeRound} phase={phase} revealed={revealed}
        name={name} flag={flag} isFav={isFav}
      />
    );
  }

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
  // Approccio: transform-origin top-left, translate assoluto in px viewport.
  // tx = vpW/2 - focusX * scale  → il punto focusX del world finisce al centro orizzontale
  // ty = vpH/2 - focusY * scale  → il punto focusY del world finisce al centro verticale
  const fit = vp.w && vp.h
    ? Math.min((vp.w * 0.96) / worldW, (vp.h * 0.94) / worldH)
    : 0.5;
  const rel = activeRound === 0 ? 1.0
            : activeRound === 1 ? 1.15
            : activeRound === 2 ? 1.55
            : activeRound === 3 ? 1.9
            : 1.9;
  const scale = fit * rel;

  const activeXs = placed.filter((p) => p.roundIdx === activeRound).map((p) => p.cx);
  const focusX   = activeXs.length ? activeXs.reduce((a, b) => a + b, 0) / activeXs.length : worldW / 2;
  const focusY   = worldH / 2;

  const tx = vp.w ? vp.w / 2 - focusX * scale : 0;
  const ty = vp.h ? vp.h / 2 - focusY * scale : 0;

  const camStyle: React.CSSProperties = {
    position: 'absolute',
    width: worldW, height: worldH,
    left: 0, top: 0,
    transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
    transformOrigin: 'top left',
    transition: 'transform 1s var(--ease-out)',
    willChange: 'transform',
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
      {decided && m.penalties && <PenBar />}
    </div>
  );
}

function PenBar() {
  const { t } = useT();
  return <div className="cin-bx-pen-bar">{t('common.penShort')}</div>;
}

/* ───────────── BRACKET MOBILE (lista verticale per round) ───────────── */
/**
 * Versione del tabellone pensata per smartphone: niente camera zoomabile (sarebbe
 * illeggibile), ma il round attivo mostrato come lista verticale di partite che
 * compaiono una alla volta, seguendo la stessa regia (activeRound/phase/revealed).
 * La striscia in alto mostra l'avanzamento tra i round.
 */
function BracketMobileScene({
  rounds, activeRound, phase, revealed, name, flag, isFav,
}: {
  rounds: { name: string; matches: MatchResult[] }[];
  activeRound: number; phase: 'appear' | 'results'; revealed: number;
  name: (id: string) => string; flag: (id: string) => string; isFav: (id: string) => boolean;
}) {
  const { t } = useT();
  const ROUND_SHORT_LOCAL: Record<string, string> = {
    'Round of 32':    t('cinema.roundShort.r32'),
    'Round of 16':    t('cinema.roundShort.r16'),
    'Quarter-finals': t('cinema.roundShort.qf'),
    'Semi-finals':    t('cinema.roundShort.sf'),
    Final:            t('cinema.roundShort.final'),
    Finale:           t('cinema.roundShort.final'),
    Semifinali:       t('cinema.roundShort.sf'),
  };
  const round   = rounds[activeRound];
  const matches = round?.matches ?? [];
  // Una partita è decisa (mostra punteggio) solo in fase results e già rivelata.
  const isDecided = (i: number) => phase === 'results' && i < revealed;
  const isFinal   = activeRound === rounds.length - 1;

  // Auto-scroll sull'ultima partita rivelata: su round lunghi (16 partite ai
  // sedicesimi) la lista eccede lo schermo, seguiamo il reveal.
  const listRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase === 'results' && revealed > 0) {
      lastRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [revealed, phase]);

  // Cambio round (es. sedicesimi → ottavi): riporta la lista in cima, altrimenti
  // il nuovo round partirebbe con lo scroll rimasto in fondo al round precedente.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [activeRound]);

  return (
    <div className="cin-scene cin-bracket-m">
      {/* Striscia round */}
      <div className="cin-brm-strip">
        {rounds.map((r, i) => (
          <div
            key={i}
            className={`cin-brm-pill ${i === activeRound ? 'on' : ''} ${i < activeRound ? 'past' : ''}`}
          >
            {ROUND_SHORT_LOCAL[r.name] ?? r.name}
          </div>
        ))}
      </div>

      {/* Lista partite del round attivo */}
      <div className="cin-brm-list" ref={listRef}>
        {matches.map((m, i) => {
          const decided = isDecided(i);
          const homeWon = m.winnerId === m.homeId;
          const awayWon = m.winnerId === m.awayId;
          // L'ultima partita appena rivelata: ancora per l'auto-scroll.
          const isLast  = phase === 'results' && i === revealed - 1;
          return (
            <div
              key={i}
              ref={isLast ? lastRef : undefined}
              className={[
                'cin-brm-match',
                isFinal ? 'final' : '',
                decided ? 'decided' : '',
              ].filter(Boolean).join(' ')}
            >
              <MobileSide
                id={m.homeId} goals={m.homeGoals} won={homeWon}
                decided={decided} name={name} flag={flag} isFav={isFav}
              />
              <div className="cin-brm-divider" />
              <MobileSide
                id={m.awayId} goals={m.awayGoals} won={awayWon}
                decided={decided} name={name} flag={flag} isFav={isFav}
              />
              {decided && m.penalties && <span className="cin-brm-pen">{t('common.penShort')}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MobileSide({
  id, goals, won, decided, name, flag, isFav,
}: {
  id: string; goals: number; won: boolean; decided: boolean;
  name: (id: string) => string; flag: (id: string) => string; isFav: (id: string) => boolean;
}) {
  return (
    <div className={`cin-brm-side ${decided ? (won ? 'won' : 'lost') : ''} ${isFav(id) ? 'fav' : ''}`}>
      <span className={`fi fi-${flag(id)}`} aria-hidden />
      <span className="cin-brm-name">{name(id)}</span>
      <span className="cin-brm-goal" style={{ visibility: decided ? 'visible' : 'hidden' }}>{goals}</span>
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
  const { t } = useT();
  return (
    <div className="cin-scene cin-champion">
      <div className="cin-confetti" aria-hidden>
        {Array.from({ length: 70 }, (_, i) => (
          <span key={i} className="cin-confetto" style={confettoStyle(i)} />
        ))}
      </div>
      <p className="cin-kicker">{t('cinema.champion.kicker')}</p>
      <div className={`cin-trophy ${isFav(championId) ? 'fav' : ''}`}>
        <span className={`fi fi-${flag(championId)} cin-champ-flag`} aria-hidden />
      </div>
      <h1 className="cin-champ-name">{name(championId)}</h1>
      {isFav(championId) && <p className="cin-champ-fav">{t('cinema.champion.favMsg')}</p>}
      {italyActive && championId === 'ITA' && (
        <p className="cin-champ-fav"><span className="fi fi-it" style={{display:'inline-block',width:20,height:14,borderRadius:2,verticalAlign:'middle',marginRight:6}} /> {t('cinema.champion.italyMsg')}</p>
      )}
      <p className="cin-champ-disclaimer">{t('cinema.champion.disclaimer')}</p>
      <button className="cin-cta" onClick={onClose}>{t('cinema.champion.cta')}</button>
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
