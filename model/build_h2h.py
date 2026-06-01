"""
Estrae gli scontri diretti (Head-to-Head) dal dataset storico e produce
public/data/h2h.json usato dal motore JS per aggiustare le probabilità.

Logica:
  Per ogni coppia (A, B) presente nel dataset, contiamo W/D/L dalla prospettiva
  di A come squadra di casa — ma siccome vogliamo la forza ASSOLUTA (non
  dipendente da chi gioca in casa), normalizziamo: una vittoria di A contro B
  in qualsiasi contesto conta come win_A.

  Il motore JS usa questi dati per interpolare tra P_elo e P_h2h con un peso
  che cresce col numero di precedenti (più dati = più fiducia allo storico).

Output per coppia (chiave "A|B", sempre A < B alfabeticamente):
  { "w_a": int, "d": int, "w_b": int, "n": int }

Dove A e B sono gli id delle squadre (es. "ITA", "FRA").
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RESULTS_CSV = ROOT / "International football results from 1872 to 2026" / "results.csv"
TEAMS_JSON  = ROOT / "public" / "data" / "teams.json"
OUT_H2H     = ROOT / "public" / "data" / "h2h.json"

# Mappa nome dataset → id squadra (stessa di data.py)
NAME_TO_ID = {
    "Mexico": "MEX", "South Africa": "RSA", "South Korea": "KOR",
    "Czech Republic": "CZE", "Czechia": "CZE",
    "Canada": "CAN", "Bosnia and Herzegovina": "BIH", "Qatar": "QAT",
    "Switzerland": "SUI", "Brazil": "BRA", "Morocco": "MAR", "Haiti": "HAI",
    "Scotland": "SCO", "United States": "USA", "Paraguay": "PAR",
    "Australia": "AUS", "Turkey": "TUR", "Türkiye": "TUR",
    "Germany": "GER", "Curaçao": "CUW", "Curacao": "CUW",
    "Ivory Coast": "CIV", "Côte d'Ivoire": "CIV", "Ecuador": "ECU",
    "Netherlands": "NED", "Japan": "JPN", "Sweden": "SWE", "Tunisia": "TUN",
    "Belgium": "BEL", "Egypt": "EGY", "Iran": "IRN", "New Zealand": "NZL",
    "Spain": "ESP", "Cape Verde": "CPV", "Cabo Verde": "CPV",
    "Saudi Arabia": "KSA", "Uruguay": "URU", "France": "FRA",
    "Senegal": "SEN", "Iraq": "IRQ", "Norway": "NOR",
    "Argentina": "ARG", "Algeria": "ALG", "Austria": "AUT", "Jordan": "JOR",
    "Portugal": "POR", "DR Congo": "COD",
    "Democratic Republic of the Congo": "COD",
    "Uzbekistan": "UZB", "Colombia": "COL",
    "England": "ENG", "Croatia": "CRO", "Ghana": "GHA", "Panama": "PAN",
    "Italy": "ITA",
}

# Peso temporale: partite più recenti contano di più.
# Usiamo un cutoff semplice: solo dal 1994 in poi (calcio moderno).
SINCE_YEAR = 1994


def main() -> None:
    print("Carico results.csv…")
    df = pd.read_csv(RESULTS_CSV, parse_dates=["date"])
    df = df[df["date"].dt.year >= SINCE_YEAR]
    df = df.dropna(subset=["home_score", "away_score"])

    # Mappa solo le squadre che ci interessano (48 + Italia)
    wanted = set(NAME_TO_ID.values())

    # Struttura: h2h[(id_a, id_b)] = {"w_a": 0, "d": 0, "w_b": 0}
    # con id_a < id_b (ordinamento alfabetico) per avere chiave unica
    h2h: dict[tuple[str, str], dict] = defaultdict(lambda: {"w_a": 0, "d": 0, "w_b": 0})

    skipped = 0
    counted = 0
    for _, row in df.iterrows():
        id_home = NAME_TO_ID.get(row["home_team"])
        id_away = NAME_TO_ID.get(row["away_team"])
        if not id_home or not id_away:
            skipped += 1
            continue
        if id_home not in wanted or id_away not in wanted:
            skipped += 1
            continue

        hg, ag = int(row["home_score"]), int(row["away_score"])

        # chiave canonica: sempre (min, max) alfabetico
        if id_home <= id_away:
            a, b = id_home, id_away
            if hg > ag:   h2h[(a, b)]["w_a"] += 1
            elif hg < ag: h2h[(a, b)]["w_b"] += 1
            else:         h2h[(a, b)]["d"]   += 1
        else:
            a, b = id_away, id_home
            if hg > ag:   h2h[(a, b)]["w_b"] += 1
            elif hg < ag: h2h[(a, b)]["w_a"] += 1
            else:         h2h[(a, b)]["d"]   += 1
        counted += 1

    print(f"  Partite contate: {counted} | Skipped (squadre fuori scope): {skipped}")

    # Serializza: chiave "A|B" (già in ordine alfab.), aggiungi n totale
    out: dict[str, dict] = {}
    for (a, b), v in sorted(h2h.items()):
        n = v["w_a"] + v["d"] + v["w_b"]
        if n == 0:
            continue
        out[f"{a}|{b}"] = {"w_a": v["w_a"], "d": v["d"], "w_b": v["w_b"], "n": n}

    with open(OUT_H2H, "w", encoding="utf-8") as f:
        json.dump({
            "_meta": {
                "description": "Head-to-head storico tra le 48+1 squadre dei Mondiali 2026.",
                "sinceYear": SINCE_YEAR,
                "source": "Kaggle International football results 1872-2026",
                "keyFormat": "ID_A|ID_B con ID_A <= ID_B (ordine alfabetico)",
                "fields": "w_a=vittorie di A, d=pareggi, w_b=vittorie di B, n=totale"
            },
            "h2h": out
        }, f, ensure_ascii=False, indent=2)

    print(f"  Coppie uniche con scontri diretti: {len(out)}")
    print(f"Scritto {OUT_H2H}")

    # Stampa qualche esempio interessante
    examples = [("FRA", "ITA"), ("ARG", "BRA"), ("ESP", "ENG"), ("ITA", "URU"), ("ARG", "FRA")]
    print("\nEsempi scontri diretti (dal 1994):")
    for a, b in examples:
        k = f"{min(a,b)}|{max(a,b)}"
        v = out.get(k)
        if v:
            la, lb = (a, b) if a <= b else (b, a)
            wa = v["w_a"] if a <= b else v["w_b"]
            wb = v["w_b"] if a <= b else v["w_a"]
            print(f"  {a} vs {b}: {wa}W / {v['d']}D / {wb}L  (n={v['n']})")
        else:
            print(f"  {a} vs {b}: nessun precedente trovato")


if __name__ == "__main__":
    main()
