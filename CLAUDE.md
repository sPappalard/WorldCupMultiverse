# CLAUDE.md — MonteCalcio

Guida per agenti AI che lavorano su questo repo. Conciso e operativo.

## Cos'è

**MonteCalcio — Force-Pushing Italy to the World Cup**: web app gratuita,
client-side, che simula i Mondiali 2026 (48 squadre) via Monte Carlo e mostra le
probabilità di vittoria. Feature di punta: toggle che inserisce l'Italia nel
Girone B al posto della Bosnia. Prodotto-vetrina per un profilo Technical PM:
rifinitura visiva e onestà metodologica contano più della complessità del modello.

Fase attuale: **UI basic funzionante**. Prossima fase pianificata: **frontend premium**
(animazioni, stile gioco) — NON ancora iniziata.

## Comandi

```bash
npm install
npm run dev          # dev server (Vite) → http://localhost:5173
npm run build        # build produzione → dist/
npm run typecheck    # tsc --noEmit
npx vitest run       # test del motore

# Pipeline offline Python (build-time, NON in produzione)
cd model
py -3.12 -m venv .venv          # USARE Python 3.12/3.13, NON 3.14 (PyMC)
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe fit.py        # → public/data/model-params.json
.venv\Scripts\python.exe validate.py   # → public/data/validation.json
```

> **Compilatore richiesto per il fit**: PyTensor/PyMC ha bisogno di `g++` nel
> PATH, altrimenti gira in Python puro (lentissimo). Su Windows installare
> MinGW-w64 (es. via `winget install BrechtSanders.WinLibs.POSIX.UCRT`) e
> aggiungere la sua cartella `mingw64\bin` al PATH prima di lanciare `fit.py`.

## Architettura (due componenti separati)

### A) Runtime — browser, 100% client-side, zero backend
- `src/engine/` — **motore in TypeScript puro, testato, indipendente da React**.
  - `matchModel.ts` — Poisson bivariato Dixon-Coles: λ, matrice scoreline, correzione DC, campionamento. Fallback Elo→forza. **Aggiustamento H2H storico dei lambda** (applyH2H).
  - `simulator.ts` — Monte Carlo completo: gironi → migliori terze → R32 → finale; aggregazione su N run; sample run per l'animazione. **Cuore del progetto.**
  - `bracket.ts` — struttura ufficiale R32 (match 73–88) + allocatore deterministico delle 8 terze.
  - `rng.ts` — PRNG seedabile (mulberry32) per riproducibilità.
  - `types.ts` — tipi condivisi del dominio.
- `src/ui/` — React (interfaccia basic).
  - `App.tsx` — orchestrazione: stato, run simulazione, animazione round.
  - `useData.ts` — carica `teams.json` + `model-params.json` (se presente).
  - `scenario.ts` — what-if → input motore; encoding/decoding scenario in URL.
  - `components/` — Standings, Bracket, WhatIfPanel, ShareCard.
- `src/config.ts` — num run, prior di fallback, definizione fattori what-if.
- `public/data/` — `teams.json` (curato), `model-params.json` + `validation.json` (generati dalla pipeline).

### B) Pipeline offline — Python, build-time, NON in produzione
- `model/fit.py` — modello bayesiano gerarchico (PyMC), MCMC, export parametri.
- `model/validate.py` — back-test RPS/Brier vs baseline Elo su Mondiali 2018/2022.
- `model/config.py` — prior, iperparametri, finestra dati, percorsi. **Niente magic number nella logica.**
- `model/data.py` — carica `results.csv` + `teams.json`, normalizza nomi, pesi time-decay.

## Invarianti da non rompere

1. **Monte Carlo onesto**: si avanza il vincitore *estratto*, MAI il favorito.
   `P(vittoria) = vittorie / N`. Run ripetute devono dare vincitori diversi.
2. **Aggregato ≠ singola run**: i numeri di vittoria vengono dall'aggregato delle
   N run; il tabellone animato è "una simulazione possibile", etichettato come tale.
3. **Zero backend/API a runtime**: il browser carica solo JSON statici.
4. **Nessun fitting a runtime**: i parametri sono pre-calcolati offline.
5. **Italia inattiva di default**: entry `ITA` con `active:false`, `substituteFor:"BIH"`.
   Appare SOLO col toggle. La Bosnia esce dal Girone B quando l'Italia entra.
6. **Framing onesto**: percentuali arrotondate a interi; what-if etichettati come
   euristiche; niente linguaggio iperbolico ("scientifico", "infallibile").
7. **Performance**: 10.000 run in <2s (attualmente ~0.6s). Pre-cache delle
   distribuzioni scoreline per accoppiamento.

## Dati e fonti (snapshot, da non confondere con dati live)

- **Gironi 2026**: sorteggio ufficiale 5 dic 2025 (via Wikipedia). Bosnia in Girone B.
- **Struttura R32**: Wikipedia "2026 FIFA World Cup knockout stage".
- **Elo**: snapshot **19 gennaio 2026** (eloratings.net via Wikipedia).
- **Valore rosa**: stime approssimative ispirate a Transfermarkt (covariata secondaria).
- **Dataset storico**: Kaggle "International football results 1872–2026" (~49k partite),
  in `International football results from 1872 to 2026/`.
- **H2H**: pre-calcolato da `model/build_h2h.py` → `public/data/h2h.json`.
  4.078 partite dal 1994, 805 coppie. Aggiusta i λ del motore: stessa partita
  darà ±1-3pp rispetto al solo Elo a seconda dello storico diretto.

## Limiti noti / approssimazioni (vedi README)

- Allocazione terze nel R32 = allocatore deterministico che rispetta i vincoli
  FIFA, non la tabella esatta Annex C (495 combinazioni). Effetto trascurabile
  sulle aggregate. **Da validare.**
- Squad value stimati, non scrapati da Transfermarkt.
- `rho` (Dixon-Coles) stimato in modo semi-empirico, non nel modello PyMC.

## Stile

- Italiano per testi UI e commenti rivolti all'utente; codice/identificatori in inglese.
- Il motore resta in TS puro (testabile senza React). Non importare React in `src/engine/`.
- Commenti spiegano il *perché* (scelte di modello), non il *cosa* ovvio.
