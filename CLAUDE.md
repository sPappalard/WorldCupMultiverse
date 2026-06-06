# CLAUDE.md — MonteCalcio

Guidance for AI agents working on this repo. Concise and operational.

## What it is

**World Cup Multiverse** (repo codename **MonteCalcio**): a free, client-side web
app that simulates the 2026 World Cup (48 teams) via Monte Carlo and shows win
probabilities. Flagship feature: a toggle that inserts Italy into Group B in
Bosnia's place. A showcase product for a Technical PM profile — visual polish and
methodological honesty matter more than model complexity.

The UI is fully built (onboarding → animated "cinema" → reveal → card dashboard),
multilingual (IT/EN exposed; ES/FR dictionaries WIP), with an Admin tuning panel.

## Commands

```bash
npm install
npm run dev          # dev server (Vite) → http://localhost:5173
npm run build        # production build → dist/  (tsc -b && vite build)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .
npx vitest run       # engine tests (no dedicated npm script)

# Offline Python pipeline (build-time, NOT in production)
cd model
py -3.12 -m venv .venv          # use Python 3.11–3.13, NOT 3.14 (PyMC wheels)
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe fit.py             # → public/data/model-params.json
.venv\Scripts\python.exe build_h2h.py       # → public/data/h2h.json
.venv\Scripts\python.exe build_team_stats.py# → public/data/team-stats.json
.venv\Scripts\python.exe validate.py        # → public/data/validation.json
```

> **Compiler for the fit**: PyTensor/PyMC needs `g++` on PATH, otherwise it runs
> in pure Python (very slow). On Windows install MinGW-w64 (e.g.
> `winget install BrechtSanders.WinLibs.POSIX.UCRT`) and add its `mingw64\bin`
> folder to PATH before running `fit.py`.

## Architecture (two separate components)

### A) Runtime — browser, 100% client-side, no backend
- `src/engine/` — **pure TypeScript engine, tested, independent of React**.
  - `matchModel.ts` — bivariate Poisson Dixon-Coles: λ, scoreline matrix, DC
    correction, sampling. Elo→strength fallback. **H2H lambda adjustment**
    (applyH2H) and form/squad-value/Elo/KO-experience modulators, plus lambda
    shrinkage.
  - `simulator.ts` — full Monte Carlo: groups → best thirds → R32 → final;
    aggregation over N runs; one sample run for the animation. **The heart.**
  - `bracket.ts` — official R32 structure (matches 73–88) + deterministic
    allocator for the 8 best third-placed teams.
  - `strengthScore.ts` — synthetic 0–100 Strength Score per team + a breakdown
    of how much each factor differentiates the teams.
  - `rng.ts` — seedable PRNG (mulberry32) for reproducibility.
  - `types.ts` — shared domain types.
- `src/ui/` — React UI.
  - `App.tsx` — orchestration: phases (presim → cinema → reveal → dashboard),
    runs the sim via a Web Worker, manages the animation.
  - `simWorker.ts` — runs `simulate()` off the main thread; Maps are passed as
    serialized entries.
  - `useData.ts` — loads `teams.json` + `model-params.json` + `h2h.json` +
    `team-stats.json` (each optional, with graceful fallback).
  - `scenario.ts` — what-if → engine input; scenario URL encode/decode (`?s=`).
  - `odds.ts`, `bracketLayout.ts`, `cinemaAudio.ts` — UI helpers (odds/%, bracket
    geometry, Web Audio synthesis for the cinema).
  - `components/` — Standings, PhaseTable, RunDetail, TournamentCinema,
    RevealCards, HomeCards, Onboarding, PreSim, MatchupPage, TeamsPage,
    ItalyCard, AdminPage, StrengthPie, etc.
- `src/i18n/` — client-side translations (it/en/es/fr); IT is the source of
  truth, only IT+EN are exposed in `LANGUAGES`.
- `src/analytics.ts` — Vercel Analytics events.
- `src/config.ts` — run count, fallback priors, what-if factor definitions,
  modulator weights. **No magic numbers in the logic.**
- `public/data/` — `teams.json` (curated), and pipeline outputs `model-params.json`,
  `h2h.json`, `team-stats.json`.

### B) Offline pipeline — Python, build-time, NOT in production
- `model/fit.py` — hierarchical Bayesian model (PyMC), MCMC, exports parameters.
- `model/build_h2h.py` — head-to-head aggregation → `h2h.json`.
- `model/build_team_stats.py` — form/knockout/history stats → `team-stats.json`.
- `model/validate.py` — RPS/Brier back-test vs Elo baseline → `validation.json`.
- `model/config.py` — priors, hyperparameters, data window, paths.
- `model/data.py` — loads `results.csv` + `teams.json`, normalizes names, time-decay.

## Invariants not to break

1. **Honest Monte Carlo**: advance the *sampled* winner, NEVER the favorite.
   `P(win) = wins / N`. Repeated runs must produce different winners.
2. **Aggregate ≠ single run**: win numbers come from the aggregate of N runs; the
   animated bracket is "one possible simulation", labelled as such.
3. **No backend/API at runtime**: the browser loads only static JSON.
4. **No fitting at runtime**: parameters are pre-computed offline.
5. **Italy inactive by default**: entry `ITA` with `active:false`,
   `substituteFor:"BIH"`. It appears ONLY with the toggle; Bosnia leaves Group B
   when Italy enters.
6. **Honest framing**: percentages rounded to integers; what-ifs labelled as
   heuristics; no hyperbolic language.
7. **Performance**: 100,000 runs run in a Web Worker so the UI stays responsive.
   Scoreline distributions are pre-cached per pairing.
8. **Round-name keys**: `KNOCKOUT_ROUND_NAMES` in `bracket.ts` contains Italian
   strings (`'Quarti'`, `'Semifinali'`, `'Finale'`) used as **lookup keys** by the
   UI's round-label maps (RunDetail, TournamentCinema). Don't translate those
   string values without updating every consumer.

## Data and sources (snapshot, not live data)

- **2026 groups**: official draw 5 Dec 2025 (via Wikipedia). Bosnia in Group B.
- **R32 structure**: Wikipedia "2026 FIFA World Cup knockout stage".
- **Elo**: snapshot **1 June 2026** (eloratings.net via Wikipedia).
- **Squad value**: sourced from Transfermarkt (secondary covariate).
- **Historical dataset**: Kaggle "International football results 1872–2026" (~49k matches).
- **H2H**: pre-computed by `model/build_h2h.py` → `public/data/h2h.json` (805 pairs).
  Adjusts the engine's λ: ±1–3pp vs Elo-only depending on direct history.

## Known limitations / approximations (see README)

- Thirds allocation in the R32 = deterministic allocator that respects FIFA
  constraints, not the exact Annex C table (495 combinations). Negligible effect
  on the aggregates. **To validate.**
- Squad values are sourced from Transfermarkt but are a secondary covariate with limited weight.
- `rho` (Dixon-Coles) is in `model-params.json` (currently 0); the config
  fallback uses -0.05.

## Style

- English for code comments and identifiers. UI text lives in `src/i18n` (Italian
  is the source of truth); don't hardcode user-facing strings in components.
- The engine stays in pure TS (testable without React). Do not import React in
  `src/engine/`.
- Comments explain the *why* (model choices), not the obvious *what*.
