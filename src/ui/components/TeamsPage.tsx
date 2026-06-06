import { useEffect, useMemo, useRef, useState } from 'react';
import type { Team, H2HRecord, ModelParams, TeamStats, ModulatorConfig } from '../../engine/types';
import { computeStrengthScores, type TeamStrengthScore } from '../../engine/strengthScore';
import { useT, useTeamName } from '../../i18n';

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

function eloTier(elo: number): { cls: string; label: string } {
  if (elo >= 2100) return { cls: 'tier-elite',     label: 'Elite' };
  if (elo >= 1950) return { cls: 'tier-top',       label: 'Top' };
  if (elo >= 1820) return { cls: 'tier-contender', label: 'Contender' };
  if (elo >= 1650) return { cls: 'tier-solid',     label: 'Solid' };
  return               { cls: 'tier-outsider',  label: 'Outsider' };
}
function strengthScoreTier(s: number): string {
  if (s >= 80) return 'tier-elite';
  if (s >= 60) return 'tier-top';
  if (s >= 40) return 'tier-contender';
  if (s >= 20) return 'tier-solid';
  return 'tier-outsider';
}

/* Numeric value of the current sort — shown on the card as the main stat. */
function getSortValue(team: Team, sortKey: SortKey, params: ModelParams | null, teamStats: Map<string, TeamStats>, strengthScores: Map<string, TeamStrengthScore>, tFn: (k: string, v?: Record<string, string | number>) => string): { value: string; label: string } | null {
  const tp = params?.teams[team.id];
  const ts = teamStats.get(team.id);
  const sc = strengthScores.get(team.id);
  switch (sortKey) {
    case 'strength':   return sc ? { value: String(sc.score), label: tFn('teams.cardStat.strength') } : null;
    case 'elo':        return { value: String(team.elo), label: tFn('teams.cardStat.elo') };
    case 'squadValue': return team.squadValue != null ? { value: `€${team.squadValue}M`, label: tFn('teams.cardStat.squadValue') } : null;
    case 'attack':     return tp ? { value: String(strengthScore(tp.attack)), label: tFn('teams.cardStat.attack') } : null;
    case 'defense':    return tp ? { value: String(strengthScore(tp.defense)), label: tFn('teams.cardStat.defense') } : null;
    case 'form':       return ts ? { value: String(Math.round(ts.form.score)), label: tFn('teams.cardStat.form') } : null;
    case 'knockout':   return ts ? { value: String(Math.round(ts.knockout.score)), label: tFn('teams.cardStat.knockout') } : null;
    case 'history':    return ts ? { value: String(Math.round(ts.history.score)), label: tFn('teams.cardStat.history') } : null;
    case 'group':      return { value: tFn('teams.group', { g: team.group }), label: '' };
    default:           return null;
  }
}

function H2HBadge({ rec, teamIsFirstAlpha }: { rec: H2HRecord | null; teamIsFirstAlpha: boolean }) {
  const { t } = useT();
  if (!rec || rec.n === 0) return <span className="h2h-badge h2h-unknown">{t('teams.h2h.none')}</span>;
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
  const { t } = useT();
  const teamName = useTeamName();
  const [sortKey, setSortKey] = useState<SortKey>('strength');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch]   = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const visibleTeams = useMemo(() => teams.filter((t) => {
    if (!t.active) return t.id === 'ITA'; // Italy always visible (with what-if badge)
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
      teamName(t).toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase()),
    );
    return [...filtered].sort((a, b) => {
      const sa = teamStats.get(a.id), sb = teamStats.get(b.id);
      const pa = params?.teams[a.id], pb = params?.teams[b.id];
      switch (sortKey) {
        case 'elo':        return b.elo - a.elo;
        case 'squadValue': return (b.squadValue ?? 0) - (a.squadValue ?? 0);
        case 'name':       return teamName(a).localeCompare(teamName(b));
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

  // Rankings: produce a numeric rank.
  const RANK_SORTS: { key: SortKey; labelKey: string; needsParams?: boolean; needsStats?: boolean }[] = [
    { key: 'strength',   labelKey: 'teams.sort.strength' },
    { key: 'elo',        labelKey: 'teams.sort.elo' },
    { key: 'attack',     labelKey: 'teams.sort.attack',  needsParams: true },
    { key: 'defense',    labelKey: 'teams.sort.defense', needsParams: true },
    { key: 'form',       labelKey: 'teams.sort.form',    needsStats: true },
    { key: 'knockout',   labelKey: 'teams.sort.knockout',needsStats: true },
    { key: 'history',    labelKey: 'teams.sort.history', needsStats: true },
    { key: 'squadValue', labelKey: 'teams.sort.squadValue' },
  ];
  const GROUP_SORTS: { key: SortKey; labelKey: string }[] = [
    { key: 'group', labelKey: 'teams.sort.group' },
    { key: 'name',  labelKey: 'teams.sort.az' },
  ];
  const isRankSort = RANK_SORTS.some(s => s.key === sortKey);

  function handleSelectTeam(id: string) {
    if (selectedId === id) { setSelectedId(null); return; }
    setSelectedId(id);
    // Scroll the list to the top when the detail opens.
    if (listRef.current) listRef.current.scrollTop = 0;
  }

  const isGridMode = !selected;

  return (
    <div className="tp2-root">

      {/* ── Filter bar ── */}
      <div className="tp2-filter-bar">
        {/* Rankings (produce a numeric rank) */}
        <div className="tp2-filter-group">
          <span className="tp2-filter-label">{t('teams.rankBy')}</span>
          <div className="tp2-tabs">
            {RANK_SORTS.map(({ key, labelKey, needsParams, needsStats }) => {
              const disabled = (needsParams && !params) || (needsStats && teamStats.size === 0);
              return (
                <button key={key}
                  className={`tp2-tab ${sortKey === key ? 'on' : ''} ${disabled ? 'off' : ''}`}
                  onClick={() => { if (!disabled) setSortKey(key); }}
                  disabled={disabled}
                  title={disabled ? t('teams.dataUnavailable') : undefined}
                >{t(labelKey)}</button>
              );
            })}
          </div>
        </div>

        {/* Group + Search — on the right */}
        <div className="tp2-filter-right">
          {/* Group */}
          <div className="tp2-filter-group tp2-filter-group--group">
            <span className="tp2-filter-label tp2-filter-label--dim">{t('teams.groupBy')}</span>
            <div className="tp2-tabs tp2-tabs--group">
              {GROUP_SORTS.map(({ key, labelKey }) => (
                <button key={key}
                  className={`tp2-tab tp2-tab--group ${sortKey === key ? 'on' : ''}`}
                  onClick={() => setSortKey(key)}
                >{t(labelKey)}</button>
              ))}
            </div>
          </div>
          {/* Search */}
          <div className="tp2-search-wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input className="tp2-search" placeholder={t('teams.search')} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className={`tp2-body ${isGridMode ? 'tp2-body--grid' : 'tp2-body--split'}`}>

        {/* List / Grid */}
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

        {/* Detail panel — split mode only */}
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
  const { t } = useT();
  if (sorted.length === 0) return <p className="tp2-empty">{t('teams.empty')}</p>;

  const isGroupSort = sortKey === 'group';

  /* Grouping by group */
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
              <span className="tp2-group-title">{t('teams.group', { g })}</span>
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

  /* Flat list with rank (ranking or A→Z) */
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

/* ── Card (grid mode) ── */
interface CardProps {
  team: Team; sortKey: SortKey; rank: number | null;
  params: ModelParams | null; teamStats: Map<string, TeamStats>;
  strengthScores: Map<string, TeamStrengthScore>; onSelect: (id: string) => void;
}
function TeamCard({ team, sortKey, rank, params, teamStats, strengthScores, onSelect }: CardProps) {
  const { t } = useT();
  const teamName = useTeamName();
  const isItaly = team.id === 'ITA';
  const sortVal = getSortValue(team, sortKey, params, teamStats, strengthScores, t);

  return (
    <button className={`tp2-card ${isItaly ? 'italy' : ''}`} onClick={() => onSelect(team.id)}>
      {/* Prominent rank */}
      {rank !== null && (
        <span className={`tp2-card-rank${rank === 1 ? ' tp2-rank--gold' : rank === 2 ? ' tp2-rank--silver' : rank === 3 ? ' tp2-rank--bronze' : ''}`}>
          {rank}
        </span>
      )}
      <span className={`fi fi-${team.flag} tp2-card-flag`} aria-hidden />
      <div className="tp2-card-info">
        <span className="tp2-card-name">{teamName(team)}</span>
        {isItaly && <span className="tp2-card-whatif">🔀 what-if</span>}
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

/* ── Row (split mode) ── */
interface RowProps extends CardProps { isSelected: boolean; }
function TeamRow({ team, sortKey, rank, isSelected, params, teamStats, strengthScores, onSelect }: RowProps) {
  const { t } = useT();
  const teamName = useTeamName();
  const isItaly = team.id === 'ITA';
  const sortVal = getSortValue(team, sortKey, params, teamStats, strengthScores, t);

  return (
    <button className={`tp2-row ${isSelected ? 'selected' : ''} ${isItaly ? 'italy' : ''}`} onClick={() => onSelect(team.id)}>
      {rank !== null && (
        <span className={`tp2-row-rank${rank === 1 ? ' tp2-rank--gold' : rank === 2 ? ' tp2-rank--silver' : rank === 3 ? ' tp2-rank--bronze' : ''}`}>{rank}</span>
      )}
      <span className={`fi fi-${team.flag} tp2-row-flag`} aria-hidden />
      <div className="tp2-row-info">
        <div className="tp2-row-nameline">
          <span className="tp2-row-name">{teamName(team)}</span>
          {isItaly && <span className="tp2-row-whatif">🔀 what-if</span>}
        </div>
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
  const { t } = useT();
  const teamName = useTeamName();
  const [tab, setTab] = useState<'stats' | 'h2h'>('stats');
  const tp  = params?.teams[team.id];
  const ts  = teamStats.get(team.id);
  const sc  = strengthScores.get(team.id);
  const tier = eloTier(team.elo);

  return (
    <div className="tpd-root">

      <div className="tpd-header">
        <span className={`fi fi-${team.flag} tpd-flag`} aria-hidden />
        <div className="tpd-header-text">
          <h3 className="tpd-name">{teamName(team)}</h3>
          <div className="tpd-badges">
            <span className={`tier-chip ${tier.cls}`}>{tier.label}</span>
            <span className="tpd-group-badge">{t('teams.group', { g: team.group })}</span>
            {team.isHost && <span className="badge badge-host">{t('teams.detail.host')}</span>}
            {team.id === 'ITA' && <span className="badge badge-italy">{t('teams.detail.whatif')}</span>}
          </div>
        </div>
        <button className="tpd-close" onClick={onClose} aria-label={t('common.close')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {sc && (
        <div className="tpd-strength-banner">
          <div className="tpd-sb-item">
            <span className="tpd-sb-label">{t('teams.detail.strengthScore')}</span>
            <span className={`tpd-sb-value ${strengthScoreTier(sc.score)}`}>{sc.score}<span className="tpd-sb-unit">/100</span></span>
          </div>
          <div className="tpd-sb-sep" />
          <div className="tpd-sb-item">
            <span className="tpd-sb-label">{t('teams.detail.avgWinRate')}</span>
            <span className="tpd-sb-value">{Math.round(sc.avgWinRate * 100)}<span className="tpd-sb-unit">%</span></span>
          </div>
          <div className="tpd-sb-sep" />
          <div className="tpd-sb-item">
            <span className="tpd-sb-label">{t('teams.detail.notLoseVs')}</span>
            <span className="tpd-sb-value">{Math.round(sc.avgNotLoseRate * 100)}<span className="tpd-sb-unit">%</span></span>
          </div>
        </div>
      )}

      <div className="tpd-tabs">
        <button className={`tpd-tab ${tab === 'stats' ? 'on' : ''}`} onClick={() => setTab('stats')}>{t('teams.detail.tab.stats')}</button>
        <button className={`tpd-tab ${tab === 'h2h'  ? 'on' : ''}`} onClick={() => setTab('h2h')}>{t('teams.detail.tab.h2h')}</button>
      </div>

      <div className="tpd-body">
        {tab === 'stats' && (
          <div className="tpd-stats-grid">
            <DetailStat label="Elo" value={String(team.elo)} pct={eloBar(team.elo)} barCls="bar-elo" sub={t('teams.detail.elo.sub')} />
            <DetailStat label={t('teams.detail.squadValue')} value={team.squadValue != null ? `€${team.squadValue}M` : t('teams.detail.squadValue.na')} pct={team.squadValue != null ? valueBar(team.squadValue) : undefined} barCls="bar-val" sub={t('teams.detail.squadValue.sub')} />
            {tp ? (
              <>
                <DetailStat label={t('teams.detail.attack')} value={`${strengthScore(tp.attack)}/100`} pct={strengthBar(tp.attack)} barCls="bar-atk" sub={`log-λ: ${tp.attack.toFixed(3)}${tp.attackSd != null ? ` ± ${tp.attackSd.toFixed(3)}` : ''}`} />
                <DetailStat label={t('teams.detail.defense')} value={`${strengthScore(tp.defense)}/100`} pct={strengthBar(tp.defense)} barCls="bar-def" sub={`log-λ: ${tp.defense.toFixed(3)}${tp.defenseSd != null ? ` ± ${tp.defenseSd.toFixed(3)}` : ''}`} />
              </>
            ) : (
              <div className="tpd-note">{t('teams.detail.noParams')}</div>
            )}
            {ts && <DetailStat label={t('teams.detail.form')} value={`${Math.round(ts.form.score)}/100`} pct={ts.form.score} barCls="bar-form" sub={t('teams.detail.form.sub', { w: ts.form.w, d: ts.form.d, l: ts.form.l, n: ts.form.n }) + (ts.form.lastDate ? t('teams.detail.form.last', { date: ts.form.lastDate }) : '')} />}
            {ts && <DetailStat label={t('teams.detail.ko')} value={`${Math.round(ts.knockout.score)}/100`} pct={ts.knockout.score} barCls="bar-ko" sub={t('teams.detail.ko.sub', { w: ts.knockout.w, d: ts.knockout.d, l: ts.knockout.l, n: ts.knockout.n })} />}
            {ts && <DetailStat label={t('teams.detail.history')} value={`${Math.round(ts.history.score)}/100`} pct={ts.history.score} barCls="bar-history" sub={ts.history.score === 0 ? t('teams.detail.history.none') : ts.history.byTournament.filter(tm => tm.titles > 0).map(tm => `${tm.label}: ${'🏆'.repeat(Math.min(tm.titles, 5))}`).join(' · ')} />}
            {team.isHost && (
              <div className="tpd-host-banner">
                <span className="tpd-host-icon">🏟</span>
                <div>
                  <span className="tpd-host-label">{t('teams.detail.host.label')}</span>
                  <span className="tpd-host-sub">{t('teams.detail.host.sub', { v: params?.global.homeAdv.toFixed(3) ?? '0.271' })}</span>
                </div>
              </div>
            )}
            <div className="tpd-source">{paramsSource === 'bayesian' ? t('teams.detail.source.bayesian', { date: t('teams.detail.lastRealMatch') }) : t('teams.detail.source.fallback')}</div>
          </div>
        )}

        {tab === 'h2h' && (
          <div className="tpd-h2h-section">
            {h2hSummary && h2hSummary.n > 0 && (
              <div className="tpd-h2h-summary">
                <span className="tpd-h2h-sum-label">{t('teams.h2h.summaryLabel')}</span>
                <span className="tpd-h2h-sum-record">
                  {t('teams.h2h.summaryRecord', { w: h2hSummary.w, d: h2hSummary.d, l: h2hSummary.l })}
                  <span className="tpd-h2h-sum-n">{t('teams.h2h.summaryN', { n: h2hSummary.n })}</span>
                </span>
                <span className="tpd-h2h-sum-pct">{t('teams.h2h.winRate', { pct: Math.round((h2hSummary.w / h2hSummary.n) * 100) })}</span>
              </div>
            )}
            <div className="tpd-h2h-section-label">{t('teams.h2h.sectionLabel', { g: team.group })}</div>
            <div className="tpd-h2h-list">
              {groupH2H.map(({ opp, rec }) => (
                <div key={opp.id} className="tpd-h2h-row">
                  <span className={`fi fi-${opp.flag} tpd-h2h-flag`} aria-hidden />
                  <span className="tpd-h2h-name">{teamName(opp)}</span>
                  <H2HBadge rec={rec} teamIsFirstAlpha={team.id < opp.id} />
                </div>
              ))}
            </div>
            <div className="tpd-source">{t('teams.h2h.source')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
