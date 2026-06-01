# ⚽ MonteCalcio — Force-Pushing Italy to the World Cup

Simulatore **interattivo, gratuito e 100% client-side** dei Mondiali 2026.
Premi *Simula*, guarda il tabellone comporsi dal vivo e ottieni le probabilità
di vittoria di ogni nazionale, calcolate con una **simulazione Monte Carlo** da
10.000 run nel browser (~0.6s).

> **Feature di punta** 🇮🇹 — L'Italia non si è qualificata (eliminata dalla
> Bosnia ai rigori nel playoff). Un toggle la rimette nel **Girone B** al posto
> della Bosnia — lo slot che avrebbe occupato qualificandosi — e ri-esegue
> tutte le simulazioni. *"L'Italia non c'è ai Mondiali, così l'ho rimessa
> dentro io."*

## Come funziona (in breve)

| Componente | Cosa fa |
|---|---|
| **Motore-partita** | Poisson bivariato stile **Dixon-Coles**: `λ = exp(intercetta + attacco − difesa [+ casa])`, con correzione DC sui risultati bassi. Da qui escono scoreline realistici e W/D/L. |
| **Monte Carlo** | In ognuna delle 10.000 run si **estrae** ogni risultato dal modello e avanza il vincitore *estratto* (non il favorito). `P(vittoria) = vittorie / 10.000`. |
| **Parametri di forza** | Attacco/difesa per squadra stimati **offline** da un modello **bayesiano gerarchico** (PyMC) sui risultati internazionali, con shrinkage informato dall'Elo e time-decay. Il browser usa solo i parametri già stimati. |
| **What-if** | Fattori euristici impilabili (assenze, infortuni, rientri, squalifiche, caos) che modificano i rating e ri-lanciano la simulazione. |

## Distinzione importante (onestà metodologica)

- I **numeri di vittoria** vengono dall'**aggregato** delle 10.000 run.
- Il **tabellone animato** mostra **una singola simulazione possibile**, etichettata come tale — non è "la previsione".

L'approccio è **deliberatamente semplice**: l'obiettivo è l'engagement e un
output condivisibile, non battere i bookmaker. I fattori what-if sono euristiche
giocose, separate dal motore predittivo. Nessun marchio FIFA ufficiale.

## Architettura

```
MonteCalcio/
├── src/
│   ├── engine/          # Motore Monte Carlo + Poisson DC (TypeScript, testato)
│   │   ├── matchModel.ts    # λ, matrice scoreline, correzione Dixon-Coles
│   │   ├── simulator.ts     # gironi → terze → R32 → finale, aggregazione N run
│   │   ├── bracket.ts       # struttura ufficiale R32 + allocazione terze
│   │   └── *.test.ts        # test del motore (vitest)
│   ├── ui/              # React (interfaccia basic; versione premium in arrivo)
│   └── config.ts        # num run, prior di fallback, fattori what-if
├── public/data/
│   ├── teams.json           # 48 squadre + Italia: anagrafica + covariate (Elo, valore rosa)
│   ├── model-params.json    # OUTPUT della pipeline: attacco/difesa + incertezza
│   └── validation.json      # OUTPUT della pipeline: RPS/Brier vs baseline
└── model/               # Pipeline offline Python (build-time, NON in produzione)
    ├── fit.py               # fitting bayesiano gerarchico (PyMC)
    ├── validate.py          # back-testing RPS/Brier vs Elo
    └── README.md            # come rigenerare i parametri
```

**Runtime** (browser): React + Vite, TypeScript puro per il motore, nessuna API,
nessun backend. **Pipeline** (Python): gira una tantum, vedi [`model/README.md`](model/README.md).

## Sviluppo

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # build di produzione in dist/
npx vitest run     # test del motore
```

## Validazione del motore-partita

Back-test sulle singole partite dei Mondiali **2018 e 2022** (held-out), con
**RPS** (Ranked Probability Score, standard nel calcio) e **Brier score**,
confrontati con una baseline Elo. RPS/Brier più bassi = meglio.

<!-- VALIDATION_PLACEHOLDER -->
*(Numeri popolati da `model/validate.py` → `public/data/validation.json`.)*

## Dati e fonti

- **Sorteggio gironi 2026**: ufficiale (5 dic 2025), via Wikipedia. Bosnia nel Girone B.
- **Struttura Round of 32**: Wikipedia "2026 FIFA World Cup knockout stage".
- **Elo ratings**: snapshot **19 gennaio 2026** (eloratings.net via Wikipedia).
- **Valore rosa**: stime approssimative (covariata secondaria).
- **Dataset storico**: "International football results 1872–2026" (Kaggle), ~49k partite.

## Limiti noti (dichiarati onestamente)

- I fattori what-if sono **euristiche giocose**, non parte del motore "serio".
- L'allocazione esatta delle 8 migliori terze nel Round of 32 usa un
  **allocatore deterministico** che rispetta i vincoli reali FIFA (una terza non
  affronta la vincente del proprio girone, pesca dall'insieme di gironi-candidati
  del match). Può differire dallo slotting esatto dell'Annex C in combinazioni
  rare; effetto trascurabile sulle probabilità aggregate. *(Da validare.)*
- Gli Elo sono uno snapshot; il modello non aggiorna i dati automaticamente (v2).
