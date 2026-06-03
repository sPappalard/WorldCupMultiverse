import { useEffect, useMemo, useRef, useState } from 'react';
import type { Team, H2HRecord, ModelParams, TeamStats, ModulatorConfig } from '../../engine/types';
import { computeStrengthScores, type TeamStrengthScore } from '../../engine/strengthScore';

const LAST_REAL_MATCH_DATE = '31 marzo 2026';

interface Props {
  teams: Team[];
  h2h: Map<string, H2HRecord>;
  italyActive: boolean;
  params: ModelParams | null;
  paramsSource: 'bayesian' | 'elo-fallback';
  teamStats: Map<string, TeamStats>;
  modulators: ModulatorConfig;
  rankByStrength?: boolean;
  onConsumeRankByStrength?: () => void;
}

type SortKey = 'group' | 'elo' | 'squadValue' | 'attack' | 'defense' | 'form' | 'knockout' | 'history' | 'name' | 'strength';

function h2hKey(a: string, b: string) { return [a, b].sort().join('|'); }
function eloBar(v: number)    { return Math.max(0, Math.min(100, ((v - 1400) / 800) * 100)); }
function valueBar(v: number)  { return Math.max(0, Math.min(100, (v / 1500) * 100)); }
function strengthBar(v: number){ return Math.max(0, Math.min(100, ((v + 0.6) / 1.8) * 100)); }
function strengthScore(v: number){ return Math.round(Math.max(0, Math.min(100, ((v + 0.6) / 1.8) * 100))); }

function eloTier(elo: number): { label: string; cls: string } {
  if (elo >= 2100) return { label: 'Elite',    cls: 'tier-elite' };
  if (elo >= 1950) return { label: 'Top',       cls: 'tier-top' };
  if (elo >= 1820) return { label: 'Contender', cls: 'tier-contender' };
  if (elo >= 1650) return { label: 'Solid',     cls: 'tier-solid' };
  return               { label: 'Outsider',  cls: 'tier-outsider' };
}
function strengthScoreTier(s: number): string {
  if (s >= 80) return 'tier-elite';
  if (s >= 60) return 'tier-top';
  if (s >= 40) return 'tier-contender';
  if (s >= 20) return 'tier-solid';
  return 'tier-outsider';
}

/* Valore numerico del sort corrente — mostrato nella card come statistica principale */
function getSortValue(team: Team, sortKey: SortKey, params: ModelParams | null, teamStats: Map<string, TeamStats>, strengthScores: Map<string, TeamStrengthScore>): { value: string; label: string } | null {
  const tp = params?.teams[team.id];
  const ts = teamStats.get(team.id);
  const sc = strengthScores.get(team.id);
  switch (sortKey) {
    case 'strength':   return sc ? { value: String(sc.score), label: 'Forza' } : null;
    case 'elo':        return { value: String(team.elo), label: 'Elo' };
    case 'squadValue': return team.squadValue != null ? { value: `€${team.squadValue}M`, label: 'Rosa' } : null;
    case 'attack':     return tp ? { value: String(strengthScore(tp.attack)), label: 'Attacco' } : null;
    case 'defense':    return tp ? { value: String(strengthScore(tp.defense)), label: 'Difesa' } : null;
    case 'form':       return ts ? { value: String(Math.round(ts.form.score)), label: 'Forma' } : null;
    case 'knockout':   return ts ? { value: String(Math.round(ts.knockout.score)), label: 'KO Exp' } : null;
    case 'history':    return ts ? { value: String(Math.round(ts.history.score)), label: 'Storia' } : null;
    case 'group':      return { value: `Girone ${team.group}`, label: '' };
    default:           return null;
  }
}

function H2HBadge({ rec, teamIsFirstAlpha }: { rec: H2HRecord | null; teamIsFirstAlpha: boolean }) {
  if (!rec || rec.n === 0) return <span className="h2h-badge h2h-unknown">Nessun precedente</span>;
  const w = teamIsFirstAlpha ? rec.w_a : rec.w_b;
  const l = teamIsFirstAlpha ? rec.w_b : rec.w_a;
  const cls = w > l ? 'h2h-pos' : l > w ? 'h2h-neg' : 'h2h-neutral';
  return <span className={`h2h-badge ${cls}`}>{w}V – {rec.d}P – {l}S <span className="h2h-n">({rec.n})</span></span>;
}

function DetailStat({ label, value, pct, barCls, sub }: {
  label: string; value: string; pct?: number; barCls?: string; sub?: string;
}) {
  return (
    <div className="tpd-stat">
      <div className="tpd-stat-header">
        <span className="tpd-stat-label">{label}</span>
        <span className="tpd-stat-value">{value}</span>
      </div>
      {pct !== undefined && barCls && (
        <div className="tpd-stat-bar-bg">
          <div className={`tpd-stat-bar-fill ${barCls}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {sub && <span className="tpd-stat-sub">{sub}</span>}
    </div>
  );
}

export function TeamsPage({ teams, h2h, italyActive, params, paramsSource, teamStats, modulators, rankByStrength, onConsumeRankByStrength }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('strength');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch]   = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const visibleTeams = useMemo(() => teams.filter((t) => {
    if (!t.active) return italyActive && t.id === 'ITA';
    if (italyActive && t.substituteFor) return false;
    return true;
  }), [teams, italyActive]);

  const allIds = useMemo(() => visibleTeams.map(t => t.id), [visibleTeams]);

  const strengthScores = useMemo(() => {
    const list = computeStrengthScores({ teams, params, h2h, teamStats, modulators, includeItaly: italyActive });
    return new Map<string, TeamStrengthScore>(list.map(s => [s.teamId, s]));
  }, [teams, params, h2h, teamStats, modulators, italyActive]);

  useEffect(() => {
    if (rankByStrength) { setSortKey('strength'); onConsumeRankByStrength?.(); }
  }, [rankByStrength, onConsumeRankByStrength]);

  const sorted = useMemo(() => {
    const filtered = visibleTeams.filter(t =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase()),
    );
    return [...filtered].sort((a, b) => {
      const sa = teamStats.get(a.id), sb = teamStats.get(b.id);
      const pa = params?.teams[a.id], pb = params?.teams[b.id];
      switch (sortKey) {
        case 'elo':        return b.elo - a.elo;
        case 'squadValue': return (b.squadValue ?? 0) - (a.squadValue ?? 0);
        case 'name':       return a.name.localeCompare(b.name, 'it');
        case 'attack':     return (pb?.attack ?? 0) - (pa?.attack ?? 0);
        case 'defense':    return (pb?.defense ?? 0) - (pa?.defense ?? 0);
        case 'form':       return (sb?.form.score ?? 50) - (sa?.form.score ?? 50);
        case 'knockout':   return (sb?.knockout.score ?? 50) - (sa?.knockout.score ?? 50);
        case 'history':    return (sb?.history.score ?? 0) - (sa?.history.score ?? 0);
        case 'strength':   return (strengthScores.get(b.id)?.avgWinRate ?? 0) - (strengthScores.get(a.id)?.avgWinRate ?? 0);
        default:           return a.group.localeCompare(b.group) || b.elo - a.elo;
      }
    });
  }, [visibleTeams, sortKey, search, params, teamStats, strengthScores]);

  const selected = useMemo(() =>
    selectedId ? visibleTeams.find(t => t.id === selectedId) ?? null : null,
    [selectedId, visibleTeams],
  );
  const selectedGroupTeams = useMemo(() =>
    selected ? visibleTeams.filter(t => t.group === selected.group) : [],
    [selected, visibleTeams],
  );
  const selectedH2HSummary = useMemo(() => {
    if (!selected) return null;
    let w = 0, d = 0, l = 0, n = 0;
    for (const oppId of allIds) {
      if (oppId === selected.id) continue;
      const rec = h2h.get(h2hKey(selected.id, oppId));
      if (!rec) continue;
      const isA = selected.id < oppId;
      w += isA ? rec.w_a : rec.w_b;
      d += rec.d;
      l += isA ? rec.w_b : rec.w_a;
      n += rec.n;
    }
    return { w, d, l, n };
  }, [selected, allIds, h2h]);

  // Classifiche: generano un rank numerico
  const RANK_SORTS: { key: SortKey; label: string; needsParams?: boolean; needsStats?: boolean }[] = [
    { key: 'strength',   label: 'Forza' },
    { key: 'elo',        label: 'Elo' },
    { key: 'attack',     label: 'Attacco',  needsParams: true },
    { key: 'defense',    label: 'Difesa',   needsParams: true },
    { key: 'form',       label: 'Forma',    needsStats: true },
    { key: 'knockout',   label: 'KO Exp',   needsStats: true },
    { key: 'history',    label: 'Storia',   needsStats: true },
    { key: 'squadValue', label: 'Valore' },
  ];
  // Raggruppamento: non generano una classifica numerica
  const GROUP_SORTS: { key: SortKey; label: string }[] = [
    { key: 'group', label: 'Girone' },
    { key: 'name',  label: 'A→Z' },
  ];
  const isRankSort = RANK_SORTS.some(s => s.key === sortKey);

  function handleSelectTeam(id: string) {
    if (selectedId === id) { setSelectedId(null); return; }
    setSelectedId(id);
    // Scroll la lista in cima quando si apre il dettaglio
    if (listRef.current) listRef.current.scrollTop = 0;
  }

  const isGridMode = !selected;

  return (
    <div className="tp2-root">

      {/* ── Barra filtri ── */}
      <div className="tp2-filter-bar">
        {/* Classifiche (generano rank numerico) */}
        <div className="tp2-filter-group">
          <span className="tp2-filter-label">Classifica per</span>
          <div className="tp2-tabs">
            {RANK_SORTS.map(({ key, label, needsParams, needsStats }) => {
              const disabled = (needsParams && !params) || (needsStats && teamStats.size === 0);
              return (
                <button key={key}
                  className={`tp2-tab ${sortKey === key ? 'on' : ''} ${disabled ? 'off' : ''}`}
                  onClick={() => { if (!disabled) setSortKey(key); }}
                  disabled={disabled}
                  title={disabled ? 'Dati non disponibili' : undefined}
                >{label}</button>
              );
            })}
          </div>
        </div>

        {/* Raggruppa + Search — a destra */}
        <div className="tp2-filter-right">
          {/* Raggruppa */}
          <div className="tp2-filter-group tp2-filter-group--group">
            <span className="tp2-filter-label tp2-filter-label--dim">Raggruppa</span>
            <div className="tp2-tabs tp2-tabs--group">
              {GROUP_SORTS.map(({ key, label }) => (
                <button key={key}
                  className={`tp2-tab tp2-tab--group ${sortKey === key ? 'on' : ''}`}
                  onClick={() => setSortKey(key)}
                >{label}</button>
              ))}
            </div>
          </div>
          {/* Search */}
          <div className="tp2-search-wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input className="tp2-search" placeholder="Cerca…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── Corpo ── */}
      <div className={`tp2-body ${isGridMode ? 'tp2-body--grid' : 'tp2-body--split'}`}>

        {/* Lista / Griglia */}
        <div className="tp2-list" ref={listRef}>
          <TeamList
            sorted={sorted}
            sortKey={sortKey}
            isRankSort={isRankSort}
            isGridMode={isGridMode}
            selectedId={selectedId}
            params={params}
            teamStats={teamStats}
            strengthScores={strengthScores}
            onSelect={handleSelectTeam}
          />
        </div>

        {/* Pannello dettaglio — solo in split mode */}
        {!isGridMode && selected && (
          <div className="tp2-detail">
            <TeamDetail
              team={selected}
              params={params}
              paramsSource={paramsSource}
              teamStats={teamStats}
              strengthScores={strengthScores}
              groupH2H={selectedGroupTeams.filter(t => t.id !== selected.id).map(opp => ({
                opp, rec: h2h.get(h2hKey(selected.id, opp.id)) ?? null,
              }))}
              h2hSummary={selectedH2HSummary}
              onClose={() => setSelectedId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════ TEAM LIST ═══════════════════════════ */
const GROUPS_ORDER = ['A','B','C','D','E','F','G','H','I','J','K','L'];

interface TeamListProps {
  sorted: ReturnType<typeof Array.prototype.filter> extends never ? never : Team[];
  sortKey: SortKey;
  isRankSort: boolean;
  isGridMode: boolean;
  selectedId: string | null;
  params: ModelParams | null;
  teamStats: Map<string, TeamStats>;
  strengthScores: Map<string, TeamStrengthScore>;
  onSelect: (id: string) => void;
}

function TeamList({ sorted, sortKey, isRankSort, isGridMode, selectedId, params, teamStats, strengthScores, onSelect }: TeamListProps) {
  if (sorted.length === 0) return <p className="tp2-empty">Nessuna squadra trovata.</p>;

  const isGroupSort = sortKey === 'group';

  /* Raggruppamento per girone */
  if (isGroupSort) {
    const byGroup = new Map<string, Team[]>();
    for (const t of sorted) {
      if (!byGroup.has(t.group)) byGroup.set(t.group, []);
      byGroup.get(t.group)!.push(t);
    }
    const groups = GROUPS_ORDER.filter(g => byGroup.has(g));

    return (
      <>
        {groups.map(g => (
          <div key={g} className="tp2-group-section">
            <div className="tp2-group-header">
              <span className="tp2-group-letter">{g}</span>
              <span className="tp2-group-title">Girone {g}</span>
            </div>
            <div className={isGridMode ? 'tp2-group-grid' : 'tp2-group-rows'}>
              {byGroup.get(g)!.map(team =>
                isGridMode
                  ? <TeamCard key={team.id} team={team} sortKey={sortKey} rank={null} params={params} teamStats={teamStats} strengthScores={strengthScores} onSelect={onSelect} />
                  : <TeamRow  key={team.id} team={team} sortKey={sortKey} rank={null} isSelected={team.id === selectedId} params={params} teamStats={teamStats} strengthScores={strengthScores} onSelect={onSelect} />
              )}
            </div>
          </div>
        ))}
      </>
    );
  }

  /* Lista piatta con rank (classifica o A→Z) */
  return (
    <>
      {sorted.map((team, idx) =>
        isGridMode
          ? <TeamCard key={team.id} team={team} sortKey={sortKey} rank={isRankSort ? idx + 1 : null} params={params} teamStats={teamStats} strengthScores={strengthScores} onSelect={onSelect} />
          : <TeamRow  key={team.id} team={team} sortKey={sortKey} rank={isRankSort ? idx + 1 : null} isSelected={team.id === selectedId} params={params} teamStats={teamStats} strengthScores={strengthScores} onSelect={onSelect} />
      )}
    </>
  );
}

/* ── Card (modalità griglia) ── */
interface CardProps {
  team: Team; sortKey: SortKey; rank: number | null;
  params: ModelParams | null; teamStats: Map<string, TeamStats>;
  strengthScores: Map<string, TeamStrengthScore>; onSelect: (id: string) => void;
}
function TeamCard({ team, sortKey, rank, params, teamStats, strengthScores, onSelect }: CardProps) {
  const isItaly = team.id === 'ITA';
  const sortVal = getSortValue(team, sortKey, params, teamStats, strengthScores);

  return (
    <button className={`tp2-card ${isItaly ? 'italy' : ''}`} onClick={() => onSelect(team.id)}>
      {/* Rank prominente */}
      {rank !== null && (
        <span className={`tp2-card-rank${rank === 1 ? ' tp2-rank--gold' : rank === 2 ? ' tp2-rank--silver' : rank === 3 ? ' tp2-rank--bronze' : ''}`}>
          {rank}
        </span>
      )}
      <span className={`fi fi-${team.flag} tp2-card-flag`} aria-hidden />
      <div className="tp2-card-info">
        <span className="tp2-card-name">{team.name}</span>
        {isItaly && <span className="tp2-card-whatif">what-if</span>}
      </div>
      {sortVal && sortKey !== 'group' && (
        <div className="tp2-card-stat">
          <span className="tp2-card-stat-value">{sortVal.value}</span>
          {sortVal.label && <span className="tp2-card-stat-label">{sortVal.label}</span>}
        </div>
      )}
    </button>
  );
}

/* ── Row (modalità split) ── */
interface RowProps extends CardProps { isSelected: boolean; }
function TeamRow({ team, sortKey, rank, isSelected, params, teamStats, strengthScores, onSelect }: RowProps) {
  const isItaly = team.id === 'ITA';
  const sortVal = getSortValue(team, sortKey, params, teamStats, strengthScores);

  return (
    <button className={`tp2-row ${isSelected ? 'selected' : ''} ${isItaly ? 'italy' : ''}`} onClick={() => onSelect(team.id)}>
      {rank !== null && (
        <span className={`tp2-row-rank${rank === 1 ? ' tp2-rank--gold' : rank === 2 ? ' tp2-rank--silver' : rank === 3 ? ' tp2-rank--bronze' : ''}`}>{rank}</span>
      )}
      <span className={`fi fi-${team.flag} tp2-row-flag`} aria-hidden />
      <div className="tp2-row-info">
        <span className="tp2-row-name">{team.name}</span>
        {isItaly && <span className="tp2-row-whatif">what-if</span>}
      </div>
      {sortVal && sortKey !== 'group' && <span className="tp2-row-val">{sortVal.value}</span>}
      <svg className={`tp2-row-chevron ${isSelected ? 'open' : ''}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </button>
  );
}

/* ═══════════════════════════ TEAM DETAIL ═══════════════════════════ */
interface DetailProps {
  team: Team;
  params: ModelParams | null;
  paramsSource: 'bayesian' | 'elo-fallback';
  teamStats: Map<string, TeamStats>;
  strengthScores: Map<string, TeamStrengthScore>;
  groupH2H: { opp: Team; rec: H2HRecord | null }[];
  h2hSummary: { w: number; d: number; l: number; n: number } | null;
  onClose: () => void;
}

function TeamDetail({ team, params, paramsSource, teamStats, strengthScores, groupH2H, h2hSummary, onClose }: DetailProps) {
  const [tab, setTab] = useState<'stats' | 'h2h'>('stats');
  const tp  = params?.teams[team.id];
  const ts  = teamStats.get(team.id);
  const sc  = strengthScores.get(team.id);
  const tier = eloTier(team.elo);

  return (
    <div className="tpd-root">

      {/* Header con bandiera grande e nome */}
      <div className="tpd-header">
        <span className={`fi fi-${team.flag} tpd-flag`} aria-hidden />
        <div className="tpd-header-text">
          <h3 className="tpd-name">{team.name}</h3>
          <div className="tpd-badges">
            <span className={`tier-chip ${tier.cls}`}>{tier.label}</span>
            <span className="tpd-group-badge">Girone {team.group}</span>
            {team.isHost && <span className="badge badge-host">Casa</span>}
            {team.id === 'ITA' && <span className="badge badge-italy">what-if</span>}
          </div>
        </div>
        <button className="tpd-close" onClick={onClose} aria-label="Chiudi">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Banner punteggio forza */}
      {sc && (
        <div className="tpd-strength-banner">
          <div className="tpd-sb-item">
            <span className="tpd-sb-label">Punteggio Forza</span>
            <span className={`tpd-sb-value ${strengthScoreTier(sc.score)}`}>{sc.score}<span className="tpd-sb-unit">/100</span></span>
          </div>
          <div className="tpd-sb-sep" />
          <div className="tpd-sb-item">
            <span className="tpd-sb-label">Win rate medio</span>
            <span className="tpd-sb-value">{Math.round(sc.avgWinRate * 100)}<span className="tpd-sb-unit">%</span></span>
          </div>
          <div className="tpd-sb-sep" />
          <div className="tpd-sb-item">
            <span className="tpd-sb-label">Non perde vs</span>
            <span className="tpd-sb-value">{Math.round(sc.avgNotLoseRate * 100)}<span className="tpd-sb-unit">%</span></span>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="tpd-tabs">
        <button className={`tpd-tab ${tab === 'stats' ? 'on' : ''}`} onClick={() => setTab('stats')}>Parametri</button>
        <button className={`tpd-tab ${tab === 'h2h'  ? 'on' : ''}`} onClick={() => setTab('h2h')}>Scontri diretti</button>
      </div>

      <div className="tpd-body">
        {tab === 'stats' && (
          <div className="tpd-stats-grid">
            <DetailStat label="Elo" value={String(team.elo)} pct={eloBar(team.elo)} barCls="bar-elo" sub="Snapshot 19/01/2026 · eloratings.net" />
            <DetailStat label="Valore rosa" value={team.squadValue != null ? `€${team.squadValue}M` : 'N/D'} pct={team.squadValue != null ? valueBar(team.squadValue) : undefined} barCls="bar-val" sub="Stima ispirata a Transfermarkt · giu 2026" />
            {tp ? (
              <>
                <DetailStat label="Attacco" value={`${strengthScore(tp.attack)}/100`} pct={strengthBar(tp.attack)} barCls="bar-atk" sub={`log-λ: ${tp.attack.toFixed(3)}${tp.attackSd != null ? ` ± ${tp.attackSd.toFixed(3)}` : ''}`} />
                <DetailStat label="Difesa"  value={`${strengthScore(tp.defense)}/100`} pct={strengthBar(tp.defense)} barCls="bar-def" sub={`log-λ: ${tp.defense.toFixed(3)}${tp.defenseSd != null ? ` ± ${tp.defenseSd.toFixed(3)}` : ''}`} />
              </>
            ) : (
              <div className="tpd-note">Attacco/Difesa derivati da Elo — modello non fittato.</div>
            )}
            {ts && <DetailStat label="Forma recente" value={`${Math.round(ts.form.score)}/100`} pct={ts.form.score} barCls="bar-form" sub={`${ts.form.w}V ${ts.form.d}P ${ts.form.l}S su ${ts.form.n} partite${ts.form.lastDate ? ` · ultima: ${ts.form.lastDate}` : ''}`} />}
            {ts && <DetailStat label="Rendimento KO" value={`${Math.round(ts.knockout.score)}/100`} pct={ts.knockout.score} barCls="bar-ko" sub={`${ts.knockout.w}V ${ts.knockout.d}P ${ts.knockout.l}S · ${ts.knockout.n} partite KO dal 1994`} />}
            {ts && <DetailStat label="Storia nazionale" value={`${Math.round(ts.history.score)}/100`} pct={ts.history.score} barCls="bar-history" sub={ts.history.score === 0 ? 'Nessun titolo major' : ts.history.byTournament.filter(t => t.titles > 0).map(t => `${t.label}: ${'🏆'.repeat(Math.min(t.titles, 5))}`).join(' · ')} />}
            {team.isHost && (
              <div className="tpd-host-banner">
                <span className="tpd-host-icon">🏟</span>
                <div>
                  <span className="tpd-host-label">Paese ospitante</span>
                  <span className="tpd-host-sub">+35% λ gol in casa · {params?.global.homeAdv.toFixed(3) ?? '0.271'} log-λ</span>
                </div>
              </div>
            )}
            <div className="tpd-source">{paramsSource === 'bayesian' ? `Modello bayesiano · dati fino al ${LAST_REAL_MATCH_DATE}` : 'Fallback Elo — modello bayesiano non disponibile'}</div>
          </div>
        )}

        {tab === 'h2h' && (
          <div className="tpd-h2h-section">
            {h2hSummary && h2hSummary.n > 0 && (
              <div className="tpd-h2h-summary">
                <span className="tpd-h2h-sum-label">vs tutti i partecipanti</span>
                <span className="tpd-h2h-sum-record">{h2hSummary.w}V {h2hSummary.d}P {h2hSummary.l}S <span className="tpd-h2h-sum-n">· {h2hSummary.n} partite</span></span>
                <span className="tpd-h2h-sum-pct">{Math.round((h2hSummary.w / h2hSummary.n) * 100)}% win rate</span>
              </div>
            )}
            <div className="tpd-h2h-section-label">Scontri diretti · Girone {team.group}</div>
            <div className="tpd-h2h-list">
              {groupH2H.map(({ opp, rec }) => (
                <div key={opp.id} className="tpd-h2h-row">
                  <span className={`fi fi-${opp.flag} tpd-h2h-flag`} aria-hidden />
                  <span className="tpd-h2h-name">{opp.name}</span>
                  <H2HBadge rec={rec} teamIsFirstAlpha={team.id < opp.id} />
                </div>
              ))}
            </div>
            <div className="tpd-source">H2H calcolato su dati dal 1994 · 4.078 partite · 805 coppie</div>
          </div>
        )}
      </div>
    </div>
  );
}
