"""Caricamento e preparazione del dataset storico per il fitting."""

from __future__ import annotations

import json
import math
from datetime import date

import numpy as np
import pandas as pd

import config as cfg


# Mappa dai nomi nel dataset Kaggle agli id di teams.json.
# Solo le squadre dei Mondiali 2026 + Italia ci interessano per i parametri;
# le altre servono comunque come avversari nel fit.
NAME_TO_ID = {
    "Mexico": "MEX", "South Africa": "RSA", "South Korea": "KOR", "Czech Republic": "CZE",
    "Czechia": "CZE", "Canada": "CAN", "Bosnia and Herzegovina": "BIH", "Qatar": "QAT",
    "Switzerland": "SUI", "Brazil": "BRA", "Morocco": "MAR", "Haiti": "HAI", "Scotland": "SCO",
    "United States": "USA", "Paraguay": "PAR", "Australia": "AUS", "Turkey": "TUR",
    "Türkiye": "TUR", "Germany": "GER", "Curaçao": "CUW", "Curacao": "CUW",
    "Ivory Coast": "CIV", "Côte d'Ivoire": "CIV", "Ecuador": "ECU", "Netherlands": "NED",
    "Japan": "JPN", "Sweden": "SWE", "Tunisia": "TUN", "Belgium": "BEL", "Egypt": "EGY",
    "Iran": "IRN", "New Zealand": "NZL", "Spain": "ESP", "Cape Verde": "CPV",
    "Cabo Verde": "CPV", "Saudi Arabia": "KSA", "Uruguay": "URU", "France": "FRA",
    "Senegal": "SEN", "Iraq": "IRQ", "Norway": "NOR", "Argentina": "ARG", "Algeria": "ALG",
    "Austria": "AUT", "Jordan": "JOR", "Portugal": "POR", "DR Congo": "COD",
    "Democratic Republic of the Congo": "COD", "Uzbekistan": "UZB", "Colombia": "COL",
    "England": "ENG", "Croatia": "CRO", "Ghana": "GHA", "Panama": "PAN", "Italy": "ITA",
}


def load_teams() -> list[dict]:
    with open(cfg.TEAMS_JSON, encoding="utf-8") as f:
        return json.load(f)["teams"]


def _time_weight(match_date: pd.Timestamp, ref: date) -> float:
    """Peso esponenziale Dixon-Coles: half-life in anni."""
    years = (ref - match_date.date()).days / 365.25
    if years < 0:
        return 1.0
    lam = math.log(2) / cfg.TIME_DECAY_HALFLIFE_YEARS
    return math.exp(-lam * years)


def load_matches(for_fit: bool = True) -> pd.DataFrame:
    """Carica results.csv, normalizza e aggiunge pesi temporali.

    for_fit=True: filtra a SINCE_YEAR e calcola i pesi.
    for_fit=False: ritorna tutto (per estrarre i tornei di validazione).
    """
    df = pd.read_csv(cfg.RESULTS_CSV, parse_dates=["date"])
    df = df.dropna(subset=["home_score", "away_score"])
    df["home_score"] = df["home_score"].astype(int)
    df["away_score"] = df["away_score"].astype(int)

    if for_fit:
        df = df[df["date"].dt.year >= cfg.SINCE_YEAR].copy()
        ref = date.fromisoformat(cfg.SNAPSHOT_DATE)
        # escludi partite successive allo snapshot (no leakage dal futuro)
        df = df[df["date"].dt.date <= ref]
        df["weight"] = df["date"].apply(lambda d: _time_weight(d, ref))

    return df.reset_index(drop=True)


def build_team_index(df: pd.DataFrame) -> tuple[list[str], dict[str, int]]:
    """Indice intero per ogni squadra presente nel dataset di fit."""
    names = pd.unique(pd.concat([df["home_team"], df["away_team"]]))
    teams = sorted(names.tolist())
    idx = {name: i for i, name in enumerate(teams)}
    return teams, idx


def elo_prior_vector(teams: list[str]) -> np.ndarray:
    """Per ogni squadra del dataset, una covariata Elo z-scored se nota.

    Le squadre senza Elo noto (non Mondiali) ricevono 0 (nessuno spostamento
    del prior). Per i 48+Italia usiamo l'Elo da teams.json.
    """
    team_meta = {t["name"]: t for t in load_teams()}
    # mappa anche via NAME_TO_ID inverso per matchare i nomi del dataset
    id_to_elo = {t["id"]: t["elo"] for t in load_teams()}

    elos = np.full(len(teams), np.nan)
    for i, name in enumerate(teams):
        tid = NAME_TO_ID.get(name)
        if tid and tid in id_to_elo:
            elos[i] = id_to_elo[tid]
        elif name in team_meta:
            elos[i] = team_meta[name]["elo"]

    known = ~np.isnan(elos)
    if known.sum() >= 2:
        mu, sd = np.nanmean(elos), np.nanstd(elos)
        z = np.where(known, (elos - mu) / (sd if sd else 1.0), 0.0)
    else:
        z = np.zeros(len(teams))
    return z
