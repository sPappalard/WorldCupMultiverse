import { useEffect, useMemo, useRef, useState } from 'react';
import { type SimInput } from '../engine/simulator';
import type { SimulationOutput, Team, ModulatorConfig } from '../engine/types';
import { useData } from './useData';
import {
  scenarioToSimInput,
  scenarioToUrl,
  scenarioFromUrl,
  emptyScenario,
  type Scenario,
} from './scenario';
import type { SimWorkerRequest, SimWorkerMessage } from './simWorker';
import { Standings } from './components/Standings';
import { Bracket } from './components/Bracket';
import { WhatIfPanel } from './components/WhatIfPanel';
import { ShareCard } from './components/ShareCard';
import { GroupMatches } from './components/GroupMatches';
import { MatchupPage } from './components/MatchupPage';
import { TeamsPage } from './components/TeamsPage';
import { AdminPage } from './components/AdminPage';
import { SimLoadingOverlay } from './components/SimLoadingOverlay';
import { Onboarding, type OnboardingResult } from './components/Onboarding';
import { TournamentCinema } from './components/TournamentCinema';
import { config } from '../config';

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

type AppTab = 'simulator' | 'matchup' | 'teams' | 'admin';

export function App() {
  const [tab, setTab] = useState<AppTab>('simulator');
  const { data, error } = useData();
  /** Onboarding: mostrato finché l'utente non completa le scelte iniziali. */
  const [onboarded, setOnboarded] = useState(
    () => new URLSearchParams(window.location.search).has('s'), // link condiviso ⇒ salta intro
  );
  /** Squadra del cuore: evidenziata in tutta la UI, NON tocca la simulazione. */
  const [favoriteTeam, setFavoriteTeam] = useState<string | null>(null);
  const [modulators, setModulators] = useState<ModulatorConfig | undefined>(undefined);
  /** Quando true, la pagina Squadre apre ordinata per Punteggio Forza. */
  const [rankByStrength, setRankByStrength] = useState(false);
  const [scenario, setScenario] = useState<Scenario>(() =>
    scenarioFromUrl(new URLSearchParams(window.location.search).get('s')),
  );
  const [output, setOutput] = useState<SimulationOutput | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  /** Quando true, la messa in scena cinematografica copre lo schermo. */
  const [cinema, setCinema] = useState(false);
  const [revealedRound, setRevealedRound] = useState(-1);
  const revealTimers = useRef<number[]>([]);
  const workerRef = useRef<Worker | null>(null);

  const teamsById = useMemo(
    () => new Map<string, Team>((data?.teams ?? []).map((t) => [t.id, t])),
    [data],
  );

  const runSimulation = () => {
    if (!data || running) return;
    setRunning(true);
    setProgress(0);
    setRevealedRound(-1);
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
      if (msg.type === 'progress') {
        setProgress(msg.fraction);
      } else if (msg.type === 'done') {
        setOutput(msg.result);
        setRunning(false);
        setProgress(1);
        worker.terminate();
        workerRef.current = null;

        // La messa in scena cinematografica racconta la run; il tabellone
        // statico nella dashboard resta tutto rivelato (il cinema lo precede).
        setRevealedRound(msg.result.sample.knockoutRounds.length - 1);
        setCinema(true);

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

  const shareUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('s', scenarioToUrl(scenario));
    return url.toString();
  }, [scenario]);

  const handleOnboardingComplete = (result: OnboardingResult) => {
    setScenario(result.scenario);
    setFavoriteTeam(result.favoriteTeam);
    setOnboarded(true);
  };

  if (error) return <div className="app"><p className="error">Errore dati: {error}</p></div>;
  if (!data) return <div className="app"><p className="muted">Caricamento dati…</p></div>;

  if (!onboarded) {
    return <Onboarding teams={data.teams} onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="app">
      {running && <SimLoadingOverlay progress={progress} numRuns={config.numRuns} />}
      {cinema && output && (
        <TournamentCinema
          sample={output.sample}
          teamsById={teamsById}
          favoriteTeam={favoriteTeam}
          italyActive={scenario.italy}
          onDone={() => setCinema(false)}
        />
      )}
      <nav className="app-tabs">
        <button
          className={`app-tab ${tab === 'simulator' ? 'active' : ''}`}
          onClick={() => setTab('simulator')}
        >
          ▶ Simulatore
        </button>
        <button
          className={`app-tab ${tab === 'matchup' ? 'active' : ''}`}
          onClick={() => setTab('matchup')}
        >
          ⚔️ Confronto
        </button>
        <button
          className={`app-tab ${tab === 'teams' ? 'active' : ''}`}
          onClick={() => setTab('teams')}
        >
          🌍 Squadre partecipanti
        </button>
        <button
          className={`app-tab app-tab--admin ${tab === 'admin' ? 'active' : ''}`}
          onClick={() => setTab('admin')}
        >
          ⚙️ Admin
        </button>
        <button
          className="app-tab app-tab--intro"
          onClick={() => setOnboarded(false)}
          title="Rivedi la schermata iniziale"
        >
          ✨ Intro
        </button>
      </nav>

      <header className="hero">
        <h1>
          ⚽ MonteCalcio
          <span className="hero-sub">Force-Pushing Italy to the World Cup</span>
        </h1>
        {tab === 'simulator' && (
          <>
            <p className="muted">
              Simulatore Monte Carlo dei Mondiali 2026. Motore Poisson bivariato (Dixon-Coles),{' '}
              {data.paramsSource === 'bayesian'
                ? 'parametri stimati offline con modello bayesiano.'
                : 'parametri derivati da Elo (in attesa del fitting bayesiano).'}
            </p>
            <button className="big-sim" onClick={runSimulation} disabled={running}>
              {running ? 'Simulazione in corso…' : '▶ Simula'}
            </button>
            {output && (
              <p className="small muted">
                {output.numRuns.toLocaleString('it-IT')} run completate.{' '}
                {scenario.italy && '🇮🇹 Italia inserita nel Girone B. '}
                <button className="replay-link" onClick={() => setCinema(true)}>
                  🎬 Rivedi l’animazione
                </button>
              </p>
            )}
          </>
        )}
        {tab === 'teams' && (
          <p className="muted">
            48 squadre partecipanti ai Mondiali 2026 + Italia (scenario what-if).
            Parametri usati dalla simulazione Monte Carlo.
          </p>
        )}
      </header>

      {tab === 'matchup' && (
        <MatchupPage
          teams={data.teams}
          params={data.params}
          h2h={data.h2h}
          teamStats={data.teamStats}
          modulators={modulators}
        />
      )}

      {tab === 'teams' && (
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
      )}

      {tab === 'admin' && (
        <AdminPage
          modulators={modulators ?? DEFAULT_MODULATORS}
          teams={data.teams}
          params={data.params}
          h2h={data.h2h}
          teamStats={data.teamStats}
          onChange={(m) => {
            setModulators(m);
          }}
          onGenerateRanking={(m) => {
            setModulators(m);
            setRankByStrength(true);
            setTab('teams');
          }}
        />
      )}

      {tab === 'simulator' && (
        <div className="layout">
          <aside className="sidebar">
            <WhatIfPanel
              scenario={scenario}
              teams={data.teams}
              onChange={(s) => setScenario(s)}
            />
            <button className="resim" onClick={runSimulation} disabled={running}>
              🔄 Ri-simula con questi scenari
            </button>
            {scenario !== emptyScenario && (
              <button
                className="reset"
                onClick={() => setScenario({ ...emptyScenario })}
              >
                Azzera scenari
              </button>
            )}
          </aside>

          <main className="content">
            {!output && (
              <div className="card empty">
                <p>Premi <strong>Simula</strong> per far girare {config.numRuns.toLocaleString('it-IT')} mondiali nel browser.</p>
              </div>
            )}
            {output && (
              <>
                <Standings
                  aggregates={output.aggregates}
                  teamsById={teamsById}
                  italyActive={scenario.italy}
                  favoriteTeam={favoriteTeam}
                />
                <GroupMatches
                  sample={output.sample}
                  teamsById={teamsById}
                  favoriteTeam={favoriteTeam}
                />
                <Bracket
                  sample={output.sample}
                  teamsById={teamsById}
                  aggregates={output.aggregates}
                  revealedRound={revealedRound}
                  favoriteTeam={favoriteTeam}
                />
                <ShareCard
                  aggregates={output.aggregates}
                  teamsById={teamsById}
                  scenario={scenario}
                  shareUrl={shareUrl}
                />
              </>
            )}
          </main>
        </div>
      )}

      <footer className="footer">
        <p className="small muted">
          Approccio deliberatamente semplice: l'obiettivo è l'engagement, non
          battere i bookmaker. I fattori "what-if" sono euristiche giocose. Elo
          snapshot gennaio 2026. Nessun marchio FIFA ufficiale.
        </p>
      </footer>
    </div>
  );
}
