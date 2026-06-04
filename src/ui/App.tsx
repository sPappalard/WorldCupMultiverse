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
import { RevealCards } from './components/RevealCards';
import { HomeCardGrid, CardOverlay, type CardId, type CardDef, CARD_ICONS } from './components/HomeCards';
import { ItalyCard } from './components/ItalyCard';
import { ItalySlideshow } from './components/ItalySlideshow';
import { TabIntro } from './components/TabIntro';
import { HowItWorks } from './components/HowItWorks';
import { pctSmart } from './odds';
import { cinemaAudio } from './cinemaAudio';
import { config } from '../config';

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

/** Fasi del flusso guidato. La dashboard è il punto d'arrivo (e di ritorno). */
type AppPhase = 'presim' | 'cinema' | 'reveal' | 'dashboard';

export function App() {
  /** Card aperta a schermo pieno nella home (null = griglia). */
  const [openCard, setOpenCard] = useState<CardId | null>(null);
  /** Pannello Admin (ingranaggio) a schermo pieno. */
  const [adminOpen, setAdminOpen] = useState(false);
  const { data, error } = useData();
  /** Se il link è condiviso (?s=), salta intro+flusso e va dritto alla dashboard. */
  const sharedLink = useMemo(() => new URLSearchParams(window.location.search).has('s'), []);
  /** Onboarding: mostrato finché l'utente non completa le scelte iniziali. */
  const [onboarded, setOnboarded] = useState(() => sharedLink);
  /** Fase del flusso guidato. Link condiviso ⇒ parte dalla dashboard. */
  const [phase, setPhase] = useState<AppPhase>(() => (sharedLink ? 'dashboard' : 'presim'));
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
  /** Quando true, la messa in scena cinematografica copre lo schermo. */
  const [cinema, setCinema] = useState(false);
  /** True solo per l'autorun silenzioso da link condiviso (niente cinema). */
  const silentRunRef = useRef(false);
  /** Quando true, un effect rilancia la sim dopo un cambio di scenario. */
  const pendingResimRef = useRef(false);
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
    silentRunRef.current = silent;
    setRunning(true);
    setSampleRun(null);
    revealTimers.current.forEach(clearTimeout);
    revealTimers.current = [];

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
    const worker = new Worker(new URL('../ui/simWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<SimWorkerMessage>) => {
      const msg = e.data;
      if (msg.type === 'sample') {
        // La sample run è pronta: salvala e — se non è un run silenzioso —
        // fai partire SUBITO il cinema (l'aggregato finisce in background).
        setSampleRun(msg.sample);
        if (!silentRunRef.current) {
          setCinema(true);
          setPhase('cinema');
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


  const handleOnboardingComplete = (result: OnboardingResult) => {
    setScenario(result.scenario);
    setFavoriteTeam(result.favoriteTeam);
    setOnboarded(true);
    setPhase('presim');
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
    setScenario((s) => ({ ...s, italy: true }));
    // resta nella card — la sim riparte in background tramite l'effect
    pendingResimRef.current = true;
  };

  if (error) return <div className="app"><p className="error">Errore dati: {error}</p></div>;
  if (!data) return <div className="app"><p className="muted">Caricamento dati…</p></div>;

  if (!onboarded) {
    return <Onboarding teams={data.teams} onComplete={handleOnboardingComplete} />;
  }

  // ── PRE-SIM: schermata con bottone Simula + riepilogo scenario ──
  if (phase === 'presim') {
    return (
      <PreSim
        scenario={scenario}
        teams={data.teams}
        favoriteTeam={favoriteTeam}
        running={running}
        onSimulate={() => runSimulation(false)}
        onEditScenario={() => setOnboarded(false)}
        onSkip={skipToDashboard}
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
      />
    );
  }
  // Se il cinema è finito ma l'aggregato non è ancora pronto, mostra reveal appena arriva.
  if (phase === 'reveal' && !output) {
    return (
      <div className="reveal-wait">
        <div className="reveal-spinner" aria-hidden />
        <p>Calcolo delle probabilità…</p>
      </div>
    );
  }

  // ── HOME A CARD ──
  const champ = output ? teamsById.get(output.aggregates[0]?.teamId ?? '') : null;
  const favName = output && favoriteTeam ? teamsById.get(favoriteTeam)?.name : null;

  const champProb = output?.aggregates[0]?.winProb;

  const cards: CardDef[] = [
    {
      id: 'results', icon: CARD_ICONS.results, title: 'Risultati Monte Carlo', theme: 'green', size: 'lg',
      blurb: 'Chi vince il Mondiale e fin dove arriva ogni squadra — probabilità aggregate su 100.000 simulazioni.',
      bigStat: champ && champProb !== undefined
        ? <><span className="bento-big-num">{pctSmart(champProb)}</span><span className="bento-big-cap">{champ.name}</span></>
        : null,
    },
    {
      id: 'sim', icon: CARD_ICONS.sim, title: 'La mia simulazione', theme: 'amber', size: 'md',
      blurb: 'Gironi e tabellone della tua run — una possibilità concreta su 100.000.',
      stat: output ? <><strong>{teamsById.get(output.sample.championId)?.name}</strong> ha vinto</> : null,
    },
    {
      id: 'teams', icon: CARD_ICONS.teams, title: 'Squadre', theme: 'violet', size: 'md',
      blurb: '49 nazionali con tutti i parametri: Elo, attacco, difesa, forma, esperienza KO.',
    },
    {
      id: 'italy', icon: CARD_ICONS.italy, title: 'Focus Italia', theme: 'italy', size: 'lg',
      blurb: scenario.italy ? 'Il cammino degli Azzurri in questo scenario.' : 'Cosa succederebbe se l\'Italia fosse nel Girone B — il what-if fondamentale.',
      stat: favName ? <>♥ {favName}</> : null,
      slideshow: <ItalySlideshow />,
    },
    {
      id: 'matchup', icon: CARD_ICONS.matchup, title: 'Confronto', theme: 'cyan', size: 'md',
      blurb: 'Due nazionali una contro l\'altra: probabilità, risultati più probabili, parametri a confronto.',
    },
    {
      id: 'howto', icon: CARD_ICONS.howto, title: 'Come funziona', theme: 'slate', size: 'sm',
      blurb: 'Metodologia, fonti dati, limiti del modello.',
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
            <h1 className="home-brand-name">MonteCalcio</h1>
            <span className="home-tagline">Mondiali 2026 · simulatore Monte Carlo</span>
          </div>
        </div>
        <div className="home-header-actions">
          <button className="home-newsim-btn" onClick={() => setPhase('presim')} title="Cambia scenario e simula di nuovo">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Nuova simulazione
          </button>
          <button className="home-icon-btn" onClick={() => setOnboarded(false)} title="Rivedi l'introduzione">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
          <button className="home-icon-btn" onClick={() => setAdminOpen(true)} title="Impostazioni avanzate">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Griglia card */}
      <HomeCardGrid cards={cards} onOpen={setOpenCard} />

      {/* ── OVERLAY: La mia simulazione ── */}
      {openCard === 'sim' && (
        <CardOverlay title="La mia simulazione" icon={CARD_ICONS.sim} onClose={() => setOpenCard(null)}>
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
              <h3 className="ov-nosim-title">Nessuna simulazione ancora</h3>
              <p className="ov-nosim-body">
                Lancia una simulazione per vedere come va il torneo nella tua run.
              </p>
              <button className="ov-nosim-btn" onClick={() => { setOpenCard(null); setPhase('presim'); }}>
                Vai alla simulazione
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
        <CardOverlay title="Risultati Monte Carlo" icon={CARD_ICONS.results} onClose={() => setOpenCard(null)}>
          {!output && (
            <div className="ov-nosim">
              <div className="ov-nosim-icon">📊</div>
              <h3 className="ov-nosim-title">Nessuna simulazione ancora</h3>
              <p className="ov-nosim-body">
                Lancia una simulazione per vedere le probabilità aggregate su 100.000 run.
              </p>
              <button className="ov-nosim-btn" onClick={() => { setOpenCard(null); setPhase('presim'); }}>
                Vai alla simulazione
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 8 }}>
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
            </div>
          )}
          {output && (
            <>
              <p className="ov-lead">
                Aggregato di {output.numRuns.toLocaleString('it-IT')} simulazioni: le probabilità
                reali del torneo.{scenario.italy ? " 🇮🇹 Con l'Italia nel Girone B." : ''}
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
        <CardOverlay title="Confronto tra squadre" icon={CARD_ICONS.matchup} onClose={() => setOpenCard(null)}>
          <TabIntro
            icon="⚔️" title="Chi è favorita?"
            subtitle="Scegli due nazionali: probabilità di vittoria, risultati più probabili, scontri diretti e parametri a confronto."
            hints={['Frecce ‹ › o menu per cambiare squadra', '”Girone” = fase a gruppi (pareggio possibile), “Eliminazione” = fase a eliminazione diretta (con rigori)', '”vs tutte” sotto ogni squadra per vedere tutte le sfide']}
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
        <CardOverlay title="Come funziona" icon={CARD_ICONS.howto} onClose={() => setOpenCard(null)}>
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
        <CardOverlay title="Squadre partecipanti" icon={CARD_ICONS.teams} onClose={() => setOpenCard(null)}>
          <TabIntro
            icon="🌍" title={`Le ${scenario.italy ? '49' : '48'} nazionali`}
            subtitle="Tutti i parametri usati dal motore: Elo, valore rosa, forma, esperienza, storia."
            hints={['Ordina coi pulsanti in alto', 'Clicca una squadra per il profilo e gli scontri diretti']}
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
        <CardOverlay title="Focus Italia" icon={CARD_ICONS.italy} onClose={() => setOpenCard(null)}>
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
        <CardOverlay title="Impostazioni avanzate" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>} onClose={() => setAdminOpen(false)}>
          <AdminPage
            modulators={modulators ?? DEFAULT_MODULATORS}
            teams={data.teams}
            params={data.params}
            h2h={data.h2h}
            teamStats={data.teamStats}
            onChange={(m) => setModulators(m)}
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
