/**
 * SimLaunchOverlay — caricamento scenico mostrato nell'attimo tra "lancia la
 * simulazione" e la partenza del cinema (l'attesa che il worker produca la
 * sample run). Tono ironico, e quando l'Italia è in campo le frasi cambiano.
 *
 * Il progresso è scenico (animato nel tempo), non legato al worker reale: la
 * simulazione vera dura pochi decimi di secondo, ma una micro-attesa "epica"
 * rende l'ingresso più gustoso. Quando la sample è pronta, App smonta l'overlay.
 */
import { useEffect, useState } from 'react';

interface Props {
  italyActive: boolean;
  favoriteName?: string | null;
  numRuns?: number;
}

const MESSAGES_ITALY = [
  "Convinco la Bosnia a farci giocare al posto loro…",
  "Spiego alla FIFA che era solo un errore di stampa…",
  "Rimetto gli Azzurri nel Girone B…",
  "Tre play-off persi? Una fase di costruzione…",
  "Ok, ci siamo. Forza Italia. 🇮🇹",
];
const MESSAGES_REAL = [
  "Sorteggio i gironi…",
  "Distribuisco le 48 nazionali…",
  "Lancio 100.000 mondiali paralleli…",
  "Conto le migliori terze…",
  "Verso la finale…",
];

const TOTAL_MS = 5200; // durata scenica complessiva (~1s per frase, leggibile)
const NUM_RUNS_DEFAULT = 100000;

export function SimLaunchOverlay({ italyActive, favoriteName, numRuns = NUM_RUNS_DEFAULT }: Props) {
  const messages = italyActive ? MESSAGES_ITALY : MESSAGES_REAL;
  const [progress, setProgress] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);

  // Barra di progresso scenica: avanza fino a ~97% in TOTAL_MS (l'ultimo balzo
  // al 100% lo dà lo smontaggio quando il cinema parte).
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / TOTAL_MS);
      // ease-out per un finale che rallenta (più "vivo")
      const eased = 1 - Math.pow(1 - t, 2.2);
      setProgress(eased * 0.97);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Rotazione messaggi sincronizzata sulla durata totale.
  useEffect(() => {
    const id = setInterval(() => {
      setMsgIdx((i) => Math.min(messages.length - 1, i + 1));
    }, TOTAL_MS / messages.length);
    return () => clearInterval(id);
  }, [messages.length]);

  const pct = Math.round(progress * 100);
  const runsDone = Math.round(progress * numRuns);

  return (
    <div className={`simlaunch ${italyActive ? 'simlaunch--italy' : ''}`}>
      <div className="simlaunch-bg" aria-hidden />
      <div className="simlaunch-inner">
        {/* Pallone che rimbalza + ombra */}
        <div className="simlaunch-pitch" aria-hidden>
          {italyActive
            ? <span className="fi fi-it simlaunch-ball-flag" />
            : <span className="simlaunch-ball">⚽</span>}
          <span className="simlaunch-shadow" />
        </div>

        <h2 className="simlaunch-title">
          {italyActive ? 'Si torna in campo.' : 'Si gioca.'}
        </h2>
        <p className="simlaunch-msg" key={msgIdx}>{messages[msgIdx]}</p>

        <div className="simlaunch-bar">
          <div className="simlaunch-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="simlaunch-stats">
          <span className="simlaunch-pct">{pct}%</span>
          <span className="simlaunch-runs">
            {runsDone.toLocaleString('it-IT')} / {numRuns.toLocaleString('it-IT')} mondiali simulati
          </span>
        </div>

        {favoriteName && (
          <p className="simlaunch-fav">Occhi puntati su <strong>{favoriteName}</strong> ♥</p>
        )}
      </div>
    </div>
  );
}
