"""Fitting bayesiano gerarchico del modello Poisson (Dixon-Coles).

Modello (scala log-lambda):
    log λ_home = intercept + attack[home] - defense[away] + home_adv
    log λ_away = intercept + attack[away] - defense[home]

con attack/defense per squadra ~ Normal centrata su (elo_coef * z_elo),
shrinkage gerarchico via iperprior team_sd_*, ed effetto casa globale.
Il peso temporale Dixon-Coles entra come peso di verosimiglianza per partita.

NB: la correzione DC sui risultati bassi (rho) è applicata a RUNTIME nel motore
JS; qui rho viene stimato separatamente come parametro globale calibrato (vedi
estimate_rho) per restare nei limiti di complessità della spec.

Output: public/data/model-params.json.
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pymc as pm

import config as cfg
from data import (
    load_matches,
    build_team_index,
    elo_prior_vector,
    load_teams,
    NAME_TO_ID,
)


def build_model(df: pd.DataFrame, teams: list[str], idx: dict[str, int]):
    n_teams = len(teams)
    home = df["home_team"].map(idx).to_numpy()
    away = df["away_team"].map(idx).to_numpy()
    hg = df["home_score"].to_numpy()
    ag = df["away_score"].to_numpy()
    w = df["weight"].to_numpy()
    z_elo = elo_prior_vector(teams)

    P = cfg.PRIOR
    with pm.Model() as model:
        intercept = pm.Normal("intercept", P["intercept_mu"], P["intercept_sd"])
        home_adv = pm.Normal("home_adv", P["home_adv_mu"], P["home_adv_sd"])
        elo_coef = pm.Normal("elo_coef", 0.0, P["elo_coef_sd"])

        # prior di forza informato dall'Elo (covariata → shrinkage informato)
        atk_mu = elo_coef * z_elo
        def_mu = elo_coef * z_elo  # difesa migliore = valore più alto

        attack = pm.Normal("attack", mu=atk_mu, sigma=P["team_sd_attack"], shape=n_teams)
        defense = pm.Normal("defense", mu=def_mu, sigma=P["team_sd_defense"], shape=n_teams)

        # vincolo di identificabilità: media attack = media defense = 0
        attack_c = attack - pm.math.mean(attack)
        defense_c = defense - pm.math.mean(defense)

        log_lambda_h = intercept + attack_c[home] - defense_c[away] + home_adv
        log_lambda_a = intercept + attack_c[away] - defense_c[home]
        lam_h = pm.math.exp(log_lambda_h)
        lam_a = pm.math.exp(log_lambda_a)

        # verosimiglianza pesata (time-decay) via potential su logp Poisson
        logp = w * (pm.logp(pm.Poisson.dist(mu=lam_h), hg)
                    + pm.logp(pm.Poisson.dist(mu=lam_a), ag))
        pm.Potential("weighted_like", logp.sum())

    return model


def estimate_rho(df: pd.DataFrame) -> float:
    """Stima empirica semplice di rho dalla frequenza dei risultati bassi.

    rho < 0 quando i punteggi bassi (0-0,1-1) sono più frequenti del prodotto
    di due Poisson indipendenti. Qui usiamo una stima robusta e prudente.
    """
    low = df[(df["home_score"] <= 1) & (df["away_score"] <= 1)]
    obs_draw_low = ((low["home_score"] == low["away_score"]).mean()) if len(low) else 0.5
    # mappa euristica la "extra-correlazione" su un rho in [-0.15, 0]
    rho = float(np.clip(-(obs_draw_low - 0.5) * 0.2, -0.15, 0.0))
    return rho if not np.isnan(rho) else cfg.PRIOR["rho_mu"]


def export_params(trace, teams: list[str], idx: dict[str, int], rho: float) -> dict:
    post = trace.posterior
    intercept = float(post["intercept"].mean())
    home_adv = float(post["home_adv"].mean())

    atk = post["attack"].mean(dim=["chain", "draw"]).to_numpy()
    deff = post["defense"].mean(dim=["chain", "draw"]).to_numpy()
    atk_sd = post["attack"].std(dim=["chain", "draw"]).to_numpy()
    def_sd = post["defense"].std(dim=["chain", "draw"]).to_numpy()
    # centra come nel modello
    atk = atk - atk.mean()
    deff = deff - deff.mean()

    # raccogli SOLO le squadre dei Mondiali 2026 + Italia (chiave = id)
    wanted = {t["id"]: t["name"] for t in load_teams()}
    name_to_idx = idx
    out_teams: dict[str, dict] = {}
    for tid, name in wanted.items():
        # trova il nome dataset corrispondente
        ds_name = next((n for n, i in NAME_TO_ID.items() if i == tid and n in name_to_idx), None)
        if ds_name is None:
            # prova match diretto sul nome italiano improbabile; salta se assente
            continue
        i = name_to_idx[ds_name]
        out_teams[tid] = {
            "attack": round(float(atk[i]), 4),
            "attackSd": round(float(atk_sd[i]), 4),
            "defense": round(float(deff[i]), 4),
            "defenseSd": round(float(def_sd[i]), 4),
        }

    return {
        "_meta": {
            "generatedBy": "model/fit.py",
            "snapshot": cfg.SNAPSHOT_DATE,
            "sinceYear": cfg.SINCE_YEAR,
            "halfLifeYears": cfg.TIME_DECAY_HALFLIFE_YEARS,
        },
        "global": {
            "intercept": round(intercept, 4),
            "homeAdv": round(home_adv, 4),
            "rho": round(rho, 4),
        },
        "teams": out_teams,
    }


def main() -> None:
    print("Carico le partite…")
    df = load_matches(for_fit=True)
    print(f"  {len(df)} partite dal {cfg.SINCE_YEAR} allo snapshot.")
    teams, idx = build_team_index(df)
    print(f"  {len(teams)} squadre nel dataset.")

    rho = estimate_rho(df)
    print(f"  rho stimato: {rho:.4f}")

    print("Costruisco e campiono il modello (può richiedere alcuni minuti)…")
    model = build_model(df, teams, idx)
    with model:
        trace = pm.sample(
            draws=cfg.MCMC["draws"],
            tune=cfg.MCMC["tune"],
            chains=cfg.MCMC["chains"],
            target_accept=cfg.MCMC["target_accept"],
            random_seed=cfg.MCMC["seed"],
            progressbar=True,
        )

    params = export_params(trace, teams, idx, rho)
    with open(cfg.OUT_PARAMS, "w", encoding="utf-8") as f:
        json.dump(params, f, ensure_ascii=False, indent=2)
    print(f"Scritto {cfg.OUT_PARAMS} con {len(params['teams'])} squadre.")


if __name__ == "__main__":
    main()
