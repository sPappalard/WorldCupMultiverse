/**
 * Onboarding — schermata intro a tutto schermo (fase premium).
 *
 * Tono: ironico, tutto ruota attorno al fatto che l'Italia NON si è qualificata
 * ai Mondiali 2026. Il wizard raccoglie 3 scelte e poi fa entrare l'utente nel
 * tool "pro":
 *   1. Scenario base: realistico (senza Italia) oppure what-if (con Italia).
 *   2. Scenari what-if extra (opzionali) — solo spiegazione, applicabili dopo.
 *   3. Squadra del cuore — evidenziata in tutta la UI, NON tocca la simulazione.
 *
 * Produce uno Scenario (riusa i tipi del motore) + favoriteTeam.
 */

import { useMemo, useState } from 'react';
import type { Team } from '../../engine/types';
import { whatIfFactors } from '../../config';
import { emptyScenario, type Scenario, type AppliedFactor } from '../scenario';

export interface OnboardingResult {
  scenario: Scenario;
  favoriteTeam: string | null;
}

interface Props {
  teams: Team[];
  onComplete: (result: OnboardingResult) => void;
}

type Step = 0 | 1 | 2;

const TOTAL_STEPS = 3;

export function Onboarding({ teams, onComplete }: Props) {
  const [step, setStep] = useState<Step>(0);
  const [withItaly, setWithItaly] = useState<boolean | null>(null);
  /** Fattori what-if già configurati (con squadre bersaglio e intensità). */
  const [factors, setFactors] = useState<AppliedFactor[]>([]);
  const [chaos, setChaos] = useState(0);
  const [favorite, setFavorite] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [leaving, setLeaving] = useState(false);

  // Squadre attive (48) + Italia se inserita. Usate sia come bersaglio what-if
  // sia come "squadra del cuore".
  const activePool = useMemo(
    () => teams.filter((t) => t.active || (withItaly && t.id === 'ITA')),
    [teams, withItaly],
  );
  const teamsById = useMemo(
    () => new Map(activePool.map((t) => [t.id, t])),
    [activePool],
  );

  const favPool = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? activePool.filter((t) => t.name.toLowerCase().includes(q)) : activePool;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }, [activePool, search]);

  const extraDefs = whatIfFactors.filter((f) => !f.flagship && !f.isSlider && f.needsTeam);

  const toggleFactor = (id: AppliedFactor['id'], defaultDelta?: number) => {
    setFactors((prev) =>
      prev.some((f) => f.id === id)
        ? prev.filter((f) => f.id !== id)
        : [...prev, { id, teamIds: [], eloDelta: defaultDelta }],
    );
  };
  const toggleFactorTeam = (id: AppliedFactor['id'], teamId: string) => {
    setFactors((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const cur = f.teamIds ?? [];
        return {
          ...f,
          teamIds: cur.includes(teamId) ? cur.filter((t) => t !== teamId) : [...cur, teamId],
        };
      }),
    );
  };

  const finish = () => {
    // Teniamo solo i fattori che hanno davvero un bersaglio (gli altri sarebbero
    // no-op nel motore). Italia + caos + squadra del cuore completano lo scenario.
    const validFactors = factors.filter((f) => (f.teamIds?.length ?? 0) > 0);
    const scenario: Scenario = {
      ...emptyScenario,
      italy: withItaly === true,
      factors: validFactors,
      chaos,
    };
    setLeaving(true);
    setTimeout(() => onComplete({ scenario, favoriteTeam: favorite }), 420);
  };

  const next = () => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1) as Step);
  const back = () => setStep((s) => Math.max(0, s - 1) as Step);

  const canAdvance = step === 0 ? withItaly !== null : true;

  return (
    <div className={`ob ${leaving ? 'ob--leaving' : ''}`}>
      <div className="ob-bg" aria-hidden />

      <div className="ob-shell">
        <header className="ob-top">
          <div className="ob-brand">
            <span className="ob-logo">⚽</span>
            <span className="ob-brand-name">MonteCalcio</span>
          </div>
          <div className="ob-progress">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span key={i} className={`ob-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} />
            ))}
          </div>
        </header>

        {/* ── STEP 0 — Scenario base ── */}
        {step === 0 && (
          <section className="ob-step">
            <p className="ob-kicker">Mondiali 2026 · 48 squadre</p>
            <h1 className="ob-title">
              L'Italia non si è qualificata.<br />
              <span className="ob-title-accent">Di nuovo.</span>
            </h1>
            <p className="ob-lead">
              Eliminata dalla Bosnia. Allora ho fatto l'unica cosa sensata: un
              simulatore Monte Carlo per vederla giocare lo stesso. Come vuoi
              iniziare?
            </p>

            <div className="ob-choices">
              <button
                className={`ob-choice ${withItaly === false ? 'selected' : ''}`}
                onClick={() => setWithItaly(false)}
              >
                <span className="ob-choice-emoji">📊</span>
                <span className="ob-choice-title">Simulazione realistica</span>
                <span className="ob-choice-desc">
                  Il mondiale com'è davvero: 48 squadre, niente Italia. Pura
                  statistica, nessun rimpianto. (Ok, qualche rimpianto.)
                </span>
                <span className="ob-choice-tag ob-tag-real">Consigliata per i puristi</span>
              </button>

              <button
                className={`ob-choice ob-choice--italy ${withItaly === true ? 'selected' : ''}`}
                onClick={() => setWithItaly(true)}
              >
                <span className="ob-choice-emoji"><span className="fi fi-it" style={{ width: 36, height: 26, borderRadius: 4, display: 'inline-block' }} /></span>
                <span className="ob-choice-title">…e se ci fosse l'Italia?</span>
                <span className="ob-choice-desc">
                  <code>git push --force</code> degli Azzurri nel Girone B, al
                  posto della Bosnia. Uno scenario what-if dichiaratamente di
                  parte. Vedi quante probabilità avremmo avuto.
                </span>
                <span className="ob-choice-tag ob-tag-italy">What-if · 100% meme</span>
              </button>
            </div>
          </section>
        )}

        {/* ── STEP 1 — What-if extra ── */}
        {step === 1 && (
          <section className="ob-step">
            <p className="ob-kicker">Passo 2 · Opzionale</p>
            <h1 className="ob-title">Vuoi forzare un po' il destino?</h1>
            <p className="ob-lead">
              Scenari "what-if" che alterano la forza di una squadra: un infortunio,
              il rientro di un campione, una squalifica. Puoi sceglierne adesso o
              aggiungerli in seguito.
            </p>

            <div className="ob-factors">
              {extraDefs.map((f) => {
                const applied = factors.find((a) => a.id === f.id);
                const on = !!applied;
                const selected = applied?.teamIds ?? [];
                const delta = f.defaultEloDelta ?? 0;
                return (
                  <div key={f.id} className={`ob-factor-block ${on ? 'on' : ''}`}>
                    <button
                      className="ob-factor"
                      onClick={() => toggleFactor(f.id, f.defaultEloDelta)}
                    >
                      <span className="ob-factor-emoji">{f.emoji}</span>
                      <span className="ob-factor-body">
                        <span className="ob-factor-label">
                          {f.label}
                          <span className={`ob-factor-delta ${delta >= 0 ? 'pos' : 'neg'}`}>
                            {delta >= 0 ? '+' : ''}{delta} Elo
                          </span>
                        </span>
                        <span className="ob-factor-desc">{f.description}</span>
                      </span>
                      <span className="ob-factor-check">{on ? '✓' : '+'}</span>
                    </button>

                    {on && (
                      <div className="ob-factor-teams">
                        {selected.length > 0 && (
                          <div className="ob-factor-chips">
                            {selected.map((tid) => (
                              <button
                                key={tid}
                                className="ob-chip"
                                onClick={() => toggleFactorTeam(f.id, tid)}
                                title="Rimuovi"
                              >
                                <span className={`fi fi-${teamsById.get(tid)?.flag}`} aria-hidden />
                                {teamsById.get(tid)?.name ?? tid}
                                <span className="ob-chip-x">×</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <select
                          className="ob-team-select"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) toggleFactorTeam(f.id, e.target.value);
                          }}
                        >
                          <option value="">
                            {selected.length ? '+ Aggiungi un’altra squadra…' : '+ Scegli la squadra bersaglio…'}
                          </option>
                          {activePool
                            .filter((t) => !selected.includes(t.id))
                            .slice()
                            .sort((a, b) => a.name.localeCompare(b.name, 'it'))
                            .map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                        {selected.length === 0 && (
                          <p className="ob-factor-warn">Scegli almeno una squadra, o resterà inattivo.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Fattore Caos — slider globale */}
              <div className={`ob-factor-block ${chaos > 0 ? 'on' : ''}`}>
                <div className="ob-factor ob-factor--static">
                  <span className="ob-factor-emoji">🎲</span>
                  <span className="ob-factor-body">
                    <span className="ob-factor-label">
                      Fattore Caos
                      <span className="ob-factor-delta">{chaos}</span>
                    </span>
                    <span className="ob-factor-desc">
                      Aumenta la varianza: appiattisce le probabilità verso il 50/50.
                      Più sorprese, più Cenerentole.
                    </span>
                  </span>
                </div>
                <div className="ob-factor-teams">
                  <input
                    type="range" min={0} max={100} value={chaos}
                    className="ob-chaos-range"
                    onChange={(e) => setChaos(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
            <p className="ob-fineprint">
              Tutto regolabile anche dopo, dal pannello laterale e dall'Admin.
            </p>
          </section>
        )}

        {/* ── STEP 2 — Squadra del cuore ── */}
        {step === 2 && (
          <section className="ob-step">
            <p className="ob-kicker">Passo 3 · Per chi fai il tifo?</p>
            <h1 className="ob-title">Scegli la tua squadra del cuore</h1>
            <p className="ob-lead">
              La evidenzieremo in tutta la simulazione — gironi, tabellone,
              classifiche. <strong>Non</strong> le diamo nessun vantaggio: il
              tifo non bara la matematica. Solo i tuoi occhi la seguiranno meglio.
            </p>

            <input
              className="ob-search"
              placeholder="Cerca una nazionale…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />

            <div className="ob-team-grid">
              {favPool.map((t) => (
                <button
                  key={t.id}
                  className={`ob-team ${favorite === t.id ? 'selected' : ''}`}
                  onClick={() => setFavorite(favorite === t.id ? null : t.id)}
                >
                  <span className={`fi fi-${t.flag}`} aria-hidden />
                  <span className="ob-team-name">{t.name}</span>
                </button>
              ))}
              {favPool.length === 0 && (
                <p className="ob-empty muted">Nessuna squadra trovata.</p>
              )}
            </div>
          </section>
        )}

        {/* ── Footer azioni ── */}
        <footer className="ob-actions">
          {step > 0 ? (
            <button className="ob-btn ob-btn-ghost" onClick={back}>
              ← Indietro
            </button>
          ) : (
            <span />
          )}

          <div className="ob-actions-right">
            {step < TOTAL_STEPS - 1 && (
              <button className="ob-btn ob-btn-ghost" onClick={finish}>
                Salta
              </button>
            )}
            {step < TOTAL_STEPS - 1 ? (
              <button
                className="ob-btn ob-btn-primary"
                onClick={next}
                disabled={!canAdvance}
              >
                Continua →
              </button>
            ) : (
              <button className="ob-btn ob-btn-primary ob-btn-go" onClick={finish}>
                {favorite ? 'Entra nel simulatore →' : 'Entra senza tifare →'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
