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

/** Ferma il battito/tensione audio quando si salta il cinema. */
const cinemaAudioStop = () => cinemaAudio.setTension(0);

/** Default dei modulatori, da config (evita duplicazione dei valori). */
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
  /** Card aperta a schermo pieno nella home (null = griglia). */
  const [openCard, setOpenCard] = useState<CardId | null>(null);
  /** Pannello Admin (ingranaggio) a schermo pieno. */
  const [adminOpen, setAdminOpen] = useState(false);
  const { data, error } = useData();
  /** Se il link è condiviso (?s=), salta intro+flusso e va dritto alla dashboard. */
  const sharedLink = useMemo(() => new URLSearchParams(window.location.search).has('s'), []);
  /**
   * Onboarding: mostrato solo alla PRIMA visita della sessione. Usiamo
   * sessionStorage così l'intro riappare in una nuova sessione (tab/finestra
   * nuova) ma non a ogni navigazione interna o reload nella stessa sessione.
   */
  const seenIntro = useMemo(
    () => sharedLink || sessionStorage.getItem('mc_seen_intro') === '1',
    [sharedLink],
  );
  const [onboarded, setOnboarded] = useState(() => seenIntro);
  const [langOpen, setLangOpen] = useState(false);
  /**
   * Fase del flusso guidato. Chi ha già visto l'intro (o arriva da link
   * condiviso) atterra sulla home a card; alla primissima visita parte invece
   * l'onboarding (onboarded=false), e la fase presim serve subito dopo.
   */
  const [phase, setPhase] = useState<AppPhase>(() => (seenIntro ? 'dashboard' : 'presim'));
  /** Squadra del cuore: evidenziata in tutta la UI, NON tocca la simulazione. */
  const [favoriteTeam, setFavoriteTeam] = useState<string | null>(null);
  const [modulators, setModulators] = useState<ModulatorConfig | undefined>(undefined);
  /** Quando true, la pagina Squadre apre ordinata per Punteggio Forza. */
  const [rankByStrength, setRankByStrength] = useState(false);
  const [scenario, setScenario] = useState<Scenario>(() =>
    scenarioFromUrl(new URLSearchParams(window.location.search).get('s')),
  );
  const [output, setOutput] = useState<SimulationOutput | null>(null);
  /** Sample run (per il cinema): arriva PRIMA dell'aggregato completo. */
  const [sampleRun, setSampleRun] = useState<SampleRun | null>(null);
  const [running, setRunning] = useState(false);
  /** Rimane true dal click "Simula" finché il cinema parte (evita il flash di PreSim). */
  const [launching, setLaunching] = useState(false);
  /** Quando true, la messa in scena cinematografica copre lo schermo. */
  const [cinema, setCinema] = useState(false);
  /** True solo per l'autorun silenzioso da link condiviso (niente cinema). */
  const silentRunRef = useRef(false);
  /** Quando true, un effect rilancia la sim dopo un cambio di scenario. */
  const pendingResimRef = useRef(false);
  /** Quando true, l'onboarding ha appena finito: lancia il cinema appena lo scenario è pronto. */
  const pendingStartRef = useRef(false);
  const revealTimers = useRef<number[]>([]);
  const workerRef = useRef<Worker | null>(null);

  const teamsById = useMemo(
    () => new Map<string, Team>((data?.teams ?? []).map((t) => [t.id, t])),
    [data],
  );

  /**
   * Avvia la simulazione. `silent=true` (autorun da link condiviso) salta il
   * cinema e va dritto alla dashboard: serve solo a popolare l'output.
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
    // Per dare tempo al loading scenico di "respirare" (la sim vera è quasi
    // istantanea), il passaggio al cinema attende un minimo dall'avvio.
    const launchAt = performance.now();
    const MIN_LAUNCH_MS = silent ? 0 : 10000;

    const partial = scenarioToSimInput(scenario, data.teams, modulators);
    const base: SimInput = {
      teams: data.teams,
      params: data.params,
      modulators,
      ...partial,
    };

    // Serializza le Map in entries per il worker (structured clone).
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

    // Crea un worker fresco per ogni run (semplice e robusto).
    workerRef.current?.terminate();
    let worker: Worker;
    try {
      worker = new Worker(new URL('../ui/simWorker.ts', import.meta.url), { type: 'module' });
    } catch (err) {
      // Se la creazione del worker fallisce (memoria, restrizioni del browser),
      // non lasciare la UI appesa sull'overlay di lancio: ripristina lo stato.
      console.error('Creazione worker fallita:', err);
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
        // La sample run è pronta: salvala e — se non è un run silenzioso —
        // fai partire il cinema (l'aggregato finisce in background), ma non prima
        // che il loading scenico abbia avuto il suo minimo di scena.
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
        // progresso ignorato: il cinema copre l'attesa
      } else if (msg.type === 'done') {
        setOutput(msg.result);
        setRunning(false);
        worker.terminate();
        workerRef.current = null;

        const url = new URL(window.location.href);
        url.searchParams.set('s', scenarioToUrl(scenario));
        window.history.replaceState({}, '', url);
      } else if (msg.type === 'error') {
        console.error('Errore simulazione:', msg.message);
        setRunning(false);
        worker.terminate();
        workerRef.current = null;
      }
    };

    // Errore non gestito dentro il worker (es. eccezione fuori dal try/catch del
    // messaggio): senza questo handler l'overlay di lancio resterebbe appeso.
    worker.onerror = (e) => {
      console.error('Errore worker:', e.message);
      setRunning(false);
      setLaunching(false);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };

    worker.postMessage(req);
  };

  // Pulizia timer e worker allo smontaggio.
  useEffect(() => () => {
    revealTimers.current.forEach(clearTimeout);
    workerRef.current?.terminate();
  }, []);

  // Autorun silenzioso da link condiviso: popola la dashboard senza cinema.
  const didAutorun = useRef(false);
  useEffect(() => {
    if (sharedLink && data && !didAutorun.current && !output && !running) {
      didAutorun.current = true;
      runSimulation(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Ri-simulazione richiesta dopo un cambio di scenario (es. "Attiva Italia").
  useEffect(() => {
    if (pendingResimRef.current && !running) {
      pendingResimRef.current = false;
      runSimulation(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);

  // Avvio cinematografico subito dopo l'onboarding: lo scenario è ora committato,
  // quindi runSimulation legge le scelte giuste e parte il loading + cinema.
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
    // Intro vista per questa sessione: non riapparirà più finché la sessione vive.
    sessionStorage.setItem('mc_seen_intro', '1');
    // L'onboarding finisce con "Lancia la simulazione": niente schermata intermedia,
    // si parte subito. runSimulation legge lo scenario appena impostato al prossimo
    // render tramite un effect dedicato (lo scenario qui è ancora quello vecchio).
    setPhase('presim');
    pendingStartRef.current = true;
  };

  /** Salta tutto il flusso guidato e va alla dashboard tecnica. */
  const skipToDashboard = () => {
    setCinema(false);
    cinemaAudioStop();
    if (!output && !running) runSimulation(true); // serve l'output per la dashboard
    setPhase('dashboard');
  };

  /** Attiva l'Italia nello scenario e ri-simula (dalla card Italia). */
  const activateItalyAndSim = () => {
    Analytics.italyToggleOn();
    setScenario((s) => ({ ...s, italy: true }));
    pendingResimRef.current = true;
    // Avvia subito in modo che i dati siano pronti prima del loading fittizio
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

  // ── PRE-SIM: schermata con bottone Simula + riepilogo scenario ──
  if (phase === 'presim') {
    // Mentre la sim gira (e il cinema non è ancora partito) mostra il loading
    // scenico: copre l'attesa con un ingresso "epico", a tema Italia se attiva.
    // `launching` rimane true fino al setTimeout del cinema, evitando il flash di PreSim.
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

  // ── CINEMA: parte con la sample run (l'aggregato gira in background) ──
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

  // ── REVEAL: schede che traghettano dal cinema alla dashboard ──
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
  // Se il cinema è finito ma l'aggregato non è ancora pronto, mostra reveal appena arriva.
  if (phase === 'reveal' && !output) {
    return (
      <div className="reveal-wait">
        <div className="reveal-spinner" aria-hidden />
        <p>{t('app.computingProbs')}</p>
      </div>
    );
  }

  // ── HOME A CARD ──
  const favTeam = output && favoriteTeam ? teamsById.get(favoriteTeam) : null;
  const favName = favTeam ? teamName(favTeam) : null;

  const cards: CardDef[] = [
    {
      id: 'results', icon: CARD_ICONS.results, title: t('card.results.title'), theme: 'green', size: 'lg',
      blurb: t('card.results.blurb'),
      bigStat: output?.aggregates.length
        ? (
          <div className="bento-top10">
            {/* Riga 1: posizioni 1,3,5,7,9 */}
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
            {/* Riga 2: posizioni 2,4,6,8,10 */}
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
          <span className="home-brand-ball">⚽</span>
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
          {/* Selettore lingua: bandiera della lingua attiva → dropdown premium. */}
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

      {/* Griglia card */}
      <HomeCardGrid cards={cards} onOpen={(id) => {
        if (id === 'sim') Analytics.bracketViewed();
        setOpenCard(id);
      }} />

      {/* ── OVERLAY: La mia simulazione ── */}
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

      {/* ── OVERLAY: Risultati Monte Carlo ── */}
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

      {/* ── OVERLAY: Confronto ── */}
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

      {/* ── OVERLAY: Come funziona ── */}
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

      {/* ── OVERLAY: Squadre ── */}
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

      {/* ── OVERLAY: Focus Italia ── */}
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

      {/* ── OVERLAY: Admin (ingranaggio) ── */}
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
              // Applica i pesi e porta alla pagina di scelta scenario (come
              // "Nuova simulazione"): da lì l'utente lancia la simulazione.
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
