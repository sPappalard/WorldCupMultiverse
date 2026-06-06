# ⚽ World Cup Multiverse — Force-Pushing Italy to the World Cup

*(repo codename: **MonteCalcio**)*

A **free, 100% client-side** interactive simulator of the 2026 FIFA World Cup.
Hit *Simulate*, watch the bracket fill in live, and get each nation's win
probability from a **Monte Carlo simulation** of 100,000 runs, computed in your
browser in a Web Worker.

> **Flagship feature** 🇮🇹 — Italy didn't qualify (knocked out by Bosnia on
> penalties in the playoff). A toggle puts them back into **Group B** in Bosnia's
> place — the slot they'd have taken by qualifying — and re-runs every
> simulation. *"Italy isn't at the World Cup, so I put them back in myself."*

## How it works (in brief)

| Component | What it does |
|---|---|
| **Match engine** | Bivariate Poisson, **Dixon-Coles** style: `λ = exp(intercept + attack − defense [+ homeAdv])`, with a low-score DC correction. Produces realistic scorelines and W/D/L. Lambdas are then nudged by head-to-head history and by form/value/Elo/KO-experience modulators, plus a shrinkage term that keeps the favorites from over-dominating. |
| **Monte Carlo** | Each of the 100,000 runs **samples** every result from the model and advances the **sampled** winner (not the favorite). `P(win) = wins / 100,000`. |
| **Strength parameters** | Per-team attack/defense estimated **offline** by a hierarchical **Bayesian** model (PyMC) on international results, shrunk toward Elo with time-decay. The browser only uses the pre-computed parameters (`model-params.json`); if that file is missing it falls back to deriving strength from Elo. |
| **What-if** | Stackable heuristic factors (missing star, injuries, returns, suspensions, chaos) that adjust ratings and re-run the simulation. |

## Important distinction (methodological honesty)

- The **win numbers** come from the **aggregate** of the 100,000 runs.
- The **animated bracket** ("cinema") shows **one possible simulation**, labelled
  as such — it is not "the prediction". The reveal cards state explicitly that
  the cinema was 1 run out of 100,000.

The approach is **deliberately simple**: the goal is engagement and a shareable
output, not beating the bookmakers. The what-if factors are playful heuristics,
separate from the predictive engine. No official FIFA branding.

## User experience

A short onboarding (Italy in/out + favorite team) → an animated "cinema" of one
tournament → reveal cards → a card-based dashboard:

- **Monte Carlo results** — win probabilities and a phase-by-phase reach table.
- **My simulation** — the animated bracket and group results of the sample run.
- **Teams** — the 48 (or 49 with Italy) teams, sortable, with a **Strength Score**.
- **Italy focus** — Italy's data and tournament run, or a CTA to activate it.
- **Matchup** — head-to-head between any two teams.
- **How it works** — methodology and known limitations.

There's also an **Admin** panel (simple/advanced) to tune the modulator weights,
and a shareable URL (`?s=…`) that encodes the scenario and auto-runs silently.

## UI languages

The i18n system ships dictionaries for IT/EN/ES/FR with Italian as the source of
truth, but only **Italian and English** are currently exposed in the switcher
(ES/FR are work in progress).

## Architecture

```
MonteCalcio/
├── src/
│   ├── engine/              # Monte Carlo + Poisson DC engine (pure TypeScript, tested)
│   │   ├── matchModel.ts        # λ, scoreline matrix, Dixon-Coles correction, H2H + modulators
│   │   ├── simulator.ts         # groups → best thirds → R32 → final, aggregation over N runs
│   │   ├── bracket.ts           # official R32 structure + deterministic thirds allocator
│   │   ├── strengthScore.ts     # synthetic 0–100 Strength Score + factor breakdown
│   │   ├── rng.ts               # seedable PRNG (mulberry32)
│   │   └── *.test.ts            # engine tests (vitest)
│   ├── ui/                  # React UI (App, components, scenario, Web Worker)
│   ├── i18n/                # client-side translations (it/en/es/fr)
│   └── config.ts            # run count, fallback priors, what-if factors, modulator weights
├── public/data/
│   ├── teams.json               # 48 teams + inactive Italy: identity + covariates (Elo, squad value)
│   ├── model-params.json        # pipeline OUTPUT: per-team attack/defense + global params
│   ├── h2h.json                 # pipeline OUTPUT: 805 head-to-head pairs
│   └── team-stats.json          # pipeline OUTPUT: form, knockout and history scores
└── model/                  # offline Python pipeline (build-time, NOT in production)
    ├── fit.py                   # hierarchical Bayesian fit (PyMC)
    ├── build_h2h.py             # head-to-head aggregation
    ├── build_team_stats.py      # form/knockout/history stats
    ├── validate.py              # RPS/Brier back-testing vs Elo baseline
    └── README.md                # how to regenerate the data
```

**Runtime** (browser): React + Vite, pure TypeScript engine, no API, no backend —
the page loads only static JSON. **Pipeline** (Python): runs once, see
[`model/README.md`](model/README.md).

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run typecheck  # tsc --noEmit
npx vitest run     # engine tests
```

## Data and sources

- **2026 group draw**: official (5 Dec 2025), via Wikipedia. Bosnia in Group B.
- **Round of 32 structure**: Wikipedia "2026 FIFA World Cup knockout stage".
- **Elo ratings**: snapshot **19 January 2026** (eloratings.net via Wikipedia).
- **Squad value**: approximate estimates (secondary covariate).
- **Historical dataset**: "International football results 1872–2026" (Kaggle), ~49k matches.

## Known limitations (stated honestly)

- The what-if factors are **playful heuristics**, not part of the "serious" engine.
- Allocation of the 8 best third-placed teams in the Round of 32 uses a
  **deterministic allocator** that respects FIFA's real constraints (a third
  never faces its own group's winner, and draws from the match's candidate
  groups). It can differ from the exact Annex C slotting in rare combinations;
  negligible effect on the aggregate probabilities. *(To validate.)*
- Squad values are estimated, not scraped from Transfermarkt.
- Elo is a snapshot; the model does not auto-update its data.
