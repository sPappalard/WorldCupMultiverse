import { useMemo, useState } from 'react';
import type { Team, H2HRecord, ModelParams, TeamStats } from '../../engine/types';

const LAST_REAL_MATCH_DATE = '31 marzo 2026';

interface Props {
  teams: Team[];
  h2h: Map<string, H2HRecord>;
  italyActive: boolean;
  params: ModelParams | null;
  paramsSource: 'bayesian' | 'elo-fallback';
  teamStats: Map<string, TeamStats>;
}

type SortKey = 'group' | 'elo' | 'squadValue' | 'attack' | 'defense' | 'form' | 'knockout' | 'history' | 'name';

function h2hKey(a: string, b: string) { return [a, b].sort().join('|'); }

// ─── Scale helpers ────────────────────────────────────────────────────────────
function eloBar(v: number)  { return Math.max(0, Math.min(100, ((v - 1400) / 800) * 100)); }
function valueBar(v: number){ return Math.max(0, Math.min(100, (v / 1500) * 100)); }
function strengthBar(v: number){ return Math.max(0, Math.min(100, ((v + 0.6) / 1.8) * 100)); }
function strengthScore(v: number){ return Math.round(Math.max(0, Math.min(100, ((v + 0.6) / 1.8) * 100))); }

// ─── Label helpers ────────────────────────────────────────────────────────────
function eloTier(elo: number): { label: string; cls: string } {
  if (elo >= 2100) return { label: 'Elite', cls: 'tier-elite' };
  if (elo >= 1950) return { label: 'Top', cls: 'tier-top' };
  if (elo >= 1820) return { label: 'Contender', cls: 'tier-contender' };
  if (elo >= 1650) return { label: 'Solida', cls: 'tier-solid' };
  return { label: 'Outsider', cls: 'tier-outsider' };
}

function scoreTier(s: number): { label: string; cls: string } {
  if (s >= 80) return { label: 'Eccellente', cls: 'tier-elite' };
  if (s >= 65) return { label: 'Alto', cls: 'tier-top' };
  if (s >= 50) return { label: 'Nella media', cls: 'tier-contender' };
  if (s >= 35) return { label: 'Sotto media', cls: 'tier-solid' };
  return { label: 'Debole', cls: 'tier-outsider' };
}

// ─── Mini bar inline ──────────────────────────────────────────────────────────
function MiniBar({ pct, cls }: { pct: number; cls: string }) {
  return (
    <div className="mini-bar-bg">
      <div className={`mini-bar-fill ${cls}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Score pill ───────────────────────────────────────────────────────────────
function ScorePill({ score, cls }: { score: number; cls: string }) {
  return <span className={`score-pill ${cls}`}>{score}</span>;
}

// ─── H2H badge ───────────────────────────────────────────────────────────────
function H2HBadgeDirect({ rec, teamIsFirstAlpha }: { rec: H2HRecord | null; teamIsFirstAlpha: boolean }) {
  if (!rec || rec.n === 0) return <span className="h2h-badge h2h-unknown">Nessun precedente</span>;
  const w = teamIsFirstAlpha ? rec.w_a : rec.w_b;
  const l = teamIsFirstAlpha ? rec.w_b : rec.w_a;
  const cls = w > l ? 'h2h-pos' : l > w ? 'h2h-neg' : 'h2h-neutral';
  return (
    <span className={`h2h-badge ${cls}`}>
      {w}V – {rec.d}P – {l}S <span className="h2h-n">({rec.n})</span>
    </span>
  );
}

// ─── Compact stat row ─────────────────────────────────────────────────────────
function StatRow({ icon, label, value, pct, barCls, pill }: {
  icon: string; label: string; value: string;
  pct: number; barCls: string; pill?: { score: number; cls: string };
}) {
  return (
    <div className="stat-row">
      <span className="stat-icon">{icon}</span>
      <span className="stat-label">{label}</span>
      <MiniBar pct={pct} cls={barCls} />
      <span className="stat-value">{value}</span>
      {pill && <ScorePill score={pill.score} cls={pill.cls} />}
    </div>
  );
}

export function TeamsPage({ teams, h2h, italyActive, params, paramsSource, teamStats }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('group');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const visibleTeams = useMemo(() => teams.filter((t) => {
    if (!t.active) return italyActive && t.id === 'ITA';
    if (italyActive && t.substituteFor) return false;
    return true;
  }), [teams, italyActive]);

  const allIds = useMemo(() => visibleTeams.map((t) => t.id), [visibleTeams]);

  const sorted = useMemo(() => {
    const filtered = visibleTeams.filter((t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase()),
    );
    return [...filtered].sort((a, b) => {
      const sa = teamStats.get(a.id), sb = teamStats.get(b.id);
      const pa = params?.teams[a.id], pb = params?.teams[b.id];
      switch (sortKey) {
        case 'elo':       return b.elo - a.elo;
        case 'squadValue':return (b.squadValue ?? 0) - (a.squadValue ?? 0);
        case 'name':      return a.name.localeCompare(b.name, 'it');
        case 'attack':    return (pb?.attack ?? 0) - (pa?.attack ?? 0);
        case 'defense':   return (pb?.defense ?? 0) - (pa?.defense ?? 0);
        case 'form':      return (sb?.form.score ?? 50) - (sa?.form.score ?? 50);
        case 'knockout':  return (sb?.knockout.score ?? 50) - (sa?.knockout.score ?? 50);
        case 'history':   return (sb?.history.score ?? 0) - (sa?.history.score ?? 0);
        default:          return a.group.localeCompare(b.group) || b.elo - a.elo;
      }
    });
  }, [visibleTeams, sortKey, search, params, teamStats]);

  const selected     = useMemo(() => selectedId ? visibleTeams.find((t) => t.id === selectedId) ?? null : null, [selectedId, visibleTeams]);
  const selectedGroupTeams = useMemo(() => selected ? visibleTeams.filter((t) => t.group === selected.group) : [], [selected, visibleTeams]);

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

  const SORTS: { key: SortKey; label: string; needsParams?: boolean; needsStats?: boolean }[] = [
    { key: 'group',      label: 'Girone' },
    { key: 'elo',        label: 'Elo' },
    { key: 'attack',     label: '⚔ Attacco', needsParams: true },
    { key: 'defense',    label: '🛡 Difesa',  needsParams: true },
    { key: 'form',       label: '🔥 Forma',   needsStats: true },
    { key: 'knockout',   label: '🏆 Knockout', needsStats: true },
    { key: 'history',    label: '📜 Storia', needsStats: true },
    { key: 'squadValue', label: '💰 Valore rosa' },
    { key: 'name',       label: 'Nome' },
  ];

  return (
    <div className="teams-page">
      {/* Toolbar */}
      <div className="teams-toolbar">
        <input
          className="teams-search"
          placeholder="🔍  Cerca squadra…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="sort-btns">
          {SORTS.map(({ key, label, needsParams, needsStats }) => {
            const disabled = (needsParams && !params) || (needsStats && teamStats.size === 0);
            return (
              <button key={key}
                className={`sort-btn ${sortKey === key ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                onClick={() => !disabled && setSortKey(key)}
                title={disabled ? 'Dati non disponibili' : undefined}
              >{label}</button>
            );
          })}
        </div>
      </div>

      <div className="teams-layout">
        {/* ── Lista ─────────────────────────────────────────── */}
        <div className="teams-list">
          {sorted.map((team) => {
            const isSelected = team.id === selectedId;
            const isItaly    = team.id === 'ITA';
            const tp  = params?.teams[team.id];
            const ts  = teamStats.get(team.id);
            const tier = eloTier(team.elo);

            return (
              <div key={team.id}
                className={`team-card ${isSelected ? 'selected' : ''} ${isItaly ? 'italy-card' : ''}`}
                onClick={() => setSelectedId(isSelected ? null : team.id)}
              >
                {/* Header */}
                <div className="tc-head">
                  <span className="fi tc-flag"
                    style={{ backgroundImage: `url(https://flagcdn.com/w40/${team.flag}.png)` }} />
                  <div className="tc-title">
                    <span className="tc-name">{team.name}</span>
                    <span className="tc-group-badge">Girone {team.group}</span>
                  </div>
                  <div className="tc-badges">
                    {team.isHost && <span className="badge badge-host">🏟 Casa</span>}
                    {isItaly     && <span className="badge badge-italy">What-if</span>}
                  </div>
                </div>

                {/* Stats grid */}
                <div className="tc-stats">
                  <StatRow icon="📊" label="Elo"
                    value={String(team.elo)} pct={eloBar(team.elo)} barCls="bar-elo"
                    pill={{ score: 0, cls: '' }}
                  />
                  {/* sostituto pill per Elo → tier chip */}
                  {/* usiamo un approccio custom per la prima riga */}

                  {tp && (
                    <>
                      <StatRow icon="⚔" label="Attacco"
                        value={String(strengthScore(tp.attack))}
                        pct={strengthBar(tp.attack)} barCls="bar-atk" />
                      <StatRow icon="🛡" label="Difesa"
                        value={String(strengthScore(tp.defense))}
                        pct={strengthBar(tp.defense)} barCls="bar-def" />
                    </>
                  )}

                  {ts && (
                    <>
                      <StatRow icon="🔥" label="Forma"
                        value={`${ts.form.w}V ${ts.form.d}P ${ts.form.l}S`}
                        pct={ts.form.score} barCls="bar-form"
                        pill={{ score: ts.form.score, cls: scoreTier(ts.form.score).cls }} />
                      <StatRow icon="🏆" label="Knockout"
                        value={`${ts.knockout.w}V/${ts.knockout.l}L`}
                        pct={ts.knockout.score} barCls="bar-ko"
                        pill={{ score: ts.knockout.score, cls: scoreTier(ts.knockout.score).cls }} />
                      <StatRow icon="📜" label="Storia"
                        value={ts.history.score === 0 ? 'Nessun titolo major' : ts.history.byTournament.map(t => '🏆'.repeat(t.titles)).join('')}
                        pct={ts.history.score} barCls="bar-history"
                        pill={{ score: ts.history.score, cls: scoreTier(ts.history.score).cls }} />
                    </>
                  )}

                  {team.squadValue != null && (
                    <StatRow icon="💰" label="Rosa"
                      value={`€${team.squadValue}M`}
                      pct={valueBar(team.squadValue)} barCls="bar-val" />
                  )}
                </div>

                {/* Tier chip */}
                <div className="tc-footer">
                  <span className={`tier-chip ${tier.cls}`}>{tier.label}</span>
                  {tp && <span className="tc-footer-hint">Dati bayesiani</span>}
                </div>
              </div>
            );
          })}
          {sorted.length === 0 && (
            <p className="muted" style={{ padding: '32px', textAlign: 'center' }}>Nessuna squadra trovata.</p>
          )}
        </div>

        {/* ── Dettaglio ─────────────────────────────────────── */}
        {selected ? (() => {
          const tp = params?.teams[selected.id];
          const ts = teamStats.get(selected.id);
          const tier = eloTier(selected.elo);
          const groupH2H = selectedGroupTeams
            .filter((t) => t.id !== selected.id)
            .map((opp) => ({ opp, rec: h2h.get(h2hKey(selected.id, opp.id)) ?? null }));

          return (
            <div className="team-detail card">
              <button className="detail-close" onClick={() => setSelectedId(null)}>✕</button>

              {/* Hero */}
              <div className="detail-hero">
                <span className="detail-flag fi"
                  style={{ backgroundImage: `url(https://flagcdn.com/w80/${selected.flag}.png)`, width: 56, height: 42 }} />
                <div className="detail-hero-text">
                  <h2 className="detail-name">{selected.name}</h2>
                  <div className="detail-meta">
                    <span className={`tier-chip ${tier.cls}`}>{tier.label}</span>
                    <span className="muted">Girone <strong style={{ color: 'var(--text)' }}>{selected.group}</strong></span>
                    {selected.isHost && <span className="badge badge-host">🏟 Paese ospitante</span>}
                    {selected.id === 'ITA' && <span className="badge badge-italy">Scenario what-if</span>}
                  </div>
                </div>
              </div>

              {/* Data source banner */}
              <div className="dsb">
                <span>📅 Elo <strong>1 giu 2026</strong></span>
                <span className="dsb-dot">·</span>
                <span>💰 Transfermarkt <strong>giu 2026</strong></span>
                <span className="dsb-dot">·</span>
                <span>
                  {paramsSource === 'bayesian'
                    ? <>⚽ Modello bayesiano · storico fino al <strong>{LAST_REAL_MATCH_DATE}</strong></>
                    : <>⚽ Fallback Elo (modello non fittato)</>}
                </span>
              </div>

              {/* Parametri simulazione */}
              <h3 className="detail-section">Parametri della simulazione</h3>
              <div className="detail-params">

                {/* Attacco & Difesa */}
                {tp ? (
                  <div className="dp-row dp-highlight">
                    <div className="dp-half">
                      <div className="dp-label">⚔ Attacco</div>
                      <div className="dp-big">{strengthScore(tp.attack)}<span className="dp-unit">/100</span></div>
                      <MiniBar pct={strengthBar(tp.attack)} cls="bar-atk" />
                      <div className="dp-sub">log-λ: <strong>{tp.attack.toFixed(3)}</strong>{tp.attackSd != null ? ` ± ${tp.attackSd.toFixed(3)}` : ''}</div>
                    </div>
                    <div className="dp-divider" />
                    <div className="dp-half">
                      <div className="dp-label">🛡 Difesa</div>
                      <div className="dp-big">{strengthScore(tp.defense)}<span className="dp-unit">/100</span></div>
                      <MiniBar pct={strengthBar(tp.defense)} cls="bar-def" />
                      <div className="dp-sub">log-λ: <strong>{tp.defense.toFixed(3)}</strong>{tp.defenseSd != null ? ` ± ${tp.defenseSd.toFixed(3)}` : ''}</div>
                    </div>
                  </div>
                ) : (
                  <div className="dp-row dp-muted">
                    <div className="dp-label">⚔ Attacco &amp; 🛡 Difesa</div>
                    <div className="dp-sub">Derivati da Elo (modello non fittato). Esegui <code>model/fit.py</code>.</div>
                  </div>
                )}

                {/* Forma + Knockout */}
                {ts && (
                  <div className="dp-row dp-highlight2">
                    <div className="dp-half">
                      <div className="dp-label">🔥 Forma recente</div>
                      <div className="dp-big">{ts.form.score}<span className="dp-unit">/100</span></div>
                      <MiniBar pct={ts.form.score} cls="bar-form" />
                      <div className="dp-sub">
                        {ts.form.w}V {ts.form.d}P {ts.form.l}S su ultime {ts.form.n} partite
                        {ts.form.lastDate && <> · ultima: <strong>{ts.form.lastDate}</strong></>}
                      </div>
                    </div>
                    <div className="dp-divider" />
                    <div className="dp-half">
                      <div className="dp-label">🏆 Rendimento Knockout <span className="dp-label-note">(dal 1994)</span></div>
                      <div className="dp-big">{ts.knockout.score}<span className="dp-unit">/100</span></div>
                      <MiniBar pct={ts.knockout.score} cls="bar-ko" />
                      <div className="dp-sub">
                        {ts.knockout.w}V {ts.knockout.d}P {ts.knockout.l}S · {ts.knockout.n} partite tornei major dal 1994
                      </div>
                      {ts.knockout.byTournament.length > 0 && (
                        <div className="ko-breakdown">
                          {ts.knockout.byTournament.map((bt) => (
                            <div key={bt.label} className="ko-bt-row">
                              <span className="ko-bt-label">{bt.label}</span>
                              <span className="ko-bt-weight">×{bt.weight}</span>
                              <MiniBar pct={bt.score} cls="bar-ko" />
                              <span className="ko-bt-record">{bt.w}V/{bt.l}S</span>
                              {bt.editions > 0 && (
                                <span className="ko-bt-phases">
                                  {bt.editions}ed
                                  {bt.semiFinals > 0 && <> · {bt.semiFinals}SF</>}
                                  {bt.finals > 0 && <> · {bt.finals}F</>}
                                  {bt.titles > 0 && <> · {'🏆'.repeat(bt.titles)}</>}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Punteggio storia nazionale */}
                {ts && (
                  <div className="dp-row dp-highlight3">
                    <div className="dp-half" style={{ flex: 1 }}>
                      <div className="dp-label">📜 Punteggio Storia Nazionale <span className="dp-label-note">(storia completa)</span></div>
                      <div className="dp-big">{ts.history.score}<span className="dp-unit">/100</span></div>
                      <MiniBar pct={ts.history.score} cls="bar-history" />
                      {ts.history.score === 0
                        ? <div className="dp-sub">{(ts.history as any)._zeroReason ?? 'Nessun titolo né finale raggiunta in tornei major.'}</div>
                        : <div className="dp-sub">Titoli vinti nella storia completa di ogni torneo, pesati per importanza.</div>
                      }
                      {ts.history.byTournament.length > 0 && (
                        <div className="ko-breakdown" style={{ marginTop: 8 }}>
                          {ts.history.byTournament.map((ht) => (
                            <div key={ht.label} className="ko-bt-row">
                              <span className="ko-bt-label">{ht.label}</span>
                              <span className="ko-bt-weight">×{ht.weight}</span>
                              <MiniBar pct={ht.score} cls="bar-history" />
                              <span className="ko-bt-record">{ht.titles > 0 ? '🏆'.repeat(Math.min(ht.titles, 10)) : '—'}</span>
                              <span className="ko-bt-phases">{ht.titles} titoli · {ht.finals} finali</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Elo + Valore rosa */}
                <div className="dp-row">
                  <div className="dp-half">
                    <div className="dp-label">📊 Elo</div>
                    <div className="dp-big">{selected.elo}</div>
                    <MiniBar pct={eloBar(selected.elo)} cls="bar-elo" />
                    <div className="dp-sub">Snapshot 1/06/2026 · eloratings.net</div>
                  </div>
                  <div className="dp-divider" />
                  <div className="dp-half">
                    <div className="dp-label">💰 Valore rosa</div>
                    <div className="dp-big">
                      {selected.squadValue != null ? `€${selected.squadValue}M` : <span className="muted">N/D</span>}
                    </div>
                    {selected.squadValue != null && <MiniBar pct={valueBar(selected.squadValue)} cls="bar-val" />}
                    <div className="dp-sub">Transfermarkt · giugno 2026</div>
                  </div>
                </div>

                {/* Vantaggio campo + H2H totale */}
                <div className="dp-row">
                  <div className="dp-half">
                    <div className="dp-label">🏟 Vantaggio campo</div>
                    <div className="dp-big" style={{ fontSize: '1.1rem' }}>
                      {selected.isHost ? '+35% λ gol' : '—'}
                    </div>
                    <div className="dp-sub">
                      {selected.isHost
                        ? `homeAdv ${params?.global.homeAdv.toFixed(3) ?? '0.271'} log-λ (MEX/USA/CAN)`
                        : 'Nessun bonus campo per questa squadra'}
                    </div>
                  </div>
                  <div className="dp-divider" />
                  <div className="dp-half">
                    <div className="dp-label">⚽ H2H vs partecipanti</div>
                    {selectedH2HSummary && selectedH2HSummary.n > 0 ? (
                      <>
                        <div className="dp-big" style={{ fontSize: '1rem' }}>
                          {selectedH2HSummary.w}V {selectedH2HSummary.d}P {selectedH2HSummary.l}S
                        </div>
                        <div className="dp-sub">
                          {selectedH2HSummary.n} partite · win rate {Math.round((selectedH2HSummary.w / selectedH2HSummary.n) * 100)}%
                        </div>
                      </>
                    ) : (
                      <div className="dp-sub muted">Nessun dato storico dal 1994</div>
                    )}
                  </div>
                </div>
              </div>

              {/* H2H girone */}
              <h3 className="detail-section">Scontri diretti · Girone {selected.group}</h3>
              <div className="h2h-table">
                {groupH2H.map(({ opp, rec }) => (
                  <div key={opp.id} className="h2h-row">
                    <span className="fi" style={{ backgroundImage: `url(https://flagcdn.com/w40/${opp.flag}.png)` }} />
                    <span className="h2h-opp">{opp.name}</span>
                    <H2HBadgeDirect rec={rec} teamIsFirstAlpha={selected.id < opp.id} />
                  </div>
                ))}
              </div>

              {/* Disclaimer */}
              <div className="detail-disclaimer">
                Attacco/Difesa stimati su {'>'}19.000 partite internazionali dal 2006 con modello PyMC (Dixon-Coles bayesiano).
                Forma = ultime 30 partite pesate per importanza torneo e recency.
                Knockout = win rate in tornei major dal 1994 (Mondiali, Europei, Copa América, AFCON…).
                Tutti i valori sono euristici — l'obiettivo è l'engagement, non battere i bookmaker.
              </div>
            </div>
          );
        })() : (
          <div className="team-detail-placeholder card">
            <p className="muted" style={{ textAlign: 'center', padding: '48px 16px' }}>
              ← Clicca su una squadra per vedere tutti i parametri della simulazione.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
