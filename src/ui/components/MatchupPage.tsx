import { useMemo, useState } from 'react';
import type { Team, ModelParams, H2HRecord, TeamStats, ModulatorConfig } from '../../engine/types';
import { scorelineDist, eloToStrength, buildModulatorStats } from '../../engine/matchModel';
import { config } from '../../config';

interface Props {
  teams: Team[];
  params: ModelParams | null;
  h2h: Map<string, H2HRecord>;
  teamStats: Map<string, TeamStats>;
  modulators?: ModulatorConfig;
}

/** P(home>away), P(draw), P(away>home) dalla distribuzione scoreline. */
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

/** Quota decimale da probabilità (con margine bookmaker ~8%). */
function quota(p: number): string {
  if (p <= 0.01) return '—';
  return (0.92 / p).toFixed(2);
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

function DeltaBar({ valA, valB }: { valA: number; valB: number }) {
  const max = Math.max(Math.abs(valA), Math.abs(valB), 0.01);
  const wA = Math.min(100, (valA / max) * 100);
  const wB = Math.min(100, (valB / max) * 100);
  const better = valA > valB ? 'left' : valA < valB ? 'right' : 'equal';
  return (
    <div className="mu-delta-bar">
      <span className={`mu-delta-val ${better === 'left' ? 'mu-better' : ''}`}>{valA.toFixed(2)}</span>
      <div className="mu-delta-track">
        <div className="mu-delta-half mu-delta-left">
          <div className="mu-delta-fill mu-fill-left" style={{ width: `${wA}%` }} />
        </div>
        <div className="mu-delta-half mu-delta-right">
          <div className="mu-delta-fill mu-fill-right" style={{ width: `${wB}%` }} />
        </div>
      </div>
      <span className={`mu-delta-val mu-delta-val--right ${better === 'right' ? 'mu-better' : ''}`}>{valB.toFixed(2)}</span>
    </div>
  );
}

function EloBar({ valA, valB }: { valA: number; valB: number }) {
  const min = 1400, max = 2300;
  const wA = ((valA - min) / (max - min)) * 100;
  const wB = ((valB - min) / (max - min)) * 100;
  const better = valA > valB ? 'left' : valA < valB ? 'right' : 'equal';
  return (
    <div className="mu-delta-bar">
      <span className={`mu-delta-val ${better === 'left' ? 'mu-better' : ''}`}>{valA}</span>
      <div className="mu-delta-track">
        <div className="mu-delta-half mu-delta-left">
          <div className="mu-delta-fill mu-fill-left" style={{ width: `${wA}%` }} />
        </div>
        <div className="mu-delta-half mu-delta-right">
          <div className="mu-delta-fill mu-fill-right" style={{ width: `${wB}%` }} />
        </div>
      </div>
      <span className={`mu-delta-val mu-delta-val--right ${better === 'right' ? 'mu-better' : ''}`}>{valB}</span>
    </div>
  );
}

function ValueBar({ valA, valB }: { valA: number; valB: number }) {
  const max = Math.max(valA, valB, 100);
  const wA = (valA / max) * 100;
  const wB = (valB / max) * 100;
  const better = valA > valB ? 'left' : valA < valB ? 'right' : 'equal';
  return (
    <div className="mu-delta-bar">
      <span className={`mu-delta-val ${better === 'left' ? 'mu-better' : ''}`}>{valA}M</span>
      <div className="mu-delta-track">
        <div className="mu-delta-half mu-delta-left">
          <div className="mu-delta-fill mu-fill-left mu-fill-val" style={{ width: `${wA}%` }} />
        </div>
        <div className="mu-delta-half mu-delta-right">
          <div className="mu-delta-fill mu-fill-right mu-fill-val" style={{ width: `${wB}%` }} />
        </div>
      </div>
      <span className={`mu-delta-val mu-delta-val--right ${better === 'right' ? 'mu-better' : ''}`}>{valB}M</span>
    </div>
  );
}

function ScoreBar({ valA, valB }: { valA: number; valB: number }) {
  const max = Math.max(valA, valB, 1);
  const wA = (valA / max) * 100;
  const wB = (valB / max) * 100;
  const better = valA > valB ? 'left' : valA < valB ? 'right' : 'equal';
  return (
    <div className="mu-delta-bar">
      <span className={`mu-delta-val ${better === 'left' ? 'mu-better' : ''}`}>{Math.round(valA)}</span>
      <div className="mu-delta-track">
        <div className="mu-delta-half mu-delta-left">
          <div className="mu-delta-fill mu-fill-left mu-fill-score" style={{ width: `${wA}%` }} />
        </div>
        <div className="mu-delta-half mu-delta-right">
          <div className="mu-delta-fill mu-fill-right mu-fill-score" style={{ width: `${wB}%` }} />
        </div>
      </div>
      <span className={`mu-delta-val mu-delta-val--right ${better === 'right' ? 'mu-better' : ''}`}>{Math.round(valB)}</span>
    </div>
  );
}

/** Probabilità vittoria ai rigori basata su esperienza KO. */
function penaltyWinProb(
  teamA: Team, teamB: Team,
  lambdaA: number, lambdaB: number,
  teamStats: Map<string, TeamStats>,
  modulators: ModulatorConfig,
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

/** Calcola pWin/pDraw/pLoss di A vs B dato il modello. */
function calcWinProb(
  teamA: Team, teamB: Team,
  params: ModelParams | null,
  modStats: ReturnType<typeof buildModulatorStats>,
  globalParams: { intercept: number; homeAdv: number; rho: number },
  h2h: Map<string, H2HRecord>,
  teamStats: Map<string, TeamStats>,
  effectiveMods: ModulatorConfig,
): { pWin: number; pDraw: number; pLoss: number } {
  const strA = params?.teams[teamA.id] ?? eloToStrength(teamA.elo);
  const strB = params?.teams[teamB.id] ?? eloToStrength(teamB.elo);
  const dist = scorelineDist(
    strA, strB, globalParams, false,
    teamA.id, teamB.id, h2h, teamStats,
    teamA.elo, teamB.elo,
    teamA.squadValue ?? 0, teamB.squadValue ?? 0,
    modStats, effectiveMods,
  );
  return computeOutcomes(dist.flat, dist.cols);
}

/** Pannello panoramica vs tutte le squadre. */
function AllOpponentsPanel({
  focus, opponents, params, h2h, teamStats, effectiveMods, onSelect,
}: {
  focus: Team;
  opponents: Team[];
  params: ModelParams | null;
  h2h: Map<string, H2HRecord>;
  teamStats: Map<string, TeamStats>;
  effectiveMods: ModulatorConfig;
  onSelect: (id: string) => void;
}) {
  const globalParams = params?.global ?? {
    intercept: config.modelDefaults.intercept,
    homeAdv: config.modelDefaults.homeAdv,
    rho: config.modelDefaults.rho,
  };
  const activeOnly = opponents.filter((t) => t.active);
  const modStats = buildModulatorStats(
    activeOnly.map((t) => t.elo),
    activeOnly.map((t) => t.squadValue ?? 0),
  );

  // Soglia: "equilibrata" se la differenza pWin-pLoss è ≤5pp
  const BALANCE_THRESH = 0.05;

  const rows = useMemo(() => {
    return opponents
      .filter((t) => t.id !== focus.id)
      .map((opp) => {
        const { pWin, pDraw, pLoss } = calcWinProb(focus, opp, params, modStats, globalParams, h2h, teamStats, effectiveMods);
        return { opp, pWin, pDraw, pLoss };
      })
      .sort((a, b) => b.pWin - a.pWin);
  // Dipendenze primitive dei modulatori per rilevare cambiamenti reali
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus.id, params, h2h, teamStats,
    effectiveMods.eloCoeff, effectiveMods.squadValueCoeff, effectiveMods.formCoeff,
    effectiveMods.h2hMaxBoost, effectiveMods.homeAdvBoost,
    effectiveMods.koExperienceCoeff, effectiveMods.koKnockoutWeight, effectiveMods.koHistoryWeight,
  ]);

  const favored  = rows.filter((r) => r.pWin - r.pLoss >  BALANCE_THRESH);
  const balanced = rows.filter((r) => Math.abs(r.pWin - r.pLoss) <= BALANCE_THRESH).sort((a, b) => b.pWin - a.pWin);
  const underdog = rows.filter((r) => r.pLoss - r.pWin >  BALANCE_THRESH).sort((a, b) => a.pWin - b.pWin);

  function RowItem({ opp, pWin, pDraw, pLoss, kind }: { opp: Team; pWin: number; pDraw: number; pLoss: number; kind: 'fav' | 'bal' | 'und' }) {
    return (
      <button className="mu-all-row" onClick={() => onSelect(opp.id)}>
        <span className={`fi fi-${opp.flag}`} aria-hidden style={{ width: 20, height: 14, borderRadius: 2, flexShrink: 0 }} />
        <span className="mu-all-name">{opp.name}</span>
        <div className="mu-all-bar-bg">
          <div
            className={`mu-all-bar-fill ${kind === 'fav' ? 'mu-all-bar-fav' : kind === 'und' ? 'mu-all-bar-und' : 'mu-all-bar-bal'}`}
            style={{ width: `${kind === 'fav' ? pWin * 100 : kind === 'und' ? pLoss * 100 : 100}%` }}
          />
        </div>
        <span className={`mu-all-pct ${kind === 'fav' ? 'mu-all-pct-fav' : kind === 'und' ? 'mu-all-pct-und' : 'mu-all-pct-bal'}`}>
          {kind === 'fav' ? pct(pWin) : kind === 'und' ? pct(pLoss) : `${pct(pWin)}/${pct(pDraw)}/${pct(pLoss)}`}
        </span>
      </button>
    );
  }

  return (
    <div className="card mu-all-card">
      <h2 className="mu-card-title">Panoramica vs tutte le squadre — {focus.name}</h2>
      <p className="muted small">
        % = vittoria/pareggio/sconfitta di {focus.name}. "Equilibrata" = differenza W–L ≤5pp.
      </p>

      <div className="mu-all-cols mu-all-cols--3">
        <div className="mu-all-col">
          <div className="mu-all-col-title mu-all-col-title--fav">Favorita ({favored.length})</div>
          {favored.map(({ opp, pWin, pDraw, pLoss }) => (
            <RowItem key={opp.id} opp={opp} pWin={pWin} pDraw={pDraw} pLoss={pLoss} kind="fav" />
          ))}
        </div>
        <div className="mu-all-col">
          <div className="mu-all-col-title mu-all-col-title--bal">Equilibrata ({balanced.length})</div>
          {balanced.map(({ opp, pWin, pDraw, pLoss }) => (
            <RowItem key={opp.id} opp={opp} pWin={pWin} pDraw={pDraw} pLoss={pLoss} kind="bal" />
          ))}
        </div>
        <div className="mu-all-col">
          <div className="mu-all-col-title mu-all-col-title--und">Sfavorita ({underdog.length})</div>
          {underdog.map(({ opp, pWin, pDraw, pLoss }) => (
            <RowItem key={opp.id} opp={opp} pWin={pWin} pDraw={pDraw} pLoss={pLoss} kind="und" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function MatchupPage({ teams, params, h2h, teamStats, modulators }: Props) {
  const activeTeams = useMemo(() => teams.filter((t) => t.active || t.substituteFor), [teams]);

  const [idxA, setIdxA] = useState(0);
  const [idxB, setIdxB] = useState(1);
  const [context, setContext] = useState<'group' | 'knockout'>('group');
  const [showAll, setShowAll] = useState(false);

  const idA = activeTeams[idxA]?.id ?? '';
  const idB = activeTeams[idxB]?.id ?? '';
  const teamA = activeTeams[idxA];
  const teamB = activeTeams[idxB];

  const n = activeTeams.length;

  function stepA(dir: 1 | -1) {
    setIdxA((prev) => {
      let next = (prev + dir + n) % n;
      if (next === idxB) next = (next + dir + n) % n;
      return next;
    });
    setShowAll(false);
  }
  function stepB(dir: 1 | -1) {
    setIdxB((prev) => {
      let next = (prev + dir + n) % n;
      if (next === idxA) next = (next + dir + n) % n;
      return next;
    });
  }

  const effectiveMods: ModulatorConfig = modulators ?? {
    formCoeff: config.modulators.formCoeff,
    squadValueCoeff: config.modulators.squadValueCoeff,
    eloCoeff: config.modulators.eloCoeff,
    koExperienceCoeff: config.modulators.koExperienceCoeff,
    koMatchCoeff: config.modulators.koMatchCoeff,
    koKnockoutWeight: config.modulators.koKnockoutWeight,
    koHistoryWeight: config.modulators.koHistoryWeight,
    homeAdvBoost: config.modulators.homeAdvBoost,
    h2hMaxBoost: config.modulators.h2hMaxBoost,
    lambdaShrink: config.modulators.lambdaShrink,
    whatIf: config.modulators.whatIf,
  };

  const result = useMemo(() => {
    if (!teamA || !teamB || teamA.id === teamB.id) return null;
    const activeOnly = teams.filter((t) => t.active);
    const modStats = buildModulatorStats(
      activeOnly.map((t) => t.elo),
      activeOnly.map((t) => t.squadValue ?? 0),
    );
    const strA = params?.teams[teamA.id] ?? eloToStrength(teamA.elo);
    const strB = params?.teams[teamB.id] ?? eloToStrength(teamB.elo);
    const globalParams = params?.global ?? {
      intercept: config.modelDefaults.intercept,
      homeAdv: config.modelDefaults.homeAdv,
      rho: config.modelDefaults.rho,
    };
    const homeAdv = context === 'group' && teamA.isHost;
    const dist = scorelineDist(
      strA, strB, globalParams, homeAdv,
      teamA.id, teamB.id, h2h, teamStats,
      teamA.elo, teamB.elo,
      teamA.squadValue ?? 0, teamB.squadValue ?? 0,
      modStats, effectiveMods,
    );
    const { pWin, pDraw, pLoss } = computeOutcomes(dist.flat, dist.cols);
    const pen = penaltyWinProb(teamA, teamB, dist.lambdaHome, dist.lambdaAway, teamStats, effectiveMods);
    const pKoA = pWin + pDraw * pen.pA;
    const pKoB = pLoss + pDraw * pen.pB;
    const lambdaA = dist.lambdaHome;
    const lambdaB = dist.lambdaAway;
    const scores: { hg: number; ag: number; p: number }[] = [];
    const cols = dist.cols;
    const nf = dist.flat.length;
    for (let idx = 0; idx < nf; idx++) {
      const p = idx === 0 ? dist.flat[0] : dist.flat[idx] - dist.flat[idx - 1];
      scores.push({ hg: Math.floor(idx / cols), ag: idx % cols, p });
    }
    scores.sort((a, b) => b.p - a.p);
    const top6 = scores.slice(0, 6);
    const key = [teamA.id, teamB.id].sort().join('|');
    const h2hRec = h2h.get(key);
    return { pWin, pDraw, pLoss, pKoA, pKoB, lambdaA, lambdaB, top6, h2hRec, strA, strB, pen };
  }, [teamA, teamB, params, h2h, teamStats, effectiveMods, context, teams]);

  const statsA = teamStats.get(idA);
  const statsB = teamStats.get(idB);

  return (
    <div className="mu-page">

      {/* Selezione squadre con frecce */}
      <div className="card mu-selectors">
        <div className="mu-selector-row">

          {/* Lato A */}
          <div className="mu-selector-side">
            <label className="mu-selector-label">Squadra A</label>
            <div className="mu-select-with-arrows">
              <button className="mu-arrow" onClick={() => stepA(-1)}>‹</button>
              <select
                value={idA}
                onChange={(e) => { setIdxA(activeTeams.findIndex((t) => t.id === e.target.value)); setShowAll(false); }}
                className="mu-select"
              >
                {activeTeams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button className="mu-arrow" onClick={() => stepA(1)}>›</button>
            </div>
            {teamA && (
              <div className="mu-team-badge">
                <span className={`fi fi-${teamA.flag} mu-flag-lg`} aria-hidden />
                <span className="mu-team-name-lg">{teamA.name}</span>
                <button
                  className={`mu-all-btn ${showAll ? 'active' : ''}`}
                  onClick={() => setShowAll((v) => !v)}
                  title="Panoramica vs tutte"
                >
                  {showAll ? '✕ Chiudi panoramica' : '⊞ vs tutte'}
                </button>
              </div>
            )}
          </div>

          {/* Centro VS */}
          <div className="mu-vs">
            <span>VS</span>
            <div className="mu-context-btns">
              <button className={`mu-ctx-btn ${context === 'group' ? 'active' : ''}`} onClick={() => setContext('group')}>Girone</button>
              <button className={`mu-ctx-btn ${context === 'knockout' ? 'active' : ''}`} onClick={() => setContext('knockout')}>KO</button>
            </div>
          </div>

          {/* Lato B */}
          <div className="mu-selector-side mu-selector-side--right">
            <label className="mu-selector-label">Squadra B</label>
            <div className="mu-select-with-arrows">
              <button className="mu-arrow" onClick={() => stepB(-1)}>‹</button>
              <select
                value={idB}
                onChange={(e) => setIdxB(activeTeams.findIndex((t) => t.id === e.target.value))}
                className="mu-select"
              >
                {activeTeams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button className="mu-arrow" onClick={() => stepB(1)}>›</button>
            </div>
            {teamB && (
              <div className="mu-team-badge mu-team-badge--right">
                <span className="mu-team-name-lg">{teamB.name}</span>
                <span className={`fi fi-${teamB.flag} mu-flag-lg`} aria-hidden />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Panoramica vs tutte */}
      {showAll && teamA && (
        <AllOpponentsPanel
          focus={teamA}
          opponents={activeTeams}
          params={params}
          h2h={h2h}
          teamStats={teamStats}
          effectiveMods={effectiveMods}
          onSelect={(id) => {
            const idx = activeTeams.findIndex((t) => t.id === id);
            if (idx !== -1) { setIdxB(idx); setShowAll(false); }
          }}
        />
      )}

      {/* Confronto dettagliato */}
      {!showAll && result && teamA && teamB && idA !== idB && (
        <>
          <div className="card mu-probs-card">
            <h2 className="mu-card-title">Probabilità — {context === 'group' ? 'Girone' : 'Eliminazione diretta'}</h2>
            <div className="mu-wdl-bar">
              <div className="mu-wdl-seg mu-wdl-win"  style={{ width: `${result.pWin  * 100}%` }} />
              <div className="mu-wdl-seg mu-wdl-draw" style={{ width: `${result.pDraw * 100}%` }} />
              <div className="mu-wdl-seg mu-wdl-loss" style={{ width: `${result.pLoss * 100}%` }} />
            </div>
            <div className="mu-wdl-row">
              <div className="mu-wdl-cell">
                <span className="mu-wdl-label">{teamA.name}</span>
                <span className="mu-wdl-prob mu-wdl-prob--win">{pct(result.pWin)}</span>
                <span className="mu-wdl-quota">quota {quota(result.pWin)}</span>
              </div>
              <div className="mu-wdl-cell mu-wdl-cell--center">
                <span className="mu-wdl-label">Pareggio</span>
                <span className="mu-wdl-prob">{pct(result.pDraw)}</span>
                <span className="mu-wdl-quota">quota {quota(result.pDraw)}</span>
              </div>
              <div className="mu-wdl-cell mu-wdl-cell--right">
                <span className="mu-wdl-label">{teamB.name}</span>
                <span className="mu-wdl-prob mu-wdl-prob--loss">{pct(result.pLoss)}</span>
                <span className="mu-wdl-quota">quota {quota(result.pLoss)}</span>
              </div>
            </div>
            <div className="mu-lambda-row">
              <span className="mu-lambda">{result.lambdaA.toFixed(2)} gol att.</span>
              <span className="mu-lambda-mid muted small">λ attesi</span>
              <span className="mu-lambda">{result.lambdaB.toFixed(2)} gol att.</span>
            </div>
            {context === 'knockout' && (
              <div className="mu-ko-section">
                <div className="mu-ko-title muted small">Vittoria in KO (incl. supplementari e rigori)</div>
                <div className="mu-ko-row">
                  <div className="mu-ko-cell">
                    <span className="mu-ko-prob mu-ko-prob--a">{pct1(result.pKoA)}</span>
                    <span className="mu-ko-quota muted small">quota {quota(result.pKoA)}</span>
                  </div>
                  <div className="mu-ko-cell mu-ko-cell--center">
                    <div className="mu-ko-pen-box">
                      <span className="mu-ko-pen-label muted small">% rigori (se pari ai 90')</span>
                      <div className="mu-ko-pen-row">
                        <span className="mu-ko-pen-val">{pct(result.pen.pA)}</span>
                        <span className="muted small">–</span>
                        <span className="mu-ko-pen-val">{pct(result.pen.pB)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mu-ko-cell mu-ko-cell--right">
                    <span className="mu-ko-prob mu-ko-prob--b">{pct1(result.pKoB)}</span>
                    <span className="mu-ko-quota muted small">quota {quota(result.pKoB)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="mu-card-title">Confronto parametri</h2>
            <div className="mu-params">
              <div className="mu-param-row"><span className="mu-param-label">Elo</span><EloBar valA={teamA.elo} valB={teamB.elo} /></div>
              <div className="mu-param-row"><span className="mu-param-label">Valore rosa</span><ValueBar valA={teamA.squadValue ?? 0} valB={teamB.squadValue ?? 0} /></div>
              <div className="mu-param-row"><span className="mu-param-label">Attacco</span><DeltaBar valA={result.strA.attack} valB={result.strB.attack} /></div>
              <div className="mu-param-row"><span className="mu-param-label">Difesa</span><DeltaBar valA={result.strA.defense} valB={result.strB.defense} /></div>
              {statsA && statsB && (
                <>
                  <div className="mu-param-row"><span className="mu-param-label">Forma</span><ScoreBar valA={statsA.form.score} valB={statsB.form.score} /></div>
                  <div className="mu-param-row"><span className="mu-param-label">Esp. KO</span><ScoreBar valA={statsA.knockout.score} valB={statsB.knockout.score} /></div>
                  <div className="mu-param-row"><span className="mu-param-label">Storia</span><ScoreBar valA={statsA.history.score} valB={statsB.history.score} /></div>
                </>
              )}
            </div>
          </div>

          {result.h2hRec && result.h2hRec.n >= 3 && (() => {
            const rec = result.h2hRec!;
            const aIsFirst = teamA.id <= teamB.id;
            const wA = aIsFirst ? rec.w_a : rec.w_b;
            const wB = aIsFirst ? rec.w_b : rec.w_a;
            return (
              <div className="card">
                <h2 className="mu-card-title">Scontri diretti storici ({rec.n} partite dal 1994)</h2>
                <div className="mu-h2h-bar-wrap">
                  <div className="mu-h2h-seg mu-h2h-a" style={{ width: `${(wA / rec.n) * 100}%` }} />
                  <div className="mu-h2h-seg mu-h2h-d" style={{ width: `${(rec.d / rec.n) * 100}%` }} />
                  <div className="mu-h2h-seg mu-h2h-b" style={{ width: `${(wB / rec.n) * 100}%` }} />
                </div>
                <div className="mu-h2h-labels">
                  <span className="mu-h2h-label-a">{teamA.name} <strong>{wA}V</strong></span>
                  <span className="mu-h2h-label-d"><strong>{rec.d}P</strong></span>
                  <span className="mu-h2h-label-b"><strong>{wB}V</strong> {teamB.name}</span>
                </div>
              </div>
            );
          })()}

          <div className="card">
            <h2 className="mu-card-title">Risultati più probabili</h2>
            <div className="mu-scores-grid">
              {result.top6.map(({ hg, ag, p }) => (
                <div key={`${hg}-${ag}`} className={`mu-score-card ${hg > ag ? 'mu-score-card--a' : hg < ag ? 'mu-score-card--b' : 'mu-score-card--d'}`}>
                  <span className="mu-score-result">{hg} – {ag}</span>
                  <span className="mu-score-pct">{pct1(p)}</span>
                  <span className="mu-score-quota muted small">q. {quota(p)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {idA === idB && !showAll && (
        <div className="card empty"><p className="muted">Seleziona due squadre diverse.</p></div>
      )}
    </div>
  );
}
