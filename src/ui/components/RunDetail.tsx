import { useState, useRef, useEffect } from 'react';
import type { SampleRun, MatchResult, Team } from '../../engine/types';
import { oddsFromProb, pctInt } from '../odds';
import { buildBracketLayout, CARD_W } from '../bracketLayout';

interface Props {
  sample: SampleRun;
  teamsById: Map<string, Team>;
  favoriteTeam?: string | null;
  onReplay: () => void;
  numRuns: number;
}

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

/* ────────────────── RunDetail root ────────────────── */
export function RunDetail({ sample, teamsById, favoriteTeam, onReplay, numRuns }: Props) {
  const [view, setView]             = useState<'bracket' | 'groups'>('bracket');
  const [replayConfirm, setReplayConfirm] = useState(false);
  const name = (id: string) => teamsById.get(id)?.name ?? id;
  const flag = (id: string) => teamsById.get(id)?.flag ?? '';
  const champ = teamsById.get(sample.championId);

  return (
    <div className="rd2-root">

      {/* ── Hero banner compatto ── */}
      <div className="rd2-hero">
        <div className="rd2-hero-left">
          <span className="rd2-hero-kicker">Una run su {numRuns.toLocaleString('it-IT')}</span>
          <div className="rd2-hero-champ">
            {champ && <span className={`fi fi-${champ.flag} rd2-champ-flag`} aria-hidden />}
            <span className="rd2-champ-name">{champ?.name ?? sample.championId}</span>
            <span className="rd2-champ-trophy">🏆</span>
          </div>
          <span className="rd2-hero-note">Possibilità concreta, non una previsione — in un'altra run può andare diversamente.</span>
        </div>

        {/* Bottone rivedi cinema — con dialogo di conferma */}
        <div className="rd2-hero-right">
          {!replayConfirm ? (
            <button className="rd2-replay-btn" onClick={() => setReplayConfirm(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Rivedi il filmato
            </button>
          ) : (
            <div className="rd2-confirm-box">
              <p className="rd2-confirm-text">
                Ripartirai dalla simulazione cinematografica dall'inizio. Puoi interromperla in qualsiasi momento.
              </p>
              <div className="rd2-confirm-btns">
                <button className="rd2-confirm-yes" onClick={() => { setReplayConfirm(false); onReplay(); }}>
                  Sì, rivedi
                </button>
                <button className="rd2-confirm-no" onClick={() => setReplayConfirm(false)}>
                  Annulla
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Tab Tabellone / Gironi ── */}
      <div className="rd2-tabs">
        <button className={`rd2-tab ${view === 'bracket' ? 'on' : ''}`} onClick={() => setView('bracket')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
          Tabellone KO
        </button>
        <button className={`rd2-tab ${view === 'groups' ? 'on' : ''}`} onClick={() => setView('groups')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          Fase a gironi
        </button>
      </div>

      {/* ── Contenuto ── */}
      <div className="rd2-content">
        {view === 'bracket'
          ? <CompactBracket sample={sample} name={name} flag={flag} favoriteTeam={favoriteTeam} />
          : <GroupsDetail   sample={sample} teamsById={teamsById} favoriteTeam={favoriteTeam} />}
      </div>
    </div>
  );
}

/* ────────────────── BRACKET ────────────────── */
const MAX_ZOOM = 2.2;

function CompactBracket({ sample, name, flag, favoriteTeam }: {
  sample: SampleRun; name: (id: string) => string; flag: (id: string) => string; favoriteTeam?: string | null;
}) {
  const rounds = sample.knockoutRounds;
  const [sel, setSel]           = useState<{ r: number; m: number } | null>(null);
  const [userZoom, setUserZoom] = useState<number | null>(null); // null = auto-fit
  const [pan, setPan]           = useState({ x: 0, y: 0 });
  const dragging                = useRef(false);
  const dragStart               = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const selMatch = sel ? rounds[sel.r]?.matches[sel.m] : null;
  const layout = buildBracketLayout(rounds);
  const { placed, worldW, worldH } = layout;
  const vpRef  = useRef<HTMLDivElement>(null);
  const [autoScale, setAutoScale] = useState(1);

  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const fitScale = Math.min(1.4, (e.contentRect.width - 16) / worldW);
      setAutoScale(fitScale);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [worldW]);

  const scale = userZoom ?? autoScale;
  const isZoomed = userZoom !== null && userZoom > autoScale + 0.05;

  // Zoom con rotella — minimo = autoScale (non si rimpicciolisce oltre il fit)
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setUserZoom(z => {
      const cur = z ?? autoScale;
      const next = Math.max(autoScale, Math.min(MAX_ZOOM, cur + delta));
      // Se torna vicino all'autoScale, resetta a null (auto-fit)
      if (Math.abs(next - autoScale) < 0.05) { setPan({ x: 0, y: 0 }); return null; }
      return next;
    });
  }

  // Drag to pan (solo quando zoomato)
  function handleMouseDown(e: React.MouseEvent) {
    if (!isZoomed) return;
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return;
    setPan({
      x: dragStart.current.px + (e.clientX - dragStart.current.mx),
      y: dragStart.current.py + (e.clientY - dragStart.current.my),
    });
  }
  function handleMouseUp() { dragging.current = false; }

  function resetView() { setUserZoom(null); setPan({ x: 0, y: 0 }); }

  return (
    <div className="rd-bracket-wrap">
      <div className="rd2-zoom-hint">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        Rotella per ingrandire · trascina per spostarti · clicca una partita per i dettagli
        {isZoomed && <button className="rd2-zoom-reset" onClick={resetView}>Reset</button>}
      </div>

      <div
        className="rd-symbracket-vp"
        ref={vpRef}
        style={{
          height: worldH * scale + 24,
          overflow: 'hidden',
          cursor: isZoomed ? (dragging.current ? 'grabbing' : 'grab') : 'default',
          userSelect: 'none',
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="rd-symbracket-world"
          style={{
            width: worldW, height: worldH,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <svg className="rd-symlinks" width={worldW} height={worldH}>
            {placed.filter(p => p.parentRoundIdx >= 0).map(p => {
              const parent = placed.find(q => q.roundIdx === p.parentRoundIdx && q.matchIdx === p.parentMatchIdx);
              if (!parent) return null;
              const childEdgeX  = p.side === 'L' ? p.x + CARD_W : p.x;
              const parentEdgeX = p.side === 'L' ? parent.x : parent.x + CARD_W;
              const midX = (childEdgeX + parentEdgeX) / 2;
              return (
                <polyline key={`c-${p.roundIdx}-${p.matchIdx}`} className="rd-symlink"
                  points={`${childEdgeX},${p.cy} ${midX},${p.cy} ${midX},${parent.cy} ${parentEdgeX},${parent.cy}`} fill="none" />
              );
            })}
          </svg>
          {placed.map(p => {
            const m = rounds[p.roundIdx]?.matches[p.matchIdx];
            if (!m) return null;
            const homeWon = m.winnerId === m.homeId;
            const awayWon = m.winnerId === m.awayId;
            const isSel = sel?.r === p.roundIdx && sel?.m === p.matchIdx;
            return (
              <button key={`${p.roundIdx}-${p.matchIdx}`}
                className={`rd-symbox ${isSel ? 'sel' : ''} ${p.side === 'C' ? 'final' : ''}`}
                style={{ left: p.x, top: p.y, width: CARD_W, height: p.cardH }}
                onClick={() => { if (!dragging.current) setSel(isSel ? null : { r: p.roundIdx, m: p.matchIdx }); }}>
                <div className={`rd-side ${homeWon ? 'won' : 'lost'} ${m.homeId === favoriteTeam ? 'fav' : ''}`}>
                  <span className={`fi fi-${flag(m.homeId)} rd2-bracket-flag`} aria-hidden />
                  <span className="rd-side-name">{name(m.homeId)}</span>
                  <span className="rd-side-goal">{m.homeGoals}</span>
                </div>
                <div className="rd-symbox-div" />
                <div className={`rd-side ${awayWon ? 'won' : 'lost'} ${m.awayId === favoriteTeam ? 'fav' : ''}`}>
                  <span className={`fi fi-${flag(m.awayId)} rd2-bracket-flag`} aria-hidden />
                  <span className="rd-side-name">{name(m.awayId)}</span>
                  <span className="rd-side-goal">{m.awayGoals}</span>
                </div>
                {m.penalties && <span className="rd-pen">rigori</span>}
              </button>
            );
          })}
        </div>
      </div>
      {selMatch && <MatchDetail match={selMatch} name={name} flag={flag} onClose={() => setSel(null)} />}
    </div>
  );
}

function MatchDetail({ match, name, flag, onClose }: {
  match: MatchResult; name: (id: string) => string; flag: (id: string) => string; onClose: () => void;
}) {
  const probHome = match.winProbHome ?? 0.5;
  const homeWon = match.winnerId === match.homeId;
  return (
    <div className="rd-detail-panel">
      <button className="rd-detail-close" onClick={onClose}>×</button>
      <div className="rd-detail-teams">
        <div className={`rd-detail-team ${homeWon ? 'won' : ''}`}>
          <span className={`fi fi-${flag(match.homeId)}`} aria-hidden />
          <span className="rd-detail-name">{name(match.homeId)}</span>
          <span className="rd-detail-goal">{match.homeGoals}</span>
        </div>
        <span className="rd-detail-vs">–</span>
        <div className={`rd-detail-team ${!homeWon ? 'won' : ''}`}>
          <span className="rd-detail-goal">{match.awayGoals}</span>
          <span className="rd-detail-name">{name(match.awayId)}</span>
          <span className={`fi fi-${flag(match.awayId)}`} aria-hidden />
        </div>
      </div>
      <div className="rd-detail-stats">
        <div className="rd-detail-prob">
          <span>{name(match.homeId)} {pctInt(probHome)}</span>
          <span className="rd-detail-probbar">
            <span className="rd-detail-probfill" style={{ width: `${probHome * 100}%` }} />
          </span>
          <span>{pctInt(1 - probHome)} {name(match.awayId)}</span>
        </div>
        <div className="rd-detail-odds">
          Quote: <strong>@{oddsFromProb(probHome)}</strong> / <strong>@{oddsFromProb(1 - probHome)}</strong>
          {match.penalties && <span className="rd-detail-pen"> · deciso ai rigori</span>}
        </div>
      </div>
    </div>
  );
}

/* ────────────────── GIRONI ────────────────── */
function GroupsDetail({ sample, teamsById, favoriteTeam }: {
  sample: SampleRun; teamsById: Map<string, Team>; favoriteTeam?: string | null;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const name = (id: string) => teamsById.get(id)?.name ?? id;
  const flag = (id: string) => teamsById.get(id)?.flag ?? '';

  // Calcola le migliori terze: le squadre con idx === 2 in ogni girone, ordinate per punti/DR
  const thirdPlaces = GROUPS.map(g => {
    const s = sample.groupStandings[g] ?? [];
    return s[2] ? { ...s[2], group: g } : null;
  }).filter(Boolean) as (typeof sample.groupStandings['A'][number] & { group: string })[];
  thirdPlaces.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
  const qualifiedThirds = new Set(thirdPlaces.slice(0, 8).map(t => t.teamId));

  return (
    <div className="rd2-groups-root">
      {GROUPS.map(g => {
        const standings = sample.groupStandings[g] ?? [];
        const matches   = sample.groupResults[g] ?? [];
        const isOpen    = openGroup === g;

        return (
          <div key={g} className={`rd2-group ${isOpen ? 'rd2-group--open' : ''}`}>
            {/* Header girone: label + header colonne + toggle */}
            <div className="rd2-group-head" onClick={() => setOpenGroup(isOpen ? null : g)}>
              <span className="rd2-group-label">Girone {g}</span>
              <div className="rd2-group-standings">
                {/* Header colonne */}
                <div className="rd2-standings-header">
                  <span className="rd2-sh-name">Squadra</span>
                  <span className="rd2-sh-num">Pt</span>
                  <span className="rd2-sh-num">GF</span>
                  <span className="rd2-sh-num">GS</span>
                  <span className="rd2-sh-num">DR</span>
                </div>
                {standings.map((s, idx) => {
                  const t = teamsById.get(s.teamId);
                  const isQualified = idx < 2 || qualifiedThirds.has(s.teamId);
                  const isFav = s.teamId === favoriteTeam;
                  const isThird = idx === 2 && qualifiedThirds.has(s.teamId);
                  return (
                    <div key={s.teamId}
                      className={`rd2-standing-row ${isQualified ? 'qualified' : ''} ${isThird ? 'third' : ''} ${isFav ? 'fav' : ''}`}>
                      <span className="rd2-st-pos">{idx + 1}</span>
                      <span className={`fi fi-${t?.flag ?? flag(s.teamId)} rd2-st-flag`} aria-hidden />
                      <span className="rd2-st-name">{t?.name ?? s.teamId}</span>
                      <span className="rd2-st-pts">{s.points}</span>
                      <span className="rd2-st-gf">{s.goalsFor}</span>
                      <span className="rd2-st-gs">{s.goalsAgainst}</span>
                      <span className={`rd2-st-dr ${s.goalDifference > 0 ? 'pos' : s.goalDifference < 0 ? 'neg' : ''}`}>
                        {s.goalDifference > 0 ? '+' : ''}{s.goalDifference}
                      </span>
                    </div>
                  );
                })}
              </div>
              <button className="rd2-group-toggle" aria-label={isOpen ? 'Chiudi' : 'Vedi partite'}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.22s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
                {isOpen ? 'Chiudi' : 'Partite'}
              </button>
            </div>

            {/* Partite espandibili */}
            {isOpen && (
              <div className="rd2-matches">
                {matches.map((m, i) => {
                  const ph = m.winProbHome ?? 0.5;
                  const hw = m.homeGoals > m.awayGoals;
                  const aw = m.awayGoals > m.homeGoals;
                  const ht = teamsById.get(m.homeId);
                  const at = teamsById.get(m.awayId);
                  return (
                    <div key={i} className="rd2-match">
                      {/* Casa */}
                      <div className={`rd2-mt-home ${hw ? 'won' : ''} ${m.homeId === favoriteTeam ? 'fav' : ''}`}>
                        <span className={`fi fi-${ht?.flag ?? flag(m.homeId)} rd2-match-flag`} aria-hidden />
                        <span className="rd2-mt-name">{ht?.name ?? name(m.homeId)}</span>
                      </div>
                      {/* Probabilità casa */}
                      <span className="rd2-mt-prob">{pctInt(ph)}</span>
                      {/* Punteggio */}
                      <div className={`rd2-mt-score ${hw ? 'hw' : aw ? 'aw' : ''}`}>
                        {m.homeGoals}–{m.awayGoals}
                        {m.penalties && <span className="rd2-match-rig">rig</span>}
                      </div>
                      {/* Probabilità away */}
                      <span className="rd2-mt-prob rd2-mt-prob--r">{pctInt(1 - ph)}</span>
                      {/* Away */}
                      <div className={`rd2-mt-away ${aw ? 'won' : ''} ${m.awayId === favoriteTeam ? 'fav' : ''}`}>
                        <span className={`fi fi-${at?.flag ?? flag(m.awayId)} rd2-match-flag`} aria-hidden />
                        <span className="rd2-mt-name">{at?.name ?? name(m.awayId)}</span>
                      </div>
                      {/* Quota su riga sotto */}
                      <span className="rd2-mt-quota">@{oddsFromProb(ph)} · @{oddsFromProb(1 - ph)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
