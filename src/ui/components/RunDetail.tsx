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
const ZOOM_STEP = 1.25;       // fattore per ogni click +/−

function CompactBracket({ sample, name, flag, favoriteTeam }: {
  sample: SampleRun; name: (id: string) => string; flag: (id: string) => string; favoriteTeam?: string | null;
}) {
  const rounds = sample.knockoutRounds;
  const [sel, setSel]           = useState<{ r: number; m: number } | null>(null);
  const [userZoom, setUserZoom] = useState<number | null>(null); // null = auto-fit (vista completa)
  const [pan, setPan]           = useState({ x: 0, y: 0 });
  const dragging                = useRef(false);
  const moved                   = useRef(false); // distingue click da trascinamento
  const dragStart               = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const selMatch = sel ? rounds[sel.r]?.matches[sel.m] : null;
  const layout = buildBracketLayout(rounds);
  const { placed, worldW, worldH } = layout;
  const vpRef  = useRef<HTMLDivElement>(null);
  const [autoScale, setAutoScale] = useState(1);
  const [vpW, setVpW] = useState(0);
  // Scala minima leggibile: su schermi stretti il fit-to-width renderebbe il
  // bracket illeggibile, quindi imponiamo un minimo e si naviga col drag.
  const MIN_READABLE = 0.62;

  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const fitScale = Math.min(1.4, (e.contentRect.width - 16) / worldW);
      setAutoScale(fitScale);
      setVpW(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [worldW]);

  // Su mobile il fit puro è troppo piccolo: parti da una scala leggibile.
  const baseScale = Math.max(autoScale, MIN_READABLE);
  const scale = userZoom ?? baseScale;
  // "Navigabile" (drag attivo) se il contenuto eccede il viewport in larghezza.
  const overflowsX = worldW * scale > vpW + 1;
  const isZoomed = (userZoom !== null && userZoom > baseScale + 0.01) || (userZoom === null && overflowsX);

  // Limita il pan: il contenuto non può uscire oltre i bordi del viewport.
  // Il viewport ha larghezza = vpW e altezza = worldH * baseScale (fissa, vista completa).
  function clampPan(p: { x: number; y: number }, s: number) {
    const scaledW = worldW * s;
    const scaledH = worldH * s;
    const vpH = worldH * baseScale;
    const minX = Math.min(0, vpW - scaledW);
    const minY = Math.min(0, vpH - scaledH);
    return {
      x: Math.max(minX, Math.min(0, p.x)),
      y: Math.max(minY, Math.min(0, p.y)),
    };
  }

  // Zoom verso il centro del viewport
  function zoomBy(factor: number) {
    setUserZoom(z => {
      const cur = z ?? baseScale;
      const next = Math.max(baseScale, Math.min(MAX_ZOOM, cur * factor));
      if (Math.abs(next - baseScale) < 0.01) { setPan(p => clampPan(p, baseScale)); return null; }
      // Mantieni il centro del viewport fisso durante lo zoom
      const cx = vpW / 2;
      const cy = (worldH * baseScale) / 2;
      setPan(p => {
        const worldX = (cx - p.x) / cur;
        const worldY = (cy - p.y) / cur;
        return clampPan({ x: cx - worldX * next, y: cy - worldY * next }, next);
      });
      return next;
    });
  }
  const zoomIn  = () => zoomBy(ZOOM_STEP);
  const zoomOut = () => zoomBy(1 / ZOOM_STEP);

  // Click e trascina per spostarsi (solo quando zoomato)
  function handleMouseDown(e: React.MouseEvent) {
    if (!isZoomed) return;
    dragging.current = true;
    moved.current = false;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true;
    setPan(clampPan({ x: dragStart.current.px + dx, y: dragStart.current.py + dy }, scale));
  }
  function handleMouseUp() { dragging.current = false; }

  function resetView() { setUserZoom(null); setPan({ x: 0, y: 0 }); }

  return (
    <div className="rd-bracket-wrap">
      {/* Controlli zoom manuali */}
      <div className="rd-bracket-controls">
        <span className="rd-bracket-hint">
          {isZoomed
            ? 'Trascina per spostarti · clicca una partita per i dettagli'
            : 'Usa + per ingrandire · clicca una partita per i dettagli'}
        </span>
        <div className="rd-bracket-ctrl-group">
          <button className="rd-bracket-ctrl" onClick={zoomOut} disabled={scale <= baseScale + 0.01} title="Riduci" aria-label="Riduci">−</button>
          <button className="rd-bracket-ctrl" onClick={zoomIn} disabled={scale >= MAX_ZOOM - 0.01} title="Ingrandisci" aria-label="Ingrandisci">+</button>
          {(userZoom !== null && userZoom > baseScale + 0.01) && <button className="rd2-zoom-reset" onClick={resetView}>Reset</button>}
        </div>
      </div>

      <div
        className="rd-symbracket-vp"
        ref={vpRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          // Altezza fissa alla vista completa: lo zoom espande il contenuto
          // dentro un viewport stabile, così il pan ha senso su entrambi gli assi.
          height: worldH * baseScale + 16,
          overflow: 'hidden',
          userSelect: 'none',
          cursor: isZoomed ? (dragging.current ? 'grabbing' : 'grab') : 'default',
        }}
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
                onClick={() => { if (!moved.current) setSel(isSel ? null : { r: p.roundIdx, m: p.matchIdx }); }}>
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
  const [activeGroup, setActiveGroup] = useState<string>('A');
  const name = (id: string) => teamsById.get(id)?.name ?? id;
  const flag = (id: string) => teamsById.get(id)?.flag ?? '';

  const thirdPlaces = GROUPS.map(g => {
    const s = sample.groupStandings[g] ?? [];
    return s[2] ? { ...s[2], group: g } : null;
  }).filter(Boolean) as (typeof sample.groupStandings['A'][number] & { group: string })[];
  thirdPlaces.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
  const qualifiedThirds = new Set(thirdPlaces.slice(0, 8).map(t => t.teamId));

  const standings = sample.groupStandings[activeGroup] ?? [];
  const matches   = sample.groupResults[activeGroup] ?? [];

  return (
    <div className="gd-root">
      {/* Selettore gironi */}
      <div className="gd-selector">
        {GROUPS.map(g => {
          const hasItaly = (sample.groupStandings[g] ?? []).some(s => s.teamId === 'ITA');
          return (
            <button
              key={g}
              className={`gd-sel-btn ${g === activeGroup ? 'on' : ''} ${hasItaly ? 'italy' : ''}`}
              onClick={() => setActiveGroup(g)}
            >
              {g}
            </button>
          );
        })}
      </div>

      {/* Contenuto girone selezionato */}
      <div className="gd-body" key={activeGroup}>

        {/* Classifica */}
        <div className="gd-standings">
          <div className="gd-standings-title">Classifica · Girone {activeGroup}</div>
          {/* Intestazione colonne */}
          <div className="gd-row gd-row--head">
            <span className="gd-pos" />
            <span className="gd-flag-h" />
            <span className="gd-name gd-head-name">Squadra</span>
            <span className="gd-num gd-head">Pt</span>
            <span className="gd-num gd-head">GF</span>
            <span className="gd-num gd-head">GS</span>
            <span className="gd-num gd-head">DR</span>
          </div>
          {standings.map((s, idx) => {
            const t = teamsById.get(s.teamId);
            const isQual  = idx < 2 || qualifiedThirds.has(s.teamId);
            const isThird = idx === 2 && qualifiedThirds.has(s.teamId);
            const isFav   = s.teamId === favoriteTeam;
            return (
              <div key={s.teamId} className={`gd-row ${isQual ? (isThird ? 'third' : 'qual') : ''} ${isFav ? 'fav' : ''}`}>
                <span className="gd-pos">{idx + 1}</span>
                <span className={`fi fi-${t?.flag ?? flag(s.teamId)} gd-flag`} aria-hidden />
                <span className="gd-name">{t?.name ?? s.teamId}</span>
                <span className="gd-num gd-pts">{s.points}</span>
                <span className="gd-num">{s.goalsFor}</span>
                <span className="gd-num">{s.goalsAgainst}</span>
                <span className={`gd-num gd-dr ${s.goalDifference > 0 ? 'pos' : s.goalDifference < 0 ? 'neg' : ''}`}>
                  {s.goalDifference > 0 ? '+' : ''}{s.goalDifference}
                </span>
              </div>
            );
          })}
          <div className="gd-standings-legend">
            <span className="gd-leg gd-leg--qual">Qualificate (1ª-2ª)</span>
            <span className="gd-leg gd-leg--third">Migliore terza</span>
          </div>
        </div>

        {/* Partite */}
        <div className="gd-matches">
          <div className="gd-matches-title">Partite · Girone {activeGroup}</div>
          {matches.map((m, i) => {
            const ph  = m.winProbHome ?? 0.5;
            const hw  = m.homeGoals > m.awayGoals;
            const aw  = m.awayGoals > m.homeGoals;
            const ht  = teamsById.get(m.homeId);
            const at  = teamsById.get(m.awayId);
            return (
              <div key={i} className="gd-match">
                <div className={`gd-team gd-team--home ${hw ? 'won' : aw ? 'lost' : ''} ${m.homeId === favoriteTeam ? 'fav' : ''}`}>
                  <span className={`fi fi-${ht?.flag ?? flag(m.homeId)} gd-mflag`} aria-hidden />
                  <span className="gd-mname">{ht?.name ?? name(m.homeId)}</span>
                </div>
                <div className="gd-score-block">
                  <div className={`gd-score ${hw ? 'hw' : aw ? 'aw' : 'draw'}`}>
                    <span className={hw ? 'bold' : ''}>{m.homeGoals}</span>
                    <span className="gd-score-sep">–</span>
                    <span className={aw ? 'bold' : ''}>{m.awayGoals}</span>
                    {m.penalties && <span className="gd-pen">rig</span>}
                  </div>
                  <div className="gd-probbar">
                    <div className="gd-probbar-home" style={{ width: `${ph * 100}%` }} />
                  </div>
                  <div className="gd-odds">{oddsFromProb(ph)} · {oddsFromProb(1-ph)}</div>
                </div>
                <div className={`gd-team gd-team--away ${aw ? 'won' : hw ? 'lost' : ''} ${m.awayId === favoriteTeam ? 'fav' : ''}`}>
                  <span className="gd-mname">{at?.name ?? name(m.awayId)}</span>
                  <span className={`fi fi-${at?.flag ?? flag(m.awayId)} gd-mflag`} aria-hidden />
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
