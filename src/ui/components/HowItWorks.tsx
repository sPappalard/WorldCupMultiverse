/**
 * HowItWorks — pagina-blog "Come funziona MonteCalcio".
 * Layout: articolo scrollabile, niente card-grid, niente pills.
 */

import { useMemo } from 'react';
import type { ModulatorConfig, Team, ModelParams, H2HRecord, TeamStats } from '../../engine/types';
import { config } from '../../config';
import { computeStrengthBreakdown } from '../../engine/strengthScore';
import { StrengthPie } from './StrengthPie';

interface Props {
  modulators?: ModulatorConfig;
  onOpenAdmin?: () => void;
  teams?: Team[];
  params?: ModelParams | null;
  h2h?: Map<string, H2HRecord>;
  teamStats?: Map<string, TeamStats>;
}

function Source({ children }: { children: React.ReactNode; }) {
  return (
    <div className="hiw-source">
      <span className="hiw-source-tag">Fonte</span>
      <span className="hiw-source-text">{children}</span>
    </div>
  );
}

/* ── Componente principale ───────────────────────────────────────── */

export function HowItWorks({ modulators, onOpenAdmin, teams = [], params = null, h2h = new Map(), teamStats = new Map() }: Props) {
  const mods = modulators ?? config.modulators;

  const breakdown = useMemo(
    () => computeStrengthBreakdown({ teams, params, h2h, teamStats, modulators: mods }),
    [teams, params, h2h, teamStats, mods],
  );

  return (
    <article className="hiw-article">

      {/* ── Hero ── */}
      <header className="hiw-hero">
        <p className="hiw-eyebrow">Il progetto</p>
        <h1 className="hiw-h1">Un italiano stufo.<br />Un Mondiale senza l'Italia.<br />Una simulazione Monte Carlo.</h1>
        <p className="hiw-deck">
          Tre qualificazioni mondiali consecutive mancate. <em>Tre.</em> A un certo punto
          l'unico modo per vedere gli Azzurri giocare un Mondiale era costruirselo in casa.
          La risposta è stata costruire la simulazione. E ficcarci l'Italia dentro con la forza.
          La domanda di partenza era semplice: <strong>"ma se l'Italia ci fosse... fino a dove arriverebbe?"</strong>
        </p>
      </header>

      {/* ── Divider ── */}
      <div className="hiw-divider" />

      {/* ── Sezione 1: La simulazione ── */}
      <section className="hiw-section">
        <div className="hiw-section-label">01</div>
        <h2 className="hiw-h2">Come funziona la simulazione</h2>
        <p className="hiw-p">
          Ogni click su <strong>"Simula"</strong> genera <strong>100.000 Mondiali completi</strong> —
          gironi, migliori terze, sedicesimi, ottavi, quarti, semifinali, finale — tutti calcolati
          in circa mezzo secondo nel tuo browser, senza nessun server coinvolto.
        </p>
        <p className="hiw-p">
          Per ogni singola partita il motore calcola la distribuzione di probabilità
          su tutti i possibili risultati (0-0, 1-0, 1-1, 2-1… fino a 7 gol per parte)
          usando un <strong>modello Poisson bivariato con correzione Dixon-Coles</strong> —
          lo stesso approccio teorico di base usato da molti bookmaker professionisti.
          Il vincitore viene poi <em>estratto a caso</em> secondo quelle probabilità:
          non avanza automaticamente il favorito.
        </p>
        <div className="hiw-callout">
          In ogni singola run la Bolivia può battere la Francia. Improbabile, ma possibile.
          Come nella vita.
        </div>
        <p className="hiw-p">
          Le probabilità finali — "28% Francia" — sono frequenze empiriche:
          su 100.000 tornei simulati, la Francia ha vinto 28.000 volte.
          Le quote stile bookmaker includono un margine del 15%
          (i veri bookmaker fanno molto peggio, state tranquilli).
          Il tabellone animato mostra <em>una singola run possibile</em>, non quella "media"
          né quella più probabile.
        </p>
      </section>

      <div className="hiw-divider" />

      {/* ── Sezione 2: Punteggio Forza ── */}
      <section className="hiw-section">
        <div className="hiw-section-label">02</div>
        <h2 className="hiw-h2">Il Punteggio Forza</h2>
        <p className="hiw-p">
          Ogni squadra ha un <strong>Punteggio Forza</strong> che aggrega sei segnali distinti.
          Non è un numero magico: è la somma pesata di dati reali, ognuno con la sua storia
          e i suoi limiti. Ecco cosa c'è dentro.
        </p>

        {/* Indicatori */}
        <div className="hiw-indicators">

          <div className="hiw-indicator">
            <div className="hiw-ind-head">
              <span className="hiw-ind-dot" style={{ background: '#2fe08a' }} />
              <strong>Elo</strong>
            </div>
            <p>
              Il rating Elo è l'indicatore più affidabile: misura la forza relativa di ogni
              nazionale sulla base di decenni di risultati internazionali, pesando gli avversari
              e la posta in gioco. È il segnale con il peso maggiore nel modello.
            </p>
            <Source>eloratings.net — snapshot giugno 2026</Source>
          </div>

          <div className="hiw-indicator">
            <div className="hiw-ind-head">
              <span className="hiw-ind-dot" style={{ background: '#60a5fa' }} />
              <strong>Attacco e Difesa (parametri bayesiani)</strong>
            </div>
            <p>
              Attacco e Difesa sono stimati da un modello bayesiano gerarchico (PyMC)
              addestrato su partite internazionali fino a marzo 2026.
              Catturano le specificità offensive e difensive di ogni squadra che il solo Elo
              non riesce a distinguere — una squadra che vince 1-0 ogni volta ha un Elo
              simile a una che vince 4-3, ma il modello le tratta diversamente.
            </p>
            <Source>Kaggle "International football results 1872–2026" (~49.000 partite) — dati fino a marzo 2026</Source>
          </div>

          <div className="hiw-indicator">
            <div className="hiw-ind-head">
              <span className="hiw-ind-dot" style={{ background: '#ffc233' }} />
              <strong>Forma recente</strong>
            </div>
            <p>
              Le ultime 30 partite internazionali di ogni squadra, con un peso a decadimento
              temporale (le partite più recenti contano di più). Il risultato è un punteggio
              0–100 centrato su 50. Ha intenzionalmente un peso marginale nel modello: la forma
              è un segnale rumoroso e buona parte di essa è già "dentro" all'Elo.
            </p>
            <Source>Kaggle "International football results 1872–2026" (~49.000 partite)</Source>
          </div>

          <div className="hiw-indicator">
            <div className="hiw-ind-head">
              <span className="hiw-ind-dot" style={{ background: '#a78bfa' }} />
              <strong>Esperienza KO</strong>
            </div>
            <p>
              Due sottopunteggi combinati: <em>knockout</em> (rendimento nelle fasi a eliminazione
              diretta storiche) e <em>storia</em> (tradizione della nazionale nelle grandi
              competizioni). Applicato solo nelle partite a eliminazione diretta — chi è
              abituato a quelle pressioni ha un piccolo vantaggio.
            </p>
            <Source>Kaggle "International football results 1872–2026" — dal 1994 in poi</Source>
          </div>

          <div className="hiw-indicator">
            <div className="hiw-ind-head">
              <span className="hiw-ind-dot" style={{ background: '#18d6ec' }} />
              <strong>Valore rosa</strong>
            </div>
            <p>
              Stima del valore di mercato della rosa. È una covariata secondaria che riflette
              la qualità del materiale umano disponibile.
            </p>
            <Source>Transfermarkt — snapshot giugno 2026</Source>
            <div className="hiw-postilla">
              <strong>Nota sull'Italia:</strong> dopo l'eliminazione dalle qualificazioni mondiali,
              la Federazione ha convocato esclusivamente Under 21 per le partite successive,
              abbassando artificialmente il valore della rosa su Transfermarkt. Il valore usato
              in questo sito è quello <em>precedente all'eliminazione</em> — la rosa che
              avrebbe potenzialmente disputato il Mondiale, non quella delle amichevoli post-eliminazione.
            </div>
          </div>

          <div className="hiw-indicator">
            <div className="hiw-ind-head">
              <span className="hiw-ind-dot" style={{ background: '#f87171' }} />
              <strong>Scontri diretti (H2H)</strong>
            </div>
            <p>
              Il motore corregge le probabilità di gol con lo storico degli scontri diretti
              dal 1994: 4.078 partite, 805 coppie di squadre. Se l'Argentina ha storicamente
              dominato una certa nazionale, il suo lambda di gol aumenta leggermente in quella
              partita. L'effetto è sottile — ±1–3 punti percentuali — ma migliora la
              calibrazione per scontri con storia marcata.
            </p>
            <Source>Kaggle "International football results 1872–2026" — 4.078 partite dal 1994, 805 coppie di squadre</Source>
          </div>

        </div>

        {/* Torta */}
        <div className="hiw-pie-block">
          <h3 className="hiw-h3">Come pesano adesso</h3>
          <p className="hiw-p hiw-p--sm">
            La distribuzione riflette i pesi attuali del modello.
            Puoi cambiarli dal{' '}
            {onOpenAdmin
              ? <button className="hiw-link-btn" onClick={onOpenAdmin}>pannello Impostazioni</button>
              : <span>pannello Impostazioni (ingranaggio in alto)</span>
            } e vedere in tempo reale come cambia l'ordine delle probabilità.
          </p>
          <StrengthPie components={breakdown} />
        </div>
      </section>

      <div className="hiw-divider" />

      {/* ── Sezione 3: What-if ── */}
      <section className="hiw-section">
        <div className="hiw-section-label">03</div>
        <h2 className="hiw-h2">I What-if: la parte più disonesta (e più divertente)</h2>
        <p className="hiw-p">
          I What-if sono scenari alternativi esplicitamente etichettati come
          <strong> euristiche</strong> — il loro impatto non è calibrato con la stessa
          precisione del modello base. Sono più vicini a "e se…" che a previsioni.
        </p>
        <p className="hiw-p">
          Puoi inserire <strong>l'Italia nel Girone B</strong> al posto della Bosnia —
          l'unico motivo per cui questo sito esiste. Puoi applicare boost di forma o
          penalità di infortuni a squadre specifiche, alzare il "Fattore Caos" per rendere
          il torneo più imprevedibile. Ogni what-if è chiaramente etichettato nell'interfaccia
          così non si confonde mai con la simulazione base.
        </p>
        <div className="hiw-callout hiw-callout--amber">
          L'Italia nel Girone B è ovviamente il what-if principale.
          L'unico motivo per cui questo sito esiste.
        </div>
      </section>

      <div className="hiw-divider" />

      {/* ── Sezione 4: Limiti ── */}
      <section className="hiw-section">
        <div className="hiw-section-label">04</div>
        <h2 className="hiw-h2">Cosa questo sito non è</h2>
        <p className="hiw-p">
          MonteCalcio <strong>non è un sito di pronostici in tempo reale</strong>.
          I dati sono snapshot a date precise — l'Elo di giugno 2026, i valori di mercato
          di giugno 2026, il sorteggio ufficiale del 5 dicembre 2025.
          Non si aggiornano in automatico. Non consideriamo infortuni dell'ultimo minuto,
          scelte tattiche dell'allenatore, o il fatto che l'Argentina abbia dormito male.
        </p>
        <p className="hiw-p">
          L'allocazione delle migliori terze nel tabellone segue un algoritmo deterministico
          che rispetta i vincoli FIFA ma non implementa l'esatta Annex C (495 combinazioni) —
          l'effetto sulle probabilità aggregate è trascurabile.
          Il modello bayesiano usa <em>rho</em> (correzione Dixon-Coles) stimato
          semi-empiricamente, non dentro il processo MCMC.
        </p>
        <p className="hiw-p">
          I dati usati sono tutto ciò che ho trovato di utile e accessibile online —
          Elo, valori di mercato, risultati storici, scontri diretti — pesati come meglio
          ho ritenuto sulla base della letteratura e della calibrazione empirica.
          I pesi sono modificabili e il modello è espandibile.
          Se ne sai più di me di simulazioni calcistiche e vuoi contribuire a renderlo
          più preciso, <strong>scrivimi</strong> —{' '}
          <a className="hiw-contact-link" href="https://www.linkedin.com/in/salvatore-pappalardo98/" target="_blank" rel="noopener noreferrer">contattami qui</a>.
          Sarei felicissimo di confrontarmi e migliorare il modello insieme.
        </p>
        <p className="hiw-p">
          È un progetto personale nato dalla frustrazione dell'ennesimo Mondiale mancato dell'Italia.
          Se lo usate per scommesse, i vostri problemi sono ben altri.
        </p>
        <div className="hiw-callout hiw-callout--muted">
          L'Italia non era qualificata. Questa è l'unica cosa su cui il modello non può fare niente.
        </div>
      </section>

    </article>
  );
}
