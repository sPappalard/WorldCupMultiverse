import { useEffect, useMemo, useRef, useState } from 'react';
import { type SimInput } from '../engine/simulator';
import type { SimulationOutput, Team, ModulatorConfig, SampleRun } from '../engine/types';
import { useData } from './useData';
import {
  scenarioToSimInput,
  scenarioToUrl,
  scenarioFromUrl,
  type Scenario,
} from './scenario';
import type { SimWorkerRequest, SimWorkerMessage } from './simWorker';
import { Standings } from './components/Standings';
import { PhaseTable } from './components/PhaseTable';
import { RunDetail } from './components/RunDetail';
import { MatchupPage } from './components/MatchupPage';
import { TeamsPage } from './components/TeamsPage';
import { AdminPage } from './components/AdminPage';
import { Onboarding, type OnboardingResult } from './components/Onboarding';
import { TournamentCinema } from './components/TournamentCinema';
import { PreSim } from './components/PreSim';
import { SimLaunchOverlay } from './components/SimLaunchOverlay';
import { RevealCards } from './components/RevealCards';
import { HomeCardGrid, CardOverlay, type CardId, type CardDef, CARD_ICONS } from './components/HomeCards';
import { ItalyCard } from './components/ItalyCard';
import { ItalySlideshow } from './components/ItalySlideshow';
import { TabIntro } from './components/TabIntro';
import { HowItWorks } from './components/HowItWorks';
import { pctSmart } from './odds';
import { cinemaAudio } from './cinemaAudio';
import { config } from '../config';
import { Analytics } from '../analytics';
import { useT, useTeamName, LANGUAGES } from '../i18n';

/** Stop the tension/heartbeat audio when the cinema is skipped. */
const cinemaAudioStop = () => cinemaAudio.setTension(0);

/** Default modulators, from config (avoids duplicating the values). */
const DEFAULT_MODULATORS: ModulatorConfig = {
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
  whatIf: { ...config.modulators.whatIf },
};

type AppPhase = 'presim' | 'cinema' | 'reveal' | 'dashboard';

export function App() {
  const { t, tList, nf, lang, setLang } = useT();
  const teamName = useTeamName();
  /** Full-screen card open on the home (null = grid). */
  const [openCard, setOpenCard] = useState<CardId | null>(null);
  /** Full-screen Admin (gear) panel. */
  const [adminOpen, setAdminOpen] = useState(false);
  const { data, error } = useData();
  /** Shared link (?s=): skip intro + flow and go straight to the dashboard. */
  const sharedLink = useMemo(() => new URLSearchParams(window.location.search).has('s'), []);
  /**
   * Onboarding: shown only on the FIRST visit of the session. We use
   * sessionStorage so the intro reappears in a new session (new tab/window) but
   * not on every internal navigation or reload within the same session.
   */
  const seenIntro = useMemo(
    () => sharedLink || sessionStorage.getItem('mc_seen_intro') === '1',
    [sharedLink],
  );
  const [onboarded, setOnboarded] = useState(() => seenIntro);
  const [langOpen, setLangOpen] = useState(false);
  /**
   * Guided-flow phase. Returning visitors (or shared-link arrivals) land on the
   * card home; on the very first visit the onboarding runs (onboarded=false),
   * with the presim phase right after.
   */
  const [phase, setPhase] = useState<AppPhase>(() => (seenIntro ? 'dashboard' : 'presim'));
  /** Favorite team: highlighted across the UI, does NOT affect the simulation. */
  const [favoriteTeam, setFavoriteTeam] = useState<string | null>(null);
  const [modulators, setModulators] = useState<ModulatorConfig | undefined>(undefined);
  /** When true, the Teams page opens sorted by Strength Score. */
  const [rankByStrength, setRankByStrength] = useState(false);
  const [scenario, setScenario] = useState<Scenario>(() =>
    scenarioFromUrl(new URLSearchParams(window.location.search).get('s')),
  );
  const [output, setOutput] = useState<SimulationOutput | null>(null);
  /** Sample run (for the cinema): arrives BEFORE the full aggregate. */
  const [sampleRun, setSampleRun] = useState<SampleRun | null>(null);
  const [running, setRunning] = useState(false);
  /** Stays true from the "Simulate" click until the cinema starts (avoids a PreSim flash). */
  const [launching, setLaunching] = useState(false);
  /** When true, the cinematic staging covers the screen. */
  const [cinema, setCinema] = useState(false);
  /** True only for the silent autorun from a shared link (no cinema). */
  const silentRunRef = useRef(false);
  /** When true, an effect re-runs the sim after a scenario change. */
  const pendingResimRef = useRef(false);
  /** When true, onboarding just finished: start the cinema once the scenario is ready. */
  const pendingStartRef = useRef(false);
  const revealTimers = useRef<number[]>([]);
  const workerRef = useRef<Worker | null>(null);

  const teamsById = useMemo(
    () => new Map<string, Team>((data?.teams ?? []).map((t) => [t.id, t])),
    [data],
  );

  /**
   * Start the simulation. `silent=true` (shared-link autorun) skips the cinema
   * and goes straight to the dashboard: it only populates the output.
   */
  const runSimulation = (silent = false) => {
    if (!data || running) return;
    Analytics.simulationRun(scenario.italy);
    silentRunRef.current = silent;
    setRunning(true);
    if (!silent) setLaunching(true);
    setSampleRun(null);
    revealTimers.current.forEach(clearTimeout);
    revealTimers.current = [];
    // Give the staged loading time to "breathe" (the real sim is near-instant):
    // the switch to the cinema waits a minimum time from launch.
    const launchAt = performance.now();
    const MIN_LAUNCH_MS = silent ? 0 : 10000;

    const partial = scenarioToSimInput(scenario, data.teams, modulators);
    const base: SimInput = {
      teams: data.teams,
      params: data.params,
      modulators,
      ...partial,
    };

    // Serialize the Maps to entries for the worker (structured clone).
    const req: SimWorkerRequest = {
      teams: base.teams,
      params: base.params,
      h2hEntries: data.h2h ? [...data.h2h.entries()] : undefined,
      teamStatsEntries: data.teamStats ? [...data.teamStats.entries()] : undefined,
      strengthOverrides: base.strengthOverrides,
      substitutions: base.substitutions,
      numRuns: base.numRuns,
      seed: base.seed,
      chaos: base.chaos,
      modulators: base.modulators,
    };

    // Create a fresh worker per run (simple and robust).
    workerRef.current?.terminate();
    let worker: Worker;
    try {
      worker = new Worker(new URL('../ui/simWorker.ts', import.meta.url), { type: 'module' });
    } catch (err) {
      // If worker creation fails (memory, browser restrictions), don't leave the
      // UI stuck on the launch overlay: reset the state.
      console.error('Worker creation failed:', err);
      setRunning(false);
      setLaunching(false);
      revealTimers.current.forEach(clearTimeout);
      revealTimers.current = [];
      return;
    }
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<SimWorkerMessage>) => {
      const msg = e.data;
      if (msg.type === 'sample') {
        // The sample run is ready: store it and — unless this is a silent run —
        // start the cinema (the aggregate finishes in the background), but not
        // before the staged loading has had its minimum on-screen time.
        setSampleRun(msg.sample);
        if (!silentRunRef.current) {
          const wait = Math.max(0, MIN_LAUNCH_MS - (performance.now() - launchAt));
          const id = window.setTimeout(() => {
            setLaunching(false);
            setCinema(true);
            setPhase('cinema');
          }, wait);
          revealTimers.current.push(id);
        }
      } else if (msg.type === 'progress') {
        // progress ignored: the cinema covers the wait
      } else if (msg.type === 'done') {
        setOutput(msg.result);
        setRunning(false);
        worker.terminate();
        workerRef.current = null;

        const url = new URL(window.location.href);
        url.searchParams.set('s', scenarioToUrl(scenario));
        window.history.replaceState({}, '', url);
      } else if (msg.type === 'error') {
        console.error('Simulation error:', msg.message);
        setRunning(false);
        worker.terminate();
        workerRef.current = null;
      }
    };

    // Unhandled error inside the worker (e.g. exception outside the message
    // try/catch): without this handler the launch overlay would hang.
    worker.onerror = (e) => {
      console.error('Worker error:', e.message);
      setRunning(false);
      setLaunching(false);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };

    worker.postMessage(req);
  };

  // Clean up timers and worker on unmount.
  useEffect(() => () => {
    revealTimers.current.forEach(clearTimeout);
    workerRef.current?.terminate();
  }, []);

  // Silent autorun from a shared link: populate the dashboard without cinema.
  const didAutorun = useRef(false);
  useEffect(() => {
    if (sharedLink && data && !didAutorun.current && !output && !running) {
      didAutorun.current = true;
      runSimulation(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Re-simulation requested after a scenario change (e.g. "Activate Italy").
  useEffect(() => {
    if (pendingResimRef.current && !running) {
      pendingResimRef.current = false;
      runSimulation(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);

  // Cinematic start right after onboarding: the scenario is now committed, so
  // runSimulation reads the right choices and the loading + cinema begin.
  useEffect(() => {
    if (pendingStartRef.current && !running) {
      pendingStartRef.current = false;
      runSimulation(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);


  const handleOnboardingComplete = (result: OnboardingResult) => {
    setScenario(result.scenario);
    setFavoriteTeam(result.favoriteTeam);
    setOnboarded(true);
    // Intro seen for this session: won't reappear while the session lives.
    sessionStorage.setItem('mc_seen_intro', '1');
    // Onboarding ends with "Launch the simulation": no intermediate screen, start
    // immediately. runSimulation reads the just-set scenario on the next render
    // via a dedicated effect (the scenario here is still the old one).
    setPhase('presim');
    pendingStartRef.current = true;
  };

  /** Skip the entire guided flow and go to the technical dashboard. */
  const skipToDashboard = () => {
    setCinema(false);
    cinemaAudioStop();
    if (!output && !running) runSimulation(true); // the dashboard needs output
    setPhase('dashboard');
  };

  /** Activate Italy in the scenario and re-simulate (from the Italy card). */
  const activateItalyAndSim = () => {
    Analytics.italyToggleOn();
    setScenario((s) => ({ ...s, italy: true }));
    pendingResimRef.current = true;
    // Start immediately so the data is ready before the staged loading.
    setTimeout(() => {
      if (pendingResimRef.current) {
        pendingResimRef.current = false;
        runSimulation(true);
      }
    }, 0);
  };

  if (error) return <div className="app"><p className="error">{t('app.error.data', { msg: error })}</p></div>;
  if (!data) return <div className="app"><p className="muted">{t('app.loadingData')}</p></div>;

  if (!onboarded) {
    return <Onboarding teams={data.teams} onComplete={handleOnboardingComplete} />;
  }

  // ── PRE-SIM: screen with the Simulate button + scenario summary ──
  if (phase === 'presim') {
    // While the sim runs (and the cinema hasn't started) show the staged
    // loading: it covers the wait with an "epic" intro, Italy-themed if active.
    // `launching` stays true until the cinema's setTimeout, avoiding a PreSim flash.
    if (running || launching) {
      return (
        <SimLaunchOverlay
          italyActive={scenario.italy}
          favoriteName={favoriteTeam ? (teamsById.get(favoriteTeam) ? teamName(teamsById.get(favoriteTeam)!) : null) : null}
          numRuns={config.numRuns}
        />
      );
    }
    return (
      <PreSim
        scenario={scenario}
        teams={data.teams}
        running={running}
        onSimulate={() => runSimulation(false)}
        onSaveScenario={(s) => setScenario(s)}
        onBack={output ? () => setPhase('dashboard') : undefined}
      />
    );
  }

  // ── CINEMA: starts with the sample run (the aggregate runs in background) ──
  if (phase === 'cinema' && (sampleRun || output)) {
    return (
      <TournamentCinema
        sample={(output?.sample ?? sampleRun)!}
        teamsById={teamsById}
        favoriteTeam={favoriteTeam}
        italyActive={scenario.italy}
        onDone={() => { setCinema(false); setPhase('reveal'); }}
        onSkip={skipToDashboard}
      />
    );
  }

  // ── REVEAL: cards bridging the cinema to the dashboard ──
  if (phase === 'reveal' && output) {
    return (
      <RevealCards
        aggregates={output.aggregates}
        teamsById={teamsById}
        numRuns={output.numRuns}
        favoriteTeam={favoriteTeam}
        championId={(output.sample ?? sampleRun)?.championId ?? ''}
        italyActive={scenario.italy}
        onDone={() => setPhase('dashboard')}
        onOpenItaly={scenario.italy ? () => { setPhase('dashboard'); setOpenCard('italy'); } : undefined}
      />
    );
  }
  // If the cinema finished but the aggregate isn't ready, show reveal once it arrives.
  if (phase === 'reveal' && !output) {
    return (
      <div className="reveal-wait">
        <div className="reveal-spinner" aria-hidden />
        <p>{t('app.computingProbs')}</p>
      </div>
    );
  }

  // ── CARD HOME ──
  const favTeam = output && favoriteTeam ? teamsById.get(favoriteTeam) : null;
  const favName = favTeam ? teamName(favTeam) : null;

  const cards: CardDef[] = [
    {
      id: 'results', icon: CARD_ICONS.results, title: t('card.results.title'), theme: 'green', size: 'lg',
      blurb: t('card.results.blurb'),
      bigStat: output?.aggregates.length
        ? (
          <div className="bento-top10">
            {/* Row 1: ranks 1,3,5,7,9 */}
            <div className="bento-top5">
              {[0,2,4,6,8].map((idx, col) => {
                const a = output.aggregates[idx]; if (!a) return null;
                const tm = teamsById.get(a.teamId);
                return (
                  <div key={a.teamId} className={`bento-top5-row rank-${col + 1}`}>
                    <span className="bento-big-num">{pctSmart(a.winProb)}</span>
                    <span className="bento-big-cap">{tm ? teamName(tm) : a.teamId}</span>
                  </div>
                );
              })}
            </div>
            {/* Row 2: ranks 2,4,6,8,10 */}
            <div className="bento-top5 bento-top5--second">
              {[1,3,5,7,9].map((idx, col) => {
                const a = output.aggregates[idx]; if (!a) return null;
                const tm = teamsById.get(a.teamId);
                return (
                  <div key={a.teamId} className={`bento-top5-row rank-${col + 1}`}>
                    <span className="bento-big-num">{pctSmart(a.winProb)}</span>
                    <span className="bento-big-cap">{tm ? teamName(tm) : a.teamId}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )
        : null,
    },
    {
      id: 'sim', icon: CARD_ICONS.sim, title: t('card.sim.title'), theme: 'amber', size: 'md',
      blurb: t('card.sim.blurb'),
      stat: output ? (() => {
        const champTeam = teamsById.get(output.sample.championId);
        const nm = champTeam ? teamName(champTeam) : output.sample.championId;
        const [pre, post] = t('card.sim.stat').split('{name}');
        return <>{pre}<strong>{nm}</strong>{post}</>;
      })() : null,
    },
    {
      id: 'teams', icon: CARD_ICONS.teams, title: t('card.teams.title'), theme: 'violet', size: 'md',
      blurb: t('card.teams.blurb'),
    },
    {
      id: 'italy', icon: CARD_ICONS.italy, title: t('card.italy.title'), theme: 'italy', size: 'lg',
      blurb: scenario.italy ? t('card.italy.blurb.active') : t('card.italy.blurb.inactive'),
      stat: favName ? <>♥ {favName}</> : null,
      slideshow: <ItalySlideshow />,
    },
    {
      id: 'matchup', icon: CARD_ICONS.matchup, title: t('card.matchup.title'), theme: 'cyan', size: 'md',
      blurb: t('card.matchup.blurb'),
    },
    {
      id: 'howto', icon: CARD_ICONS.howto, title: t('card.howto.title'), theme: 'slate', size: 'sm',
      blurb: t('card.howto.blurb'),
    },
  ];

  return (
    <div className="app home">
      {cinema && (sampleRun || output) && (
        <TournamentCinema
          sample={(output?.sample ?? sampleRun)!}
          teamsById={teamsById}
          favoriteTeam={favoriteTeam}
          italyActive={scenario.italy}
          onDone={() => setCinema(false)}
          onSkip={() => setCinema(false)}
        />
      )}

      {/* Header */}
      <header className="home-header">
        <div className="home-brand">
          <img src="/logo.png" alt="World Cup Multiverse" className="home-brand-logo" />
          <div>
            <h1 className="home-brand-name">World Cup Multiverse</h1>
            <span className="home-tagline">{t('header.tagline')}</span>
          </div>
        </div>
        <div className="home-header-actions">
          <button className="home-newsim-btn" onClick={() => setPhase('presim')} title={t('header.newSim.title')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            {t('header.newSim')}
          </button>
          {/* Language switch: active language's flag → dropdown. */}
          <div className="lang-switch">
            <button
              className="home-icon-btn lang-trigger"
              onClick={() => setLangOpen((o) => !o)}
              title={t('common.changeLanguage')}
              aria-haspopup="listbox"
              aria-expanded={langOpen}
            >
              <span className={`fi fi-${LANGUAGES.find((l) => l.code === lang)?.flag} lang-flag`} aria-hidden />
              <svg className="lang-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {langOpen && (
              <>
                <div className="lang-backdrop" onClick={() => setLangOpen(false)} />
                <div className="lang-menu" role="listbox">
                  <div className="lang-menu-head">{t('common.language')}</div>
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      role="option"
                      aria-selected={lang === l.code}
                      className={`lang-opt ${lang === l.code ? 'active' : ''}`}
                      onClick={() => { setLang(l.code); setLangOpen(false); }}
                    >
                      <span className={`fi fi-${l.flag} lang-opt-flag`} aria-hidden />
                      <span className="lang-opt-label">{l.label}</span>
                      {lang === l.code && (
                        <svg className="lang-check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button className="home-icon-btn" onClick={() => setAdminOpen(true)} title={t('header.settings')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Card grid */}
      <HomeCardGrid cards={cards} onOpen={(id) => {
        if (id === 'sim') Analytics.bracketViewed();
        setOpenCard(id);
      }} />

      {/* ── OVERLAY: My simulation ── */}
      {openCard === 'sim' && (
        <CardOverlay title={t('overlay.sim.title')} icon={CARD_ICONS.sim} onClose={() => setOpenCard(null)}>
          {output ? (
            <>
              <RunDetail
                sample={output.sample}
                teamsById={teamsById}
                favoriteTeam={favoriteTeam}
                onReplay={() => setCinema(true)}
                numRuns={output.numRuns}
              />
            </>
          ) : (
            <div className="ov-nosim">
              <div className="ov-nosim-icon">🎲</div>
              <h3 className="ov-nosim-title">{t('nosim.title')}</h3>
              <p className="ov-nosim-body">{t('nosim.sim.body')}</p>
              <button className="ov-nosim-btn" onClick={() => { setOpenCard(null); setPhase('presim'); }}>
                {t('nosim.cta')}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 8 }}>
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
            </div>
          )}
        </CardOverlay>
      )}

      {/* ── OVERLAY: Monte Carlo results ── */}
      {openCard === 'results' && (
        <CardOverlay title={t('overlay.results.title')} icon={CARD_ICONS.results} onClose={() => setOpenCard(null)}>
          {!output && (
            <div className="ov-nosim">
              <div className="ov-nosim-icon">📊</div>
              <h3 className="ov-nosim-title">{t('nosim.title')}</h3>
              <p className="ov-nosim-body">{t('nosim.results.body')}</p>
              <button className="ov-nosim-btn" onClick={() => { setOpenCard(null); setPhase('presim'); }}>
                {t('nosim.cta')}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 8 }}>
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
            </div>
          )}
          {output && (
            <>
              <p className="ov-lead">
                {t('results.lead', { n: nf(output.numRuns) })}{scenario.italy ? t('results.lead.italy') : ''}
              </p>
              <Standings
                aggregates={output.aggregates}
                teamsById={teamsById}
                italyActive={scenario.italy}
                favoriteTeam={favoriteTeam}
              />
              <PhaseTable
                aggregates={output.aggregates}
                teamsById={teamsById}
                numRuns={output.numRuns}
                italyActive={scenario.italy}
                favoriteTeam={favoriteTeam}
              />
            </>
          )}
        </CardOverlay>
      )}

      {/* ── OVERLAY: Matchup ── */}
      {openCard === 'matchup' && (
        <CardOverlay title={t('overlay.matchup.title')} icon={CARD_ICONS.matchup} onClose={() => setOpenCard(null)}>
          <TabIntro
            icon="⚔️" title={t('tabintro.matchup.title')}
            subtitle={t('tabintro.matchup.subtitle')}
            hints={tList('tabintro.matchup.hints')}
          />
          <MatchupPage
            teams={data.teams}
            params={data.params}
            h2h={data.h2h}
            teamStats={data.teamStats}
            modulators={modulators}
          />
        </CardOverlay>
      )}

      {/* ── OVERLAY: How it works ── */}
      {openCard === 'howto' && (
        <CardOverlay title={t('overlay.howto.title')} icon={CARD_ICONS.howto} onClose={() => setOpenCard(null)}>
          <HowItWorks
            modulators={modulators}
            onOpenAdmin={() => { setOpenCard(null); setTimeout(() => setAdminOpen(true), 80); }}
            teams={data.teams}
            params={data.params}
            h2h={data.h2h}
            teamStats={data.teamStats}
          />
        </CardOverlay>
      )}

      {/* ── OVERLAY: Teams ── */}
      {openCard === 'teams' && (
        <CardOverlay title={t('overlay.teams.title')} icon={CARD_ICONS.teams} onClose={() => setOpenCard(null)}>
          <TabIntro
            icon="🌍" title={t('tabintro.teams.title', { n: scenario.italy ? '49' : '48' })}
            subtitle={t('tabintro.teams.subtitle')}
            hints={tList('tabintro.teams.hints')}
          />
          <TeamsPage
            teams={data.teams}
            h2h={data.h2h}
            italyActive={scenario.italy}
            params={data.params}
            paramsSource={data.paramsSource}
            teamStats={data.teamStats}
            modulators={modulators ?? DEFAULT_MODULATORS}
            rankByStrength={rankByStrength}
            onConsumeRankByStrength={() => setRankByStrength(false)}
          />
        </CardOverlay>
      )}

      {/* ── OVERLAY: Italy focus ── */}
      {openCard === 'italy' && (
        <CardOverlay title={t('overlay.italy.title')} icon={CARD_ICONS.italy} onClose={() => setOpenCard(null)}>
          <ItalyCard
            teams={data.teams}
            params={data.params}
            teamStats={data.teamStats}
            italyActive={scenario.italy}
            aggregates={output?.aggregates}
            numRuns={output?.numRuns}
            onActivate={activateItalyAndSim}
            heroImage="/data/italy-hero.jpg"
          />
        </CardOverlay>
      )}

      {/* ── OVERLAY: Admin (gear) ── */}
      {adminOpen && (
        <CardOverlay title={t('overlay.admin.title')} icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>} onClose={() => setAdminOpen(false)}>
          <AdminPage
            modulators={modulators ?? DEFAULT_MODULATORS}
            teams={data.teams}
            params={data.params}
            h2h={data.h2h}
            teamStats={data.teamStats}
            onChange={(m) => setModulators(m)}
            onApplyAndSimulate={(m) => {
              // Apply the weights and go to the scenario-selection page (like
              // "New simulation"): from there the user launches the simulation.
              setModulators(m);
              setAdminOpen(false);
              setOpenCard(null);
              setPhase('presim');
            }}
            onGenerateRanking={(m) => {
              setModulators(m);
              setRankByStrength(true);
              setAdminOpen(false);
              setOpenCard('teams');
            }}
          />
        </CardOverlay>
      )}
    </div>
  );
}
