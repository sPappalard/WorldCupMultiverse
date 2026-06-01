"""Configurazione della pipeline offline (prior, iperparametri, percorsi).

Tenere QUI tutto ciò che è regolabile: la logica di fit/validazione non deve
contenere magic number. Vedi spec §6 (config separato).
"""

from pathlib import Path

# --- Percorsi ---
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "International football results from 1872 to 2026"
RESULTS_CSV = DATA_DIR / "results.csv"
TEAMS_JSON = ROOT / "public" / "data" / "teams.json"
OUT_PARAMS = ROOT / "public" / "data" / "model-params.json"
OUT_VALIDATION = ROOT / "public" / "data" / "validation.json"

# --- Finestra dati e time-decay (Dixon-Coles) ---
# Usiamo le partite dal SINCE_YEAR in poi per il fit principale.
SINCE_YEAR = 2006
# Half-life del peso temporale in anni: una partita vecchia di HALF_LIFE anni
# pesa la metà di una odierna. Equivalente al ξ di Dixon-Coles.
TIME_DECAY_HALFLIFE_YEARS = 4.0

# Data di snapshot del modello (coerente con teams.json eloSnapshot).
SNAPSHOT_DATE = "2026-06-01"

# --- Filtri qualità sui tornei (escludiamo amichevoli minori? No: servono dati) ---
# Manteniamo tutti i tornei ma marchiamo la "importanza" come covariata futura.
MIN_MATCHES_PER_TEAM = 5  # team con meno partite → forte shrinkage al prior.

# --- Prior del modello gerarchico (in scala log-lambda) ---
PRIOR = {
    "intercept_mu": 0.0,
    "intercept_sd": 0.5,
    "home_adv_mu": 0.30,
    "home_adv_sd": 0.15,
    # iperprior sulla deviazione std di attacco/difesa tra squadre.
    # Valori più stretti (da 0.40 → 0.25) per evitare che squadre con uno
    # storico di partite "fortunato" (es. Marocco 2022) ricevano parametri
    # irrealisticamente alti rispetto alla loro forza Elo complessiva.
    "team_sd_attack": 0.25,
    "team_sd_defense": 0.25,
    # Dixon-Coles rho (correlazione risultati bassi)
    "rho_mu": -0.05,
    "rho_sd": 0.05,
    # peso della covariata Elo nello spostare il prior di forza di una squadra.
    # Aumentato (da 0.30 → 0.50) per ancorare di più le stime all'Elo globale,
    # così squadre con Elo basso non possono avere attack/defense da top team.
    "elo_coef_sd": 0.50,
}

# --- Campionamento MCMC ---
MCMC = {
    "draws": 1500,
    "tune": 1500,
    "chains": 4,
    "target_accept": 0.92,
    "seed": 2026,
}

# --- Validazione / back-testing (§5.7) ---
# Tornei held-out su cui validare il motore-partita (singole partite).
VALIDATION_TOURNAMENTS = ["FIFA World Cup"]
VALIDATION_YEARS = [2018, 2022]
# Per la baseline Elo: scala logistica che mappa diff Elo → P(vittoria).
ELO_BASELINE_SCALE = 400.0
# Probabilità di pareggio assunta dalla baseline Elo (calibrata sul calcio).
ELO_BASELINE_DRAW = 0.26
