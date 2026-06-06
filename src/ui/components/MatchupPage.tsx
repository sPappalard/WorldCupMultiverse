import { useMemo, useState } from 'react';
import type { Team, ModelParams, H2HRecord, TeamStats, ModulatorConfig } from '../../engine/types';
import { scorelineDist, eloToStrength, buildModulatorStats } from '../../engine/matchModel';
import { config } from '../../config';
import { useT, useTeamName } from '../../i18n';

interface Props {
  teams: Team[];
  params: ModelParams | null;
  h2h: Map<string, H2HRecord>;
  teamStats: Map<string, TeamStats>;
  modulators?: ModulatorConfig;
}

function computeOutcomes(flat: Float64Array, cols: number) {
  let pWin = 0, pDraw = 0, pLoss = 0;
  const n = flat.length;
  for (let idx = 0; idx < n; idx++) {
    const p = idx === 0 ? flat[0] : flat[idx] - flat[idx - 1];
    const hg = Math.floor(idx / cols);
    const ag = idx % cols;
    if (hg > ag) pWin += p;
    else if (hg === ag) pDraw += p;
    else pLoss += p;
  }
  return { pWin, pDraw, pLoss };
}

function quota(p: number): string {
  if (p <= 0.01) return '—';
  return (0.92 / p).toFixed(2);
}

const pct  = (x: number) => `${Math.round(x * 100)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

function penaltyWinProb(
  teamA: Team, teamB: Team, lambdaA: number, lambdaB: number,
  teamStats: Map<string, TeamStats>, modulators: ModulatorConfig,
): { pA: number; pB: number } {
  let pA = lambdaA / (lambdaA + lambdaB);
  const statsA = teamStats.get(teamA.id);
  const statsB = teamStats.get(teamB.id);
  const koA = statsA ? modulators.koKnockoutWeight * statsA.knockout.score + modulators.koHistoryWeight * statsA.history.score : 50;
  const koB = statsB ? modulators.koKnockoutWeight * statsB.knockout.score + modulators.koHistoryWeight * statsB.history.score : 50;
  const expEdge = ((koA - koB) / 100) * modulators.koExperienceCoeff;
  pA = Math.max(0.05, Math.min(0.95, pA + expEdge));
  return { pA, pB: 1 - pA };
}

/** Centered comparison bar: A on the left, B on the right. */
function CmpBar({ valA, valB, formatFn = (v: number) => String(v) }: {
  valA: number; valB: number; formatFn?: (v: number) => string;
}) {
  const max = Math.max(Math.abs(valA), Math.abs(valB), 0.001);
  const wA = Math.min(100, (valA / max) * 100);
  const wB = Math.min(100, (valB / max) * 100);
  const betterA = valA > valB;
  const betterB = valB > valA;
  return (
    <div className="cmp-bar-row">
      <span className={`cmp-val cmp-val-a ${betterA ? 'better' : ''}`}>{formatFn(valA)}</span>
      <div className="cmp-bar-wrap">
        <div className="cmp-half cmp-half-a">
          <div className="cmp-fill cmp-fill-a" style={{ width: `${wA}%` }} />
        </div>
        <div className="cmp-half cmp-half-b">
          <div className="cmp-fill cmp-fill-b" style={{ width: `${wB}%` }} />
        </div>
      </div>
      <span className={`cmp-val cmp-val-b ${betterB ? 'better' : ''}`}>{formatFn(valB)}</span>
    </div>
  );
}

/** Overview vs all teams. */
function AllOpponentsPanel({ focus, opponents, params, h2h, teamStats, effectiveMods, onSelect }: {
  focus: Team; opponents: Team[]; params: ModelParams | null;
  h2h: Map<string, H2HRecord>; teamStats: Map<string, TeamStats>;
  effectiveMods: ModulatorConfig; onSelect: (id: string) => void;
}) {
  const { t } = useT();
  const BALANCE_THRESH = 0.05;
  const globalParams = params?.global ?? { intercept: config.modelDefaults.intercept, homeAdv: config.modelDefaults.homeAdv, rho: config.modelDefaults.rho };
  const activeOnly = opponents.filter(t => t.active);
  const modStats = buildModulatorStats(activeOnly.map(t => t.elo), activeOnly.map(t => t.squadValue ?? 0));

  const rows = useMemo(() => {
    return opponents.filter(t => t.id !== focus.id && t.active).map(opp => {
      const strF = params?.teams[focus.id] ?? eloToStrength(focus.elo);
      const strO = params?.teams[opp.id]   ?? eloToStrength(opp.elo);
      const dist = scorelineDist(strF, strO, globalParams, false, focus.id, opp.id, h2h, teamStats, focus.elo, opp.elo, focus.squadValue ?? 0, opp.squadValue ?? 0, modStats, effectiveMods);
      const { pWin, pDraw, pLoss } = computeOutcomes(dist.flat, dist.cols);
      return { opp, pWin, pDraw, pLoss };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus.id, opponents, params, h2h, teamStats, effectiveMods.eloCoeff, effectiveMods.formCoeff]);

  const favored  = rows.filter(r => r.pWin - r.pLoss >  BALANCE_THRESH);
  const balanced = rows.filter(r => Math.abs(r.pWin - r.pLoss) <= BALANCE_THRESH).sort((a, b) => b.pWin - a.pWin);
  const underdog = rows.filter(r => r.pLoss - r.pWin >  BALANCE_THRESH).sort((a, b) => a.pWin - b.pWin);

  function OppRow({ opp, pWin, pDraw, pLoss, kind }: { opp: Team; pWin: number; pDraw: number; pLoss: number; kind: 'fav' | 'bal' | 'und' }) {
    return (
      <button className="mu-opp-row" onClick={() => onSelect(opp.id)}>
        <span className={`fi fi-${opp.flag} mu-opp-flag`} aria-hidden />
        <span className="mu-opp-name">{opp.name}</span>
        <div className="mu-opp-bar-bg">
          <div className={`mu-opp-bar-fill ${kind}`} style={{ width: `${kind === 'fav' ? pWin * 100 : kind === 'und' ? pLoss * 100 : 100}%` }} />
        </div>
        <span className={`mu-opp-pct ${kind}`}>
          {kind === 'fav' ? pct(pWin) : kind === 'und' ? pct(pLoss) : `${pct(pWin)}/${pct(pDraw)}/${pct(pLoss)}`}
        </span>
      </button>
    );
  }

  return (
    <div className="mu-all-panel">
      <div className="mu-all-header">
        <span className={`fi fi-${focus.flag} mu-all-flag`} aria-hidden />
        <span className="mu-all-title">{t('matchup.all.title', { name: focus.name })}</span>
        <span className="mu-all-hint">{t('matchup.all.hint')}</span>
      </div>
      <div className="mu-all-cols">
        <div className="mu-all-col">
          <div className="mu-all-col-head mu-all-col-head--fav">{t('matchup.all.favored', { n: favored.length })}</div>
          {favored.map(({ opp, pWin, pDraw, pLoss }) => <OppRow key={opp.id} opp={opp} pWin={pWin} pDraw={pDraw} pLoss={pLoss} kind="fav" />)}
        </div>
        <div className="mu-all-col">
          <div className="mu-all-col-head mu-all-col-head--bal">{t('matchup.all.balanced', { n: balanced.length })}</div>
          {balanced.map(({ opp, pWin, pDraw, pLoss }) => <OppRow key={opp.id} opp={opp} pWin={pWin} pDraw={pDraw} pLoss={pLoss} kind="bal" />)}
        </div>
        <div className="mu-all-col">
          <div className="mu-all-col-head mu-all-col-head--und">{t('matchup.all.underdog', { n: underdog.length })}</div>
          {underdog.map(({ opp, pWin, pDraw, pLoss }) => <OppRow key={opp.id} opp={opp} pWin={pWin} pDraw={pDraw} pLoss={pLoss} kind="und" />)}
        </div>
      </div>
    </div>
  );
}

export function MatchupPage({ teams, params, h2h, teamStats, modulators }: Props) {
  const { t } = useT();
  const teamName = useTeamName();
  const activeTeams = useMemo(() => teams.filter(t => t.active || t.substituteFor), [teams]);
  const [idxA, setIdxA] = useState(0);
  const [idxB, setIdxB] = useState(1);
  const [context, setContext] = useState<'group' | 'knockout'>('group');
  const [showAll, setShowAll] = useState<'A' | 'B' | false>(false);
  const [tab, setTab] = useState<'probs' | 'params' | 'scores'>('probs');

  const teamA = activeTeams[idxA];
  const teamB = activeTeams[idxB];
  const idA = teamA?.id ?? '';
  const idB = teamB?.id ?? '';
  const n = activeTeams.length;

  function stepA(dir: 1 | -1) {
    setIdxA(prev => { let next = (prev + dir + n) % n; if (next === idxB) next = (next + dir + n) % n; return next; });
    setShowAll(v => v === 'A' ? false : v);
  }
  function stepB(dir: 1 | -1) {
    setIdxB(prev => { let next = (prev + dir + n) % n; if (next === idxA) next = (next + dir + n) % n; return next; });
  }

  const effectiveMods: ModulatorConfig = modulators ?? {
    formCoeff: config.modulators.formCoeff, squadValueCoeff: config.modulators.squadValueCoeff,
    eloCoeff: config.modulators.eloCoeff, koExperienceCoeff: config.modulators.koExperienceCoeff,
    koMatchCoeff: config.modulators.koMatchCoeff, koKnockoutWeight: config.modulators.koKnockoutWeight,
    koHistoryWeight: config.modulators.koHistoryWeight, homeAdvBoost: config.modulators.homeAdvBoost,
    h2hMaxBoost: config.modulators.h2hMaxBoost, lambdaShrink: config.modulators.lambdaShrink,
    whatIf: config.modulators.whatIf,
  };

  const result = useMemo(() => {
    if (!teamA || !teamB || idA === idB) return null;
    const activeOnly = teams.filter(t => t.active);
    const modStats = buildModulatorStats(activeOnly.map(t => t.elo), activeOnly.map(t => t.squadValue ?? 0));
    const strA = params?.teams[idA] ?? eloToStrength(teamA.elo);
    const strB = params?.teams[idB] ?? eloToStrength(teamB.elo);
    const globalParams = params?.global ?? { intercept: config.modelDefaults.intercept, homeAdv: config.modelDefaults.homeAdv, rho: config.modelDefaults.rho };
    const homeAdv = context === 'group' && teamA.isHost;
    const dist = scorelineDist(strA, strB, globalParams, homeAdv, idA, idB, h2h, teamStats, teamA.elo, teamB.elo, teamA.squadValue ?? 0, teamB.squadValue ?? 0, modStats, effectiveMods);
    const { pWin, pDraw, pLoss } = computeOutcomes(dist.flat, dist.cols);
    const pen = penaltyWinProb(teamA, teamB, dist.lambdaHome, dist.lambdaAway, teamStats, effectiveMods);
    const pKoA = pWin + pDraw * pen.pA;
    const pKoB = pLoss + pDraw * pen.pB;
    const scores: { hg: number; ag: number; p: number }[] = [];
    const nf = dist.flat.length;
    for (let idx = 0; idx < nf; idx++) {
      const p = idx === 0 ? dist.flat[0] : dist.flat[idx] - dist.flat[idx - 1];
      scores.push({ hg: Math.floor(idx / dist.cols), ag: idx % dist.cols, p });
    }
    scores.sort((a, b) => b.p - a.p);
    const top6 = scores.slice(0, 6);
    const h2hKey = [idA, idB].sort().join('|');
    const h2hRec = h2h.get(h2hKey);
    return { pWin, pDraw, pLoss, pKoA, pKoB, lambdaA: dist.lambdaHome, lambdaB: dist.lambdaAway, top6, h2hRec, strA, strB, pen };
  }, [teamA, teamB, params, h2h, teamStats, effectiveMods, context, teams, idA, idB]);

  const statsA = teamStats.get(idA);
  const statsB = teamStats.get(idB);

  return (
    <div className="mu2-root">

      {/* Team selectors */}
      <div className="mu2-selectors">
        {/* Team A */}
        <div className="mu2-side mu2-side--left">
          <div className="mu2-side-top">
            {teamA && <span className={`fi fi-${teamA.flag} mu2-flag`} aria-hidden />}
            <div className="mu2-side-arrows">
              <button className="mu2-arrow" onClick={() => stepA(-1)} title={t('matchup.prevTeam')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <select className="mu2-select" value={idA} onChange={e => { setIdxA(activeTeams.findIndex(t => t.id === e.target.value)); setShowAll(false); }}>
                {activeTeams.map(t => <option key={t.id} value={t.id}>{teamName(t)}</option>)}
              </select>
              <button className="mu2-arrow" onClick={() => stepA(1)} title={t('matchup.nextTeam')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>
          {teamA && <span className="mu2-team-name">{teamName(teamA)}</span>}
          {teamA && <span className="mu2-team-elo">{t('matchup.elo', { n: teamA.elo })}</span>}
          {teamA && (
            <button
              className={`mu2-all-btn ${showAll === 'A' ? 'on' : ''}`}
              onClick={() => setShowAll(v => v === 'A' ? false : 'A')}
            >
              {showAll === 'A' ? t('matchup.closeLeft') : t('matchup.vsAll')}
            </button>
          )}
        </div>

        {/* Center */}
        <div className="mu2-center">
          <span className="mu2-vs">VS</span>
          <div className="mu2-ctx-btns">
            <button className={`mu2-ctx-btn ${context === 'group' ? 'on' : ''}`} onClick={() => setContext('group')}>
              <span className="mu2-ctx-btn-label">{t('matchup.ctx.group')}</span>
              <span className="mu2-ctx-btn-sub">{t('matchup.ctx.group.sub')}</span>
            </button>
            <button className={`mu2-ctx-btn ${context === 'knockout' ? 'on' : ''}`} onClick={() => setContext('knockout')}>
              <span className="mu2-ctx-btn-label">{t('matchup.ctx.knockout')}</span>
              <span className="mu2-ctx-btn-sub">{t('matchup.ctx.knockout.sub')}</span>
            </button>
          </div>
        </div>

        {/* Team B */}
        <div className="mu2-side mu2-side--right">
          <div className="mu2-side-top">
            <div className="mu2-side-arrows">
              <button className="mu2-arrow" onClick={() => stepB(-1)} title={t('matchup.prevTeam')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <select className="mu2-select" value={idB} onChange={e => setIdxB(activeTeams.findIndex(t => t.id === e.target.value))}>
                {activeTeams.map(t => <option key={t.id} value={t.id}>{teamName(t)}</option>)}
              </select>
              <button className="mu2-arrow" onClick={() => stepB(1)} title={t('matchup.nextTeam')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
            {teamB && <span className={`fi fi-${teamB.flag} mu2-flag`} aria-hidden />}
          </div>
          {teamB && <span className="mu2-team-name">{teamName(teamB)}</span>}
          {teamB && <span className="mu2-team-elo">{t('matchup.elo', { n: teamB.elo })}</span>}
          {teamB && (
            <button
              className={`mu2-all-btn ${showAll === 'B' ? 'on' : ''}`}
              onClick={() => setShowAll(v => v === 'B' ? false : 'B')}
            >
              {showAll === 'B' ? t('matchup.closeRight') : t('matchup.vsAll')}
            </button>
          )}
        </div>
      </div>

      {/* Overview vs all */}
      {showAll && (showAll === 'A' ? teamA : teamB) && (
        <AllOpponentsPanel
          focus={showAll === 'A' ? teamA : teamB} opponents={activeTeams} params={params} h2h={h2h}
          teamStats={teamStats} effectiveMods={effectiveMods}
          onSelect={id => {
            const idx = activeTeams.findIndex(t => t.id === id);
            if (idx !== -1) {
              if (showAll === 'A') setIdxB(idx);
              else setIdxA(idx);
              setShowAll(false);
            }
          }}
        />
      )}

      {/* Detailed comparison */}
      {!showAll && result && idA !== idB && (
        <div className="mu2-detail">

          {/* Highlighted W/D/L bar */}
          <div className="mu2-wdl-bar">
            <div className="mu2-wdl-seg mu2-wdl-win"  style={{ width: `${result.pWin  * 100}%` }} />
            <div className="mu2-wdl-seg mu2-wdl-draw" style={{ width: `${result.pDraw * 100}%` }} />
            <div className="mu2-wdl-seg mu2-wdl-loss" style={{ width: `${result.pLoss * 100}%` }} />
          </div>
          <div className="mu2-wdl-labels">
            <div className="mu2-wdl-cell">
              <span className="mu2-wdl-pct mu2-wdl-pct--a">{pct(result.pWin)}</span>
              <span className="mu2-wdl-name">{teamA?.name}</span>
              <span className="mu2-wdl-quota">@{quota(result.pWin)}</span>
            </div>
            <div className="mu2-wdl-cell mu2-wdl-cell--c">
              <span className="mu2-wdl-pct">{pct(result.pDraw)}</span>
              <span className="mu2-wdl-name">{t('common.draw')}</span>
              <span className="mu2-wdl-quota">@{quota(result.pDraw)}</span>
            </div>
            <div className="mu2-wdl-cell mu2-wdl-cell--r">
              <span className="mu2-wdl-pct mu2-wdl-pct--b">{pct(result.pLoss)}</span>
              <span className="mu2-wdl-name">{teamB?.name}</span>
              <span className="mu2-wdl-quota">@{quota(result.pLoss)}</span>
            </div>
          </div>
          <div className="mu2-lambda">
            <span>{t('common.expectedGoals', { n: result.lambdaA.toFixed(2) })}</span>
            <span>{t('common.expectedGoals', { n: result.lambdaB.toFixed(2) })}</span>
          </div>

          {/* KO extra */}
          {context === 'knockout' && (
            <div className="mu2-ko-row">
              <div className="mu2-ko-cell">
                <span className="mu2-ko-pct mu2-ko-pct--a">{pct1(result.pKoA)}</span>
                <span className="mu2-ko-label">{t('matchup.ko.win')}</span>
                <span className="mu2-ko-quota">@{quota(result.pKoA)}</span>
              </div>
              <div className="mu2-ko-cell mu2-ko-cell--c">
                <span className="mu2-ko-pen-label">{t('matchup.ko.penIfTied')}</span>
                <span className="mu2-ko-pen">{pct(result.pen.pA)} – {pct(result.pen.pB)}</span>
              </div>
              <div className="mu2-ko-cell mu2-ko-cell--r">
                <span className="mu2-ko-pct mu2-ko-pct--b">{pct1(result.pKoB)}</span>
                <span className="mu2-ko-label">{t('matchup.ko.win')}</span>
                <span className="mu2-ko-quota">@{quota(result.pKoB)}</span>
              </div>
            </div>
          )}

          {/* Tab bar */}
          <div className="mu2-tabs">
            <button className={`mu2-tab ${tab === 'probs' ? 'on' : ''}`} onClick={() => setTab('probs')}>{t('matchup.tab.probs')}</button>
            <button className={`mu2-tab ${tab === 'params' ? 'on' : ''}`} onClick={() => setTab('params')}>{t('matchup.tab.params')}</button>
            {result.h2hRec && result.h2hRec.n >= 3 && (
              <button className={`mu2-tab ${tab === 'scores' ? 'on' : ''}`} onClick={() => setTab('scores')}>{t('matchup.tab.h2h')}</button>
            )}
          </div>

          {/* Most likely scorelines */}
          {tab === 'probs' && (
            <div className="mu2-scores-grid">
              {result.top6.map(({ hg, ag, p }) => (
                <div key={`${hg}-${ag}`} className={`mu2-score-card ${hg > ag ? 'win-a' : hg < ag ? 'win-b' : 'draw'}`}>
                  <span className="mu2-score-result">{hg} – {ag}</span>
                  <span className="mu2-score-pct">{pct1(p)}</span>
                  <span className="mu2-score-quota">@{quota(p)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Comparative parameters */}
          {tab === 'params' && (
            <div className="mu2-params">
              <div className="mu2-params-header">
                <span className="mu2-params-head-a">{teamA?.name}</span>
                <span />
                <span className="mu2-params-head-b">{teamB?.name}</span>
              </div>
              <CmpBar valA={teamA?.elo ?? 0} valB={teamB?.elo ?? 0} formatFn={v => String(v)} />
              <div className="mu2-param-label-row"><span>{t('matchup.params.elo')}</span></div>
              <CmpBar valA={teamA?.squadValue ?? 0} valB={teamB?.squadValue ?? 0} formatFn={v => `€${v}M`} />
              <div className="mu2-param-label-row"><span>{t('matchup.params.squadValue')}</span></div>
              <CmpBar valA={result.strA.attack} valB={result.strB.attack} formatFn={v => v.toFixed(2)} />
              <div className="mu2-param-label-row"><span>{t('matchup.params.attack')}</span></div>
              <CmpBar valA={result.strA.defense} valB={result.strB.defense} formatFn={v => v.toFixed(2)} />
              <div className="mu2-param-label-row"><span>{t('matchup.params.defense')}</span></div>
              {statsA && statsB && (
                <>
                  <CmpBar valA={statsA.form.score} valB={statsB.form.score} formatFn={v => `${Math.round(v)}/100`} />
                  <div className="mu2-param-label-row"><span>{t('matchup.params.form')}</span></div>
                  <CmpBar valA={statsA.knockout.score} valB={statsB.knockout.score} formatFn={v => `${Math.round(v)}/100`} />
                  <div className="mu2-param-label-row"><span>{t('matchup.params.koExp')}</span></div>
                  <CmpBar valA={statsA.history.score} valB={statsB.history.score} formatFn={v => `${Math.round(v)}/100`} />
                  <div className="mu2-param-label-row"><span>{t('matchup.params.history')}</span></div>
                </>
              )}
            </div>
          )}

          {/* H2H */}
          {tab === 'scores' && result.h2hRec && result.h2hRec.n >= 3 && (() => {
            const rec = result.h2hRec!;
            const aIsFirst = idA <= idB;
            const wA = aIsFirst ? rec.w_a : rec.w_b;
            const wB = aIsFirst ? rec.w_b : rec.w_a;
            return (
              <div className="mu2-h2h">
                <div className="mu2-h2h-count">{t('matchup.h2h.count', { n: rec.n })}</div>
                <div className="mu2-h2h-bar">
                  <div className="mu2-h2h-seg mu2-h2h-a" style={{ width: `${(wA / rec.n) * 100}%` }} />
                  <div className="mu2-h2h-seg mu2-h2h-d" style={{ width: `${(rec.d / rec.n) * 100}%` }} />
                  <div className="mu2-h2h-seg mu2-h2h-b" style={{ width: `${(wB / rec.n) * 100}%` }} />
                </div>
                <div className="mu2-h2h-labels">
                  <span className="mu2-h2h-la">{teamA?.name} <strong>{wA}{t('common.winLetter')}</strong></span>
                  <span className="mu2-h2h-ld"><strong>{rec.d}{t('common.drawLetter')}</strong></span>
                  <span className="mu2-h2h-lb"><strong>{wB}{t('common.winLetter')}</strong> {teamB?.name}</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {idA === idB && !showAll && (
        <div className="mu2-same-team">{t('matchup.sameTeam')}</div>
      )}
    </div>
  );
}
