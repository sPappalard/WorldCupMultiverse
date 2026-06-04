/**
 * Onboarding — schermata intro a tutto schermo (fase premium).
 *
 * Obiettivo: catturare l'utente in pochi secondi, senza fargli perdere tempo.
 * Tre passi leggeri, quasi tutti a click singolo (niente "Continua" obbligatorio):
 *   0. Italia DENTRO o FUORI — l'unica scelta vera. Click → avanza da solo.
 *   1. Squadra del cuore — minimale, saltabile. Click su una squadra → avanza.
 *   2. What-if extra — opzionali e NASCOSTI: compaiono solo se l'utente li chiede.
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
  /** Step 2: l'utente ha chiesto di vedere i what-if extra? Altrimenti restano nascosti. */
  const [wantWhatIf, setWantWhatIf] = useState<boolean | null>(null);
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

  const back = () => setStep((s) => Math.max(0, s - 1) as Step);

  /** Step 0: clic sulla scelta Italia → micro-pausa per far "accendere" la card, poi avanza. */
  const pickItaly = (val: boolean) => {
    setWithItaly(val);
    setTimeout(() => setStep(1), 400);
  };

  const finish = (favOverride?: string | null) => {
    // Teniamo solo i fattori che hanno davvero un bersaglio (gli altri sarebbero
    // no-op nel motore). Italia + caos + squadra del cuore completano lo scenario.
    const validFactors = wantWhatIf ? factors.filter((f) => (f.teamIds?.length ?? 0) > 0) : [];
    const scenario: Scenario = {
      ...emptyScenario,
      italy: withItaly === true,
      factors: validFactors,
      chaos: wantWhatIf ? chaos : 0,
    };
    const fav = favOverride !== undefined ? favOverride : favorite;
    setLeaving(true);
    setTimeout(() => onComplete({ scenario, favoriteTeam: fav }), 420);
  };

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

        {/* ── STEP 0 — Italia dentro o fuori (unica scelta vera) ── */}
        {step === 0 && (
          <section className="ob-step">
            <p className="ob-kicker">Mondiali 2026</p>
            <h1 className="ob-title">
              L'Italia non si è qualificata.<br />
              <span className="ob-title-accent">Di nuovo.</span>
            </h1>
            <p className="ob-lead ob-lead--tight">
              Però decidi tu: la rimettiamo in campo o guardiamo la cruda realtà?
            </p>

            <div className="ob-choices">
              <button
                className={`ob-choice ob-choice--italy ${withItaly === true ? 'selected' : ''}`}
                onClick={() => pickItaly(true)}
              >
                <span className="ob-choice-icon ob-choice-icon--italy">
                  <span className="fi fi-it" aria-hidden />
                </span>
                <span className="ob-choice-title">Con l'Italia</span>
                <span className="ob-choice-desc">
                  Azzurri nel Girone B, al posto della Bosnia. Di parte? Sì. Divertente? Tantissimo.
                </span>
                <span className="ob-choice-tag ob-tag-italy">What-if · consigliata</span>
              </button>

              <button
                className={`ob-choice ${withItaly === false ? 'selected' : ''}`}
                onClick={() => pickItaly(false)}
              >
                <span className="ob-choice-icon ob-choice-icon--real">
                  {/* globo stilizzato */}
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                </span>
                <span className="ob-choice-title">Senza l'Italia</span>
                <span className="ob-choice-desc">
                  Il Mondiale com'è davvero: 48 squadre, niente Azzurri. Realistico, ma un po' triste.
                </span>
                <span className="ob-choice-tag ob-tag-real">Versione realistica</span>
              </button>
            </div>
          </section>
        )}

        {/* ── STEP 1 — Squadra del cuore (minimal, saltabile) ── */}
        {step === 1 && (
          <section className="ob-step">
            <p className="ob-kicker">Per chi fai il tifo?</p>
            <h1 className="ob-title">Scegli la tua squadra</h1>
            <p className="ob-lead ob-lead--tight">
              La seguiremo per te in tutto il torneo. Nessun vantaggio: la matematica non bara.
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
                  onClick={() => { setFavorite(t.id); setTimeout(() => setStep(2), 320); }}
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

        {/* ── STEP 2 — What-if extra (opzionali, nascosti finché non richiesti) ── */}
        {step === 2 && (
          <section className="ob-step">
            <p className="ob-kicker">Ultimo tocco · opzionale</p>
            <h1 className="ob-title">Vuoi forzare un po' il destino?</h1>
            <p className="ob-lead ob-lead--tight">
              Infortuni, rientri, squalifiche: scenari "what-if" che alterano la forza di una squadra.
              Puoi anche aggiungerli dopo.
            </p>

            {wantWhatIf !== true ? (
              <div className="ob-choices ob-choices--inline">
                <button className="ob-choice ob-choice--mini" onClick={() => finish()}>
                  <span className="ob-choice-icon ob-choice-icon--go">
                    {/* play triangle */}
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                  </span>
                  <span className="ob-choice-title">No, si parte!</span>
                  <span className="ob-choice-desc">Lancia subito la simulazione.</span>
                </button>
                <button className="ob-choice ob-choice--mini" onClick={() => setWantWhatIf(true)}>
                  <span className="ob-choice-icon ob-choice-icon--tune">
                    {/* sliders */}
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
                      <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="2" fill="currentColor" stroke="none"/>
                    </svg>
                  </span>
                  <span className="ob-choice-title">Sì, personalizza</span>
                  <span className="ob-choice-desc">Aggiungi qualche what-if.</span>
                </button>
              </div>
            ) : (
              <>
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
                          Aumenta la varianza: più sorprese, più Cenerentole.
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
                <button className="ob-btn ob-btn-primary ob-btn-go ob-btn--block" onClick={() => finish()}>
                  ▶ Lancia la simulazione
                </button>
              </>
            )}
          </section>
        )}

        {/* ── Footer azioni: solo Indietro + Salta, niente "Continua" ── */}
        <footer className="ob-actions">
          {step > 0 ? (
            <button className="ob-btn ob-btn-ghost" onClick={back}>
              ← Indietro
            </button>
          ) : (
            <span />
          )}

          <div className="ob-actions-right">
            {step === 1 && (
              <button className="ob-btn ob-btn-ghost" onClick={() => { setFavorite(null); setStep(2); }}>
                Salta · nessuna squadra →
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
