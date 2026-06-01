"""
Calcola due indicatori aggiuntivi per ogni squadra dei Mondiali 2026:

1. FORMA RECENTE — ultime 30 partite con risultato reale prima del 31/03/2026.
   Punteggio 0–100 basato su punti pesati per importanza della partita e
   time-decay leggero (partite più recenti pesano di più).

2. RENDIMENTO KNOCKOUT — win rate pesato nelle fasi finali dei tornei major
   dal 1994. Gerarchia esplicita: Mondiali (10×) >> Europei/Copa América (5×)
   >> AFCON/AFC Asian Cup (3×) >> altri (1.5×). Una vittoria ai Mondiali vale
   6.7 volte una vittoria alla Coppa d'Africa.

Output: public/data/team-stats.json
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

import pandas as pd

ROOT        = Path(__file__).resolve().parent.parent
RESULTS_CSV = ROOT / "International football results from 1872 to 2026" / "results.csv"
TEAMS_JSON  = ROOT / "public" / "data" / "teams.json"
OUT         = ROOT / "public" / "data" / "team-stats.json"

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
    "Portugal": "POR", "DR Congo": "COD", "Democratic Republic of the Congo": "COD",
    "Uzbekistan": "UZB", "Colombia": "COL",
    "England": "ENG", "Croatia": "CRO", "Ghana": "GHA", "Panama": "PAN",
    "Italy": "ITA",
}

# ── Peso per la FORMA RECENTE (scala più piatta — conta solo l'importanza relativa) ──
FORM_TOURNAMENT_WEIGHT = {
    "FIFA World Cup": 3.0,
    "UEFA Euro": 2.5,
    "Copa América": 2.5,
    "Africa Cup of Nations": 2.0,
    "AFC Asian Cup": 2.0,
    "CONCACAF Gold Cup": 1.8,
    "FIFA Confederations Cup": 1.8,
    "UEFA Nations League": 1.5,
    "CONCACAF Nations League": 1.5,
    "Olympic Games": 1.5,
}

# ── Gerarchia KNOCKOUT — scala volutamente sbilanciata verso i Mondiali ──
# Tier 1 — Mondiali FIFA: massima competitività globale, il torneo per eccellenza
# Tier 2 — Continentali top: UEFA Euro e Copa América (competizioni da 16-32 top nazionali)
# Tier 3 — Continentali medi: AFCON, AFC Asian Cup (competizioni continentali con ampio field)
# Tier 4 — Continentali minori / Nations League: CONCACAF Gold Cup, UEFA NL, ecc.
# Tier 5 — Altri tornei major minori: Confederations Cup, Arab Cup, ecc.
#
# Rapporto Mondiali/AFCON = 10/3 ≈ 3.3×  →  una vittoria Mondiali vale 3× una AFCON
# Rapporto Mondiali/Euro  = 10/5  = 2×    →  una vittoria Mondiali vale 2× un Europeo
KNOCKOUT_TIERS: list[tuple[str, float, str]] = [
    # (stringa da cercare nel nome torneo, peso, label display)
    ("FIFA World Cup",            10.0, "🌍 Mondiali FIFA"),
    ("UEFA Euro",                  5.0, "🇪🇺 UEFA Euro"),
    ("Copa América",               5.0, "🌎 Copa América"),
    ("Africa Cup of Nations",      3.0, "🌍 AFCON"),
    ("AFC Asian Cup",              3.0, "🌏 AFC Asian Cup"),
    ("FIFA Confederations Cup",    2.5, "🏆 Confederations Cup"),
    ("CONCACAF Gold Cup",          2.0, "🌎 CONCACAF Gold Cup"),
    ("UEFA Nations League",        1.5, "🇪🇺 UEFA Nations League"),
    ("CONCACAF Nations League",    1.5, "🌎 CONCACAF Nations League"),
    ("Olympic Games",              1.5, "🏅 Olimpiadi"),
    ("Arab Cup",                   1.0, "🌍 Arab Cup"),
    ("Gulf Cup",                   1.0, "🌍 Gulf Cup"),
]
# Lookup rapido: stringa → (peso, label)
KNOCKOUT_WEIGHT_MAP = {k: (w, lbl) for k, w, lbl in KNOCKOUT_TIERS}

# Tornei major (quelli dove contiamo il rendimento knockout)
MAJOR_TOURNAMENTS = {k for k, _, _ in KNOCKOUT_TIERS}

# Cutoff per la forma recente
FORM_CUTOFF = date(2026, 3, 31)
FORM_N = 30  # ultime N partite con risultato reale (30 = segnale più stabile di 15)


def form_tournament_weight(name: str) -> float:
    for key, w in FORM_TOURNAMENT_WEIGHT.items():
        if key.lower() in name.lower():
            return w
    if "friendly" in name.lower():
        return 0.6
    if "qualif" in name.lower():
        return 0.9
    return 1.0


def knockout_tournament_info(name: str) -> tuple[float, str] | None:
    """Restituisce (peso, label) se il torneo è nella gerarchia knockout, None altrimenti.
    Esclude esplicitamente qualificazioni e fasi preliminari.
    """
    nl = name.lower()
    # Escludi qualificazioni, preliminari, play-off di accesso
    if any(x in nl for x in ("qualif", "qualifying", "preliminary", "play-off round",
                              "first round", "group stage")):
        return None
    for key, (w, lbl) in KNOCKOUT_WEIGHT_MAP.items():
        if key.lower() in nl:
            return w, lbl
    return None


def is_major(name: str) -> bool:
    return knockout_tournament_info(name) is not None


def compute_form(df: pd.DataFrame, team_id: str, n: int = 30) -> dict:
    """
    Ultime N partite di una squadra prima del FORM_CUTOFF.
    Restituisce punteggio 0–100, record W/D/L, e lista partite.
    """
    mask = (
        ((df["home_id"] == team_id) | (df["away_id"] == team_id)) &
        (df["date"].dt.date <= FORM_CUTOFF)
    )
    games = df[mask].sort_values("date", ascending=False).head(n)

    if len(games) == 0:
        return {"score": 50, "w": 0, "d": 0, "l": 0, "n": 0, "lastDate": None}

    total_w, w, d, l = 0.0, 0, 0, 0

    for rank, (_, row) in enumerate(games.iterrows()):
        tw = form_tournament_weight(row["tournament"])
        # decay leggero: partita più recente pesa 1.0, l'ultima (30ª) pesa ~0.33
        recency = 1.0 - (rank / (n * 1.5))

        is_home = row["home_id"] == team_id
        gs = row["home_score"] if is_home else row["away_score"]
        gc = row["away_score"] if is_home else row["home_score"]

        if gs > gc:
            pts = 3
            w += 1
        elif gs == gc:
            pts = 1
            d += 1
        else:
            pts = 0
            l += 1

        total_w += pts * tw * recency

    # normalizza: punteggio max teorico = 3 * sum(tw*recency) per tutte vittorie
    max_w = sum(
        3.0 * form_tournament_weight(row["tournament"]) * (1.0 - (rank / (n * 1.5)))
        for rank, (_, row) in enumerate(games.iterrows())
    )
    score = round((total_w / max_w * 100) if max_w > 0 else 50)
    score = max(0, min(100, score))

    last_date = games.iloc[0]["date"].strftime("%Y-%m-%d")
    return {"score": score, "w": w, "d": d, "l": l, "n": len(games), "lastDate": last_date}


def load_tournament_history() -> dict:
    data = json.loads((Path(__file__).resolve().parent / "tournament_history.json").read_text(encoding="utf-8"))
    return data["tournaments"], data["allTimeTitles"]


def compute_history_score(team_id: str, all_time_titles: dict) -> dict:
    """
    Punteggio storia nazionale: titoli + finali nei tornei major, pesati per
    gerarchia. Score 0–100 normalizzato sul miglior punteggio grezzo tra tutte
    le squadre (Brasile = 100), così il primo posto vale sempre 100.

    Squadre con zero titoli e zero finali ricevono score=0, più un micro-bonus
    (max 4 pt) basato sulle semplici partecipazioni ai tornei major: chi ha
    disputato più edizioni di Mondiali/tornei continentali mostra comunque una
    storia internazionale non nulla.
    """
    HISTORY_WEIGHTS = {
        "🌍 Mondiali FIFA":      15.0,
        "🇪🇺 UEFA Euro":          5.0,
        "🌎 Copa América":        5.0,
        "🌍 AFCON":               3.0,
        "🌏 AFC Asian Cup":       3.0,
        "🌎 CONCACAF Gold Cup":   2.0,
    }
    MAX_TITLES = {
        "🌍 Mondiali FIFA":      5,   # Brasile
        "🇪🇺 UEFA Euro":          4,   # Spagna
        "🌎 Copa América":       16,   # Argentina
        "🌍 AFCON":               7,   # Egitto
        "🌏 AFC Asian Cup":       4,   # Giappone
        "🌎 CONCACAF Gold Cup":   9,   # Messico
    }
    # Massimo finali storiche raggiunte (vinte + perse) per torneo
    MAX_FINALS = {
        "🌍 Mondiali FIFA":      8,   # Brasile e Germania
        "🇪🇺 UEFA Euro":          6,   # Germania
        "🌎 Copa América":       28,   # Argentina
        "🌍 AFCON":              11,   # Egitto
        "🌏 AFC Asian Cup":       5,   # Giappone/Iran/Corea
        "🌎 CONCACAF Gold Cup":  14,   # Messico
    }
    # Punteggio grezzo del Brasile (squadra con più titoli pesati) usato per
    # normalizzare. Calcolato analiticamente: 5/5*10 + 0 + 0 + ... = 10.0
    # Aggiornare se cambia la struttura dei dati.
    _RAW_MAX = 10.0   # Brasile: 5 Mondiali su 5 → earned = 10.0

    raw = 0.0
    breakdown = []
    editions_score = 0.0   # micro-bonus partecipazioni per squadre a 0

    for tourn_label, tw in HISTORY_WEIGHTS.items():
        tourn_data = all_time_titles.get(tourn_label, {})
        titles  = tourn_data.get("titles", {}).get(team_id, 0)
        finals  = tourn_data.get("finals", {}).get(team_id, 0)
        editions = tourn_data.get("editions_count", {}).get(team_id, 0)
        max_t   = MAX_TITLES.get(tourn_label, 1)

        # micro-bonus partecipazioni (contribuisce solo se titoli=finali=0)
        editions_score += (editions / max(max_t * 3, 10)) * tw * 0.05

        if titles == 0 and finals == 0:
            continue

        max_f = MAX_FINALS.get(tourn_label, max(finals, 1))
        # Titoli: contributo principale (65% del peso torneo al massimo)
        titles_earned = (titles / max_t) ** 0.85 * tw * 0.65
        # Finali raggiunte (vinte + perse): contributo secondario (35% del peso)
        # Chi arriva spesso in finale, anche senza vincere, mostra grandezza storica.
        finals_earned = (finals / max_f) ** 0.85 * tw * 0.35
        earned = titles_earned + finals_earned
        raw += earned

        tourn_score = min(100, round((titles / max_t) * 65 + (finals / max(max_f, 1)) * 35))

        breakdown.append({
            "label":   tourn_label,
            "weight":  tw,
            "titles":  titles,
            "finals":  finals,
            "score":   tourn_score,
        })

    # Normalizzazione: usiamo un tetto leggermente sopra il raw del Brasile
    # (5 Mondiali = 10.0) così nessuno arriva a 100 e i top team si differenziano.
    # _NORM = 13.0  →  Brasile ≈ 77, Germania (4M+3E ≈ 11.1) ≈ 85, Argentina ≈ 74
    # Non funziona bene per Argentina (Copa America ha max_titles=16 → peso basso).
    # Soluzione: calcoliamo il raw di ogni squadra e normalizziamo sul massimo reale
    # tra tutte le squadre, poi mappiamo in [1, 95] così c'è sempre separazione.
    if raw > 0:
        global_score = raw   # restituiamo il raw; la normalizzazione avviene in main()
        zero_reason = None
    else:
        global_score = 0.0
        zero_reason = "Nessun titolo né finale in tornei major"

    breakdown.sort(key=lambda x: (-x["weight"], -x["titles"]))
    return {"_raw": global_score, "score": 0, "byTournament": breakdown, "_zeroReason": zero_reason}


def compute_knockout(df: pd.DataFrame, team_id: str) -> dict:
    """
    Rendimento storico nelle fasi finali dei tornei major dal 1994.
    - W/D/L: dal dataset (partite effettive, qualificazioni escluse)
    - Edizioni/SF/Finali/Titoli: da tournament_history.json (dati curati da Wikipedia/fonti ufficiali)
    - Score 0-100: pesato per gerarchia torneo
    """
    from collections import defaultdict

    mask = (
        ((df["home_id"] == team_id) | (df["away_id"] == team_id)) &
        df["is_major"] &
        (df["date"].dt.year >= 1994)
    )
    games = df[mask]

    history, _ = load_tournament_history()

    # ── 1. W/D/L per torneo dal dataset ──
    total_w, total_max = 0.0, 0.0
    w, d, l = 0, 0, 0
    by_tourn: dict[str, dict] = {}

    for _, row in games.iterrows():
        info = knockout_tournament_info(row["tournament"])
        if info is None:
            continue
        tw, lbl = info

        is_home = row["home_id"] == team_id
        gs = row["home_score"] if is_home else row["away_score"]
        gc = row["away_score"] if is_home else row["home_score"]

        if gs > gc:
            pts = 1.0; w += 1; result = "w"
        elif gs == gc:
            pts = 0.5; d += 1; result = "d"
        else:
            pts = 0.0; l += 1; result = "l"

        total_w   += pts * tw
        total_max += 1.0 * tw

        if lbl not in by_tourn:
            by_tourn[lbl] = {"weight": tw, "w": 0, "d": 0, "l": 0, "n": 0,
                              "earned": 0.0, "maxEarned": 0.0}
        by_tourn[lbl][result]      += 1
        by_tourn[lbl]["n"]         += 1
        by_tourn[lbl]["earned"]    += pts * tw
        by_tourn[lbl]["maxEarned"] += tw

    if not by_tourn:
        return {"score": 50, "w": 0, "d": 0, "l": 0, "n": 0, "byTournament": []}

    # ── 2. Edizioni/SF/finali/titoli dai dati curati ──
    tourn_stats: dict[str, dict] = defaultdict(
        lambda: {"editions": 0, "semiFinals": 0, "finals": 0, "titles": 0}
    )
    for tourn_label, tourn_data in history.items():
        for ed in tourn_data["editions"]:
            all_four = [ed["winner"], ed["runnerUp"]] + ed["semis"]
            if team_id not in all_four:
                continue
            ts = tourn_stats[tourn_label]
            ts["editions"] += 1
            if team_id in ed["semis"]:
                ts["semiFinals"] += 1
            elif team_id == ed["runnerUp"]:
                ts["finals"] += 1
            elif team_id == ed["winner"]:
                ts["finals"] += 1
                ts["titles"] += 1

    score = round((total_w / total_max * 100) if total_max > 0 else 50)
    score = max(0, min(100, score))

    breakdown = sorted(
        [
            {
                "label":      lbl,
                "weight":     v["weight"],
                "w": v["w"], "d": v["d"], "l": v["l"], "n": v["n"],
                "score":      round(v["earned"] / v["maxEarned"] * 100) if v["maxEarned"] > 0 else 50,
                "editions":   tourn_stats[lbl]["editions"],
                "semiFinals": tourn_stats[lbl]["semiFinals"],
                "finals":     tourn_stats[lbl]["finals"],
                "titles":     tourn_stats[lbl]["titles"],
            }
            for lbl, v in by_tourn.items()
        ],
        key=lambda x: (-x["weight"], x["label"]),
    )

    return {"score": score, "w": w, "d": d, "l": l, "n": len(games), "byTournament": breakdown}


def main() -> None:
    print("Carico results.csv…")
    df = pd.read_csv(RESULTS_CSV, parse_dates=["date"])
    df = df.dropna(subset=["home_score", "away_score"])
    df["home_score"] = df["home_score"].astype(int)
    df["away_score"] = df["away_score"].astype(int)

    # Aggiungi colonne id squadra
    df["home_id"] = df["home_team"].map(NAME_TO_ID)
    df["away_id"] = df["away_team"].map(NAME_TO_ID)
    df["is_major"] = df["tournament"].apply(is_major)

    _, all_time_titles = load_tournament_history()
    teams_json = json.loads(TEAMS_JSON.read_text(encoding="utf-8"))
    teams = teams_json["teams"]
    wanted = set(NAME_TO_ID.values())

    out = {}
    for team in teams:
        tid = team["id"]
        if tid not in wanted:
            continue

        form     = compute_form(df, tid, FORM_N)
        knockout = compute_knockout(df, tid)
        history_score = compute_history_score(tid, all_time_titles)

        out[tid] = {
            "form":    form,
            "knockout": knockout,
            "history": history_score,
        }

    # Normalizza i punteggi storia su tutti: max_raw → 95, 0 resta 0.
    # Cap a 95 (non 100) per lasciare sempre spazio visivo tra le squadre.
    max_raw = max((v["history"]["_raw"] for v in out.values()), default=1.0)
    max_raw = max(max_raw, 0.01)
    for tid, v in out.items():
        raw = v["history"].pop("_raw")
        if raw > 0:
            v["history"]["score"] = max(1, round((raw / max_raw) * 95))
        else:
            v["history"]["score"] = 0

    for tid, v in out.items():
        hs = v["history"]
        ko = v["knockout"]
        fm = v["form"]
        print(f"  {tid}: forma={fm['score']} ({fm['w']}W/{fm['d']}D/{fm['l']}L) | ko={ko['score']} (n={ko['n']}) | storia={hs['score']}")

    result = {
        "_meta": {
            "description": "Forma recente e rendimento knockout per le 48+1 squadre Mondiali 2026.",
            "formMatches": FORM_N,
            "formCutoff": FORM_CUTOFF.isoformat(),
            "knockoutSince": 1994,
            "knockoutNote": "Rendimento nelle fasi finali dei tornei major dal 1994 (W/D/L effettivi dal dataset storico)",
            "historyNote": "Punteggio storia nazionale: titoli vinti nella storia completa del torneo (fonte: Wikipedia/FIFA/UEFA/CONMEBOL/CAF)",
            "source": "Kaggle International football results 1872-2026",
            "generatedAt": datetime.now().strftime("%Y-%m-%d"),
            "knockoutHierarchy": [
                {"label": lbl, "weight": w}
                for _, w, lbl in KNOCKOUT_TIERS
            ],
        },
        "teams": out,
    }

    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nScritto {OUT} con {len(out)} squadre.")


if __name__ == "__main__":
    main()
