"""Back-testing del motore-partita su tornei storici held-out (§5.7).

Valida le SINGOLE partite (non il tabellone) dei Mondiali 2018 e 2022.
Metriche: Ranked Probability Score (RPS) e Brier score, confrontate con una
baseline Elo semplice. Output: public/data/validation.json + stampa per README.

RPS (per esito ordinale W/D/L) è lo standard nel calcio: penalizza meno gli
errori "vicini" (dare alta P alla vittoria quando finisce in pareggio costa
meno che quando finisce in sconfitta).
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd

import config as cfg
from data import load_matches, load_teams, NAME_TO_ID


def load_model_params() -> dict:
    with open(cfg.OUT_PARAMS, encoding="utf-8") as f:
        return json.load(f)


def poisson_wdl(lam_h: float, lam_a: float, rho: float, max_goals: int = 10):
    """P(win/draw/loss) per la squadra di casa dal Poisson bivariato DC."""
    i = np.arange(max_goals + 1)
    ph = np.exp(-lam_h) * lam_h**i / np.array([np.math.factorial(k) for k in i])
    pa = np.exp(-lam_a) * lam_a**i / np.array([np.math.factorial(k) for k in i])
    M = np.outer(ph, pa)
    # correzione Dixon-Coles sui risultati bassi
    M[0, 0] *= 1 - lam_h * lam_a * rho
    M[0, 1] *= 1 + lam_h * rho
    M[1, 0] *= 1 + lam_a * rho
    M[1, 1] *= 1 - rho
    M = np.clip(M, 0, None)
    M /= M.sum()
    win = np.tril(M, -1).sum()   # home goals > away goals
    draw = np.trace(M)
    loss = np.triu(M, 1).sum()
    return np.array([win, draw, loss])


def elo_wdl(elo_h: float, elo_a: float) -> np.ndarray:
    """Baseline: P(W/D/L) da differenza Elo + quota pareggio fissa."""
    diff = elo_h - elo_a
    p_home_excl_draw = 1 / (1 + 10 ** (-diff / cfg.ELO_BASELINE_SCALE))
    d = cfg.ELO_BASELINE_DRAW
    win = p_home_excl_draw * (1 - d)
    loss = (1 - p_home_excl_draw) * (1 - d)
    return np.array([win, d, loss])


def rps(probs: np.ndarray, outcome: int) -> float:
    """Ranked Probability Score per 3 esiti ordinali. outcome in {0,1,2}."""
    obs = np.zeros(3)
    obs[outcome] = 1
    cum_p = np.cumsum(probs)
    cum_o = np.cumsum(obs)
    return float(np.sum((cum_p - cum_o) ** 2) / (len(probs) - 1))


def brier(probs: np.ndarray, outcome: int) -> float:
    obs = np.zeros(3)
    obs[outcome] = 1
    return float(np.sum((probs - obs) ** 2))


def outcome_index(hg: int, ag: int) -> int:
    return 0 if hg > ag else (1 if hg == ag else 2)


def get_validation_matches() -> pd.DataFrame:
    df = load_matches(for_fit=False)
    mask = df["tournament"].isin(cfg.VALIDATION_TOURNAMENTS) & df["date"].dt.year.isin(
        cfg.VALIDATION_YEARS
    )
    return df[mask].reset_index(drop=True)


def main() -> None:
    params = load_model_params()
    glob = params["global"]
    pteams = params["teams"]
    elo_by_id = {t["id"]: t["elo"] for t in load_teams()}

    matches = get_validation_matches()
    print(f"Valido su {len(matches)} partite ({cfg.VALIDATION_YEARS}).")

    rows = []
    for _, m in matches.iterrows():
        hid = NAME_TO_ID.get(m["home_team"])
        aid = NAME_TO_ID.get(m["away_team"])
        if not hid or not aid or hid not in pteams or aid not in pteams:
            continue  # squadra non nel set parametrizzato (es. eliminata ai gironi 2018)
        h, a = pteams[hid], pteams[aid]
        # neutrale nei Mondiali → niente vantaggio casa
        lam_h = np.exp(glob["intercept"] + h["attack"] - a["defense"])
        lam_a = np.exp(glob["intercept"] + a["attack"] - h["defense"])
        p_model = poisson_wdl(lam_h, lam_a, glob["rho"])
        p_elo = elo_wdl(elo_by_id[hid], elo_by_id[aid])
        oc = outcome_index(int(m["home_score"]), int(m["away_score"]))
        rows.append({
            "rps_model": rps(p_model, oc),
            "rps_elo": rps(p_elo, oc),
            "brier_model": brier(p_model, oc),
            "brier_elo": brier(p_elo, oc),
        })

    if not rows:
        print("Nessuna partita validabile (controlla NAME_TO_ID / parametri).")
        return

    res = pd.DataFrame(rows)
    summary = {
        "_meta": {
            "tournaments": cfg.VALIDATION_TOURNAMENTS,
            "years": cfg.VALIDATION_YEARS,
            "nMatches": len(res),
        },
        "model": {
            "rps": round(res["rps_model"].mean(), 4),
            "brier": round(res["brier_model"].mean(), 4),
        },
        "eloBaseline": {
            "rps": round(res["rps_elo"].mean(), 4),
            "brier": round(res["brier_elo"].mean(), 4),
        },
    }
    summary["improvement"] = {
        "rpsDelta": round(summary["eloBaseline"]["rps"] - summary["model"]["rps"], 4),
        "brierDelta": round(summary["eloBaseline"]["brier"] - summary["model"]["brier"], 4),
    }

    with open(cfg.OUT_VALIDATION, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(json.dumps(summary, indent=2))
    print(f"\nScritto {cfg.OUT_VALIDATION}")
    print(
        "RPS più basso = meglio. "
        f"Modello {summary['model']['rps']} vs Elo {summary['eloBaseline']['rps']}."
    )


if __name__ == "__main__":
    main()
