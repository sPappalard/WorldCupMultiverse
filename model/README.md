# MonteCalcio — Pipeline offline (Python)

Stima **offline** i parametri di forza attacco/difesa delle squadre con un
modello **Poisson gerarchico bayesiano** (stile Dixon-Coles) e **valida** il
motore-partita su tornei passati. Gira **una tantum** (in locale o via GitHub
Action) e produce due file statici consumati dal frontend:

- `public/data/model-params.json` — attacco/difesa + incertezza per squadra, più i globali (intercept, homeAdv, rho).
- `public/data/validation.json` — RPS e Brier del modello vs baseline Elo.

Il runtime nel browser **non** rifà il fit: usa solo questi JSON. Costo a regime: zero.

## Come rigenerare i parametri

```bash
cd model
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt

python fit.py        # → public/data/model-params.json   (qualche minuto)
python validate.py   # → public/data/validation.json
```

> **Versione Python:** usare 3.11–3.13. PyMC potrebbe non avere ancora wheel
> precompilate per 3.14; in quel caso creare il venv con `py -3.12 -m venv .venv`.

## Cosa fa il modello (`fit.py`)

```
log λ_home = intercept + attack[home] − defense[away] + home_adv
log λ_away = intercept + attack[away] − defense[home]
```

- `attack`/`defense` per squadra con **shrinkage gerarchico**: il prior di ogni
  squadra è informato dalla covariata **Elo** (z-scored), così le nazionali con
  pochi dati recenti vengono "tirate" verso un valore plausibile invece di
  avere stime rumorose.
- **Time-decay Dixon-Coles**: ogni partita pesa `exp(−λ·età)` con half-life
  configurabile (`config.py`), così i risultati recenti contano di più.
- `rho` (correzione DC sui risultati bassi 0-0/1-0/0-1/1-1) è stimato
  separatamente e applicato a runtime nel motore JS.
- Vincolo di identificabilità: media di attack e defense = 0.

Tutti i prior/iperparametri stanno in `config.py` — niente magic number nella logica.

## Cosa fa la validazione (`validate.py`)

Back-test sulle **singole partite** dei Mondiali **2018 e 2022** (held-out):

- **RPS (Ranked Probability Score)** — standard nel calcio per esiti ordinali W/D/L.
- **Brier score**.

Entrambi confrontati con una **baseline Elo** (diff Elo → logistica + quota
pareggio fissa). RPS/Brier **più bassi = meglio**. Se il modello batte la
baseline, aggiunge valore predittivo; in caso contrario è onesto dichiararlo.

## File

| File | Ruolo |
|---|---|
| `config.py` | Percorsi, prior, iperparametri, finestra dati, setup validazione |
| `data.py` | Caricamento `results.csv` + `teams.json`, normalizzazione nomi, pesi time-decay |
| `fit.py` | Modello PyMC, campionamento MCMC, export `model-params.json` |
| `validate.py` | RPS/Brier vs baseline Elo, export `validation.json` |
