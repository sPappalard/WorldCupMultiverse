# Simulatore Interattivo Mondiali 2026 — Specifica di progetto

> Documento da fornire a Claude Code come brief di build. È autosufficiente: contiene tutto il necessario per costruire la v1. Le sezioni marcate **[INPUT UTENTE]** indicano dati o decisioni che fornisco io e che Claude Code NON deve inventare.

---

## 1. Cos'è e a chi serve

Web app **gratuita, client-side e interattiva** che simula l'intero tabellone dei Mondiali 2026 (48 squadre, 12 gironi da 4, nuovo Round of 32) tramite simulazione Monte Carlo, e restituisce le probabilità di vittoria di ciascuna squadra.

L'utente preme "Simula", guarda il tabellone comporsi dal vivo e riceve la classifica delle squadre con la rispettiva probabilità di vincere il torneo. Può inoltre **iniettare scenari "what-if"** (es. assenza di un big) che modificano la simulazione.

Scopo del progetto: prodotto-vetrina virale per LinkedIn e case study per un profilo **Technical Product Manager**. Le priorità di prodotto derivano da questo: rifinitura visiva e onestà metodologica contano più della complessità del modello.

---

## 2. Obiettivi

- L'utente completa una simulazione e ottiene un output chiaro e condivisibile in meno di ~30 secondi di interazione.
- La simulazione (10.000 run) gira interamente nel browser in 1–2 secondi.
- Ogni risultato è facilmente condivisibile come immagine (card) per LinkedIn.
- Costo di esercizio: zero (hosting statico, nessun backend).

---

## 3. Scope v1 — Cosa VA fatto

1. Caricamento di un file dati statico (`teams.json`) con le 48 squadre e i loro parametri.
2. Motore di simulazione Monte Carlo completo (gironi → Round of 32 → ... → finale), 10.000 run.
3. Output aggregato: classifica delle squadre con probabilità di vittoria del torneo (mostrare almeno le top 10–16).
4. Visualizzazione animata del tabellone durante la simulazione (vedi §8).
5. Pannello "what-if" con un set ristretto di fattori iniettabili (vedi §7).
6. Generazione di una card immagine condivisibile + testo precompilato (vedi §9).
7. Deploy statico (Vercel o GitHub Pages).
8. **Motore-partita Poisson bivariato (Dixon-Coles)** invece del semplice Elo→W/D/L (vedi §5.3).
9. **Pipeline offline di stima bayesiana gerarchica** dei parametri di forza, eseguita a build-time (vedi §5.6). Il runtime resta 100% client-side.
10. **Validazione/back-testing** del motore-partita su tornei passati con RPS e Brier score, riportata nel README (vedi §5.7).

---

## 4. Fuori scope — Cosa NON va fatto in v1

- **Nessun backend, database o autenticazione.** Tutto client-side.
- **Nessun aggiornamento automatico dei dati** (lo script notturno via GitHub Actions è esplicitamente rimandato alla v2).
- **Nessuna leaderboard / salvataggio dei pronostici degli utenti** (richiederebbe storage; rimandato a v2).
- **Niente localStorage/sessionStorage** se il deploy è un artifact; in app standalone su Vercel è ammesso ma non necessario in v1.
- **Niente over-engineering inutile.** No reti neurali / ML come motore (sui dati internazionali sparsi raramente battono Poisson/Elo), no dati per-giocatore granulari. La sofisticazione ammessa è quella dei §5.3/§5.6/§5.7 (Poisson bivariato + fitting bayesiano + validazione), che resta leggibile e giustificabile. Tutto ciò che non sai spiegare nel README va tagliato.
- **Nessun logo o marchio FIFA ufficiale.** Usare il nome "Simulatore Mondiali 2026" e le bandiere nazionali, non i marchi registrati.

---

## 5. Il modello predittivo (logica core)

Il motore di previsione è un **modello Poisson bivariato in stile Dixon-Coles**, con i parametri di forza delle squadre stimati **offline** da un **modello bayesiano gerarchico** (§5.6) e **validati** su tornei passati (§5.7). Il browser usa solo i parametri già stimati: **nessun fitting a runtime, costo zero invariato**.

### 5.1 Forza delle squadre (parametri attacco/difesa)
Ogni squadra è descritta da due parametri principali — **forza d'attacco** e **forza di difesa** — più un effetto **campo/casa** globale. Questi NON si inseriscono a mano: sono l'output del fitting bayesiano (§5.6). Elo, valore rosa e pedigree NON sono più pilastri sommati a mano, ma **covariate/prior** che entrano nel modello gerarchico per aiutare le squadre con pochi dati recenti (lo shrinkage verso la media viene informato dalle covariate). Prior e iperparametri restano configurabili nel `config`.

### 5.2 Forma / condizione
La forma recente entra come **time-decay** nel fitting (le partite più recenti pesano di più, alla Dixon-Coles), non come pilastro a parte. In UI si dichiara la data dello snapshot. Come modificatore what-if a runtime, agisce come piccolo aggiustamento (±5%) sui parametri d'attacco/difesa della squadra.

### 5.3 Motore-partita: Poisson bivariato (Dixon-Coles)
Per una partita tra A e B si stimano i gol attesi:
```
λ_A = exp(intercetta + attacco_A − difesa_B + casa_A)
λ_B = exp(intercetta + attacco_B − difesa_A)
```
Il risultato si estrae da un **Poisson bivariato** (cattura la correlazione tra i due punteggi), con la **correzione Dixon-Coles** sui risultati bassi (0-0, 1-0, 0-1, 1-1). Da qui derivano sia lo **scoreline realistico** (per l'animazione) sia W/D/L.
- **Gironi**: si usa direttamente lo scoreline simulato — i pareggi escono naturalmente dal modello.
- **Eliminazione**: in caso di pareggio nei 90', risolvere come supplementari/rigori con esito quasi-coin-flip leggermente inclinato verso la squadra con λ atteso maggiore.

### 5.4 Monte Carlo — IL PUNTO CRITICO (logica invariata)
**Non** far avanzare "la squadra con probabilità maggiore": darebbe sempre lo stesso tabellone e un vincitore al 100%. Invece, in **ogni** delle 10.000 run:
1. **Gironi**: per ciascun girone simulare tutte e 6 le partite estraendo uno scoreline dal modello (§5.3). Classifica (3/1/0; spareggi: differenza reti, poi gol fatti). Prime 2 di ogni girone.
2. **Migliori terze**: classificare le 12 terze e qualificare le 8 migliori secondo i criteri ufficiali. **[INPUT UTENTE]** fornisce la struttura ufficiale del Round of 32 e la tabella di allocazione delle terze (pezzo più complesso del formato a 48).
3. **Eliminazione**: comporre il tabellone ufficiale e simulare ogni partita estraendo lo scoreline, avanzando il vincitore *estratto* (non il favorito), fino alla finale.
4. Registrare il vincitore di quella run.

Dopo 10.000 run: **probabilità di vittoria = vittorie / 10.000**. Stesso conteggio per "raggiunge la finale/semifinale", ecc.

### 5.5 Performance
10.000 run < ~1–2s in JS puro; numero di run configurabile (default 10.000, non sotto 5.000). Se il campionamento dal Poisson bivariato rallenta, **pre-calcolare una volta** per ogni accoppiamento possibile la distribuzione di scoreline/W-D-L e poi campionare da quella nelle run.

### 5.6 Pipeline offline di stima bayesiana (Python, build-time) — in v1
- Script Python **separato dal frontend** (non gira nel browser).
- **Input**: dataset storico dei risultati internazionali (gol per partita) + covariate per squadra (Elo, valore rosa). **[INPUT UTENTE]** fornisce il dataset (es. Kaggle "International football results").
- **Modello**: Poisson bivariato gerarchico bayesiano — attacco/difesa per squadra con shrinkage gerarchico, effetto casa, time-decay Dixon-Coles — fit con **PyMC** o **Stan**.
- **Output**: `model-params.json` con, per ogni squadra, media e incertezza (sd) di attacco e difesa, più i parametri globali (intercetta, casa, correzione DC).
- **Esecuzione**: una tantum in locale o via GitHub Action; output statico e versionato. Il runtime resta 100% client-side.
- **Opzionale ed elegante**: usare l'incertezza dei parametri nella Monte Carlo (campionare attacco/difesa dalla posteriore a ogni run) per propagare l'incertezza nelle percentuali finali.

### 5.7 Validazione / back-testing — in v1
- Back-test del motore-partita su risultati storici held-out (es. partite dei Mondiali 2018 e 2022), validando le **singole partite**, non il tabellone.
- **Metriche**: **Ranked Probability Score (RPS)** — standard nel calcio — e **Brier score**, confrontati con una baseline (Elo semplice) per mostrare se il modello aggiunge valore.
- **Output**: `validation.json` + una sezione nel README con i punteggi. È la prova di rigore più forte per il profilo TPM: dimostra di aver *misurato* la qualità, non solo costruito.

---

## 6. Struttura dati — due file

I dati sono divisi in due file con ruoli distinti:

### 6.1 `teams.json` — metadata + covariate (lo curo io, lo scaffolda Claude Code)
Anagrafica delle squadre e covariate usate come input al fitting offline (§5.6). Schema per squadra:

```json
{
  "id": "FRA",
  "name": "Francia",
  "group": "I",
  "flag": "fr",
  "elo": 2050,
  "squadValue": 1200,
  "isHost": false,
  "active": true
}
```

- `elo`, `squadValue`: covariate per il modello gerarchico (NON sommate a mano a runtime).
- `isHost`: bool per l'effetto casa.
- `active`: bool, default `true`. Le 48 partecipanti sono `true`.

**Entry speciale Italia (49ª squadra):** includere l'Italia con `id: "ITA"`, `active: false` e `substituteFor: "BIH"`. Di default non partecipa; il fattore flagship §7.0 la attiva al posto della Bosnia nel Girone B. Aggiungere allo schema il campo opzionale `substituteFor`.

### 6.2 `model-params.json` — output del fitting bayesiano (generato dalla pipeline §5.6)
Prodotto dallo script Python, NON scritto a mano. Per ogni squadra i parametri stimati, più i globali:

```json
{
  "global": { "intercept": 0.1, "homeAdv": 0.35, "rho": -0.05 },
  "teams": {
    "FRA": { "attack": 0.42, "attackSd": 0.08, "defense": 0.38, "defenseSd": 0.07 },
    "ITA": { "attack": 0.30, "attackSd": 0.10, "defense": 0.33, "defenseSd": 0.09 }
  }
}
```

- `rho`: parametro di correzione/correlazione Dixon-Coles.
- `*Sd`: incertezza posteriore, usabile per propagare l'incertezza nella Monte Carlo (§5.6, opzionale).

Tenere prior, iperparametri e numero di run in un file di config separato (es. `config.js` / `config.py`), non hardcodati nella logica.

---

## 7. Fattori iniettabili "what-if"

Ognuno è un **modificatore** applicato al rating o alla varianza di una squadra; dopo la selezione si **ri-esegue la simulazione**. L'utente può selezionarne uno o più contemporaneamente.

### 7.0 Fattore FLAGSHIP: "Inserisci l'Italia" 🇮🇹 (feature di punta, sempre presente)
Di default l'Italia **non è nel torneo**: non si è qualificata, eliminata dalla Bosnia ai calci di rigore nella finale playoff (terza esclusione consecutiva dopo 2018 e 2022). Questo toggle, quando attivato, **sostituisce la Bosnia con l'Italia nel Girone B** e **ri-esegue tutte le simulazioni**.
- **Perché il Girone B**: è esattamente lo slot che l'Italia avrebbe occupato qualificandosi (Girone B con Canada, Qatar, Svizzera). Lo swap è quindi storicamente corretto, non arbitrario.
- **Meccanica**: la Bosnia (id `BIH`, Girone B) viene rimpiazzata dall'Italia (id `ITA`) con i rating reali dell'Italia; tutto il resto del motore resta identico. Al disattivare il toggle, torna la Bosnia.
- **Importanza**: è la feature narrativa centrale del progetto ("L'Italia non c'è ai Mondiali, così l'ho rimessa dentro io"). Va resa molto visibile in UI (non nascosta tra gli altri what-if) e il suo risultato deve generare una **card condivisibile dedicata** (es. "Ecco fin dove arriva l'Italia, se l'avessi qualificata io").
- L'Italia deve essere presente in `teams.json` come entry speciale **inattiva di default** (vedi §6).

### Altri fattori (tenerne ~5 per la v1)
1. **Assenza di 1 big** (es. Mbappé nella Francia): −X al rating della squadra (default: −40 punti Elo-equivalenti, regolabile).
2. **Infortuni a 2–3 titolari** (anche a torneo in corso, da una fase scelta in poi): riduzione maggiore (default: −80).
3. **Rientro di un big / stato di grazia**: piccolo bonus (default: +30).
4. **Fattore Caos** (slider 0–100): aumenta la varianza degli esiti appiattendo le probabilità verso il 50/50 → più sorprese. Meccanica: interpolare ogni probabilità verso 0.5 in proporzione al valore dello slider.
5. **Squalifica/cartellino** per il turno successivo: penalità una-tantum.
6. **Fattore casa/quota** per sedi specifiche: bonus situazionale.

Ogni fattore deve essere **etichettato come euristica** in UI (vedi §11). Implementarli come oggetti di config riutilizzabili e impilabili, non come if hardcodati.

---

## 8. UX e visualizzazione

- Schermata iniziale pulita con un grande pulsante "Simula".
- **Distinzione importante e da rendere esplicita in UI:** i numeri di testa (probabilità di vittoria) vengono dall'**aggregato delle 10.000 run**. L'animazione del tabellone mostra invece **una singola simulazione d'esempio** giocata dal vivo (etichettata "una simulazione possibile"), con accanto a ogni squadra la sua % di vittoria torneo presa dall'aggregato. Non spacciare la singola run animata per "la previsione".
- L'animazione del tabellone (le partite che si "giocano" round per round, contatori che scorrono) è la parte che richiede **più cura visiva**: è ciò che finisce nel video del post. Investire qui la qualità di rifinitura.
- Pannello laterale/modale per i fattori what-if, con re-simulazione al cambio.
- Mobile-first e veloce.

---

## 9. Output condivisibile (la feature di distribuzione)

- Al termine, generare una **card immagine** scaricabile/condivisibile con: top squadre + %, eventuali scenari what-if attivi, e un'**affermazione discutibile** in evidenza (es. "Il modello dà il Marocco al 4% — d'accordo?").
- Generare un **testo precompilato** per LinkedIn.
- Impostare correttamente gli **OG tags** (title, description, image) per l'anteprima del link.
- Se possibile, rendere lo stato della simulazione codificabile in URL (query param) così un utente può condividere il *proprio* scenario what-if e farlo riaprire identico. Questo è il vero motore virale: ogni scenario personalizzato è condivisibile.

---

## 10. Architettura tecnica

Due componenti nettamente separati:

**A) Runtime (browser) — 100% client-side, gratuito**
- JavaScript puro o framework leggero (React va bene se aiuta la UI; nessun SSR/backend).
- Tutto il calcolo della Monte Carlo nel browser. Nessuna API a runtime.
- Carica `teams.json` + `model-params.json` statici; nessun fitting a runtime.
- Parametri/run in `config.js` separato.
- **Analytics leggero** (es. Plausible) per misurare simulazioni avviate/completate e condivisioni: serve per il case study. "Zero backend" non significa "zero misurazione".
- Deploy su **Vercel** o **GitHub Pages**.

**B) Pipeline offline (Python) — build-time, NON in produzione**
- Script Python separato (`/model` o simile) che fa il fitting bayesiano (§5.6) e la validazione (§5.7), e produce `model-params.json` + `validation.json`.
- Gira una tantum in locale o via GitHub Action; non è un servizio, non costa nulla a regime.
- `requirements.txt` con PyMC/Stan, pandas, numpy. README della pipeline con istruzioni per rigenerare i parametri.

Codice ordinato e leggibile in entrambi: il repo stesso fa parte del portfolio.

---

## 11. Vincoli di qualità e framing onesto (requisito, non opzionale)

- **Evitare la falsa precisione.** Mostrare percentuali arrotondate a interi, non a 1 decimale.
- In UI e nel README, dichiarare in modo conciso: che approccio è usato (Elo + Monte Carlo), che è **deliberatamente semplice** perché l'obiettivo è l'engagement, non battere i bookmaker, e quali sono i limiti (es. scontri storici e "fattori" sono euristiche).
- I fattori what-if vanno etichettati chiaramente come euristici/giocosi, separati dal motore predittivo "serio".
- Niente linguaggio iperbolico ("algoritmi avanzatissimi", "scientifico", "infallibile") nei testi dell'app.

---

## 12. Definizione di "fatto" (acceptance v1)

- [ ] Premendo "Simula" parte una Monte Carlo da 10.000 run che finisce in < 2s.
- [ ] Il motore-partita usa il Poisson bivariato (Dixon-Coles) e produce scoreline realistici.
- [ ] La pipeline Python genera `model-params.json` (attacco/difesa + incertezza) ed è ri-eseguibile da README.
- [ ] Validazione eseguita: `validation.json` + sezione README con RPS e Brier vs baseline.
- [ ] L'output mostra una classifica con le probabilità di vittoria (top 10+), e la somma è coerente (~100%).
- [ ] Run ripetute danno una distribuzione di vincitori diversi (non sempre lo stesso al 100%).
- [ ] Almeno 4 fattori what-if funzionanti, impilabili, con re-simulazione (più il flagship Italia §7.0).
- [ ] Tabellone animato distinto correttamente dall'aggregato.
- [ ] Card immagine + testo + OG tags generati.
- [ ] Deploy live raggiungibile a un URL pubblico.
- [ ] Analytics attivo.
- [ ] README con metodologia, limiti, punteggi di validazione e decisioni di scope.

---

## 13. Prerequisiti forniti dall'utente (Claude Code NON li inventa)

1. **Dataset storico dei risultati internazionali** (gol per partita) per il fitting offline, es. il dataset Kaggle "International football results". È l'input principale del modello.
2. `teams.json` con anagrafica + covariate (Elo, valore rosa) per le 48 squadre.
3. I valori dell'**Italia** (anagrafica + covariate) per l'entry speciale `ITA`, usata dal fattore flagship §7.0 al posto della Bosnia.
4. Il sorteggio ufficiale dei 12 gironi (composizione delle squadre).
5. La struttura ufficiale del Round of 32 e la tabella di allocazione delle 8 migliori terze.
6. Eventuale aggiustamento finale di prior/iperparametri e delle magnitudini dei fattori what-if.

Nota: `model-params.json` e `validation.json` NON li fornisci tu — li genera la pipeline Python dal dataset storico.

Claude Code deve costruire schema, template scaffoldato, motore, UI e deploy; l'utente riempie i dati reali e verifica i parametri.
