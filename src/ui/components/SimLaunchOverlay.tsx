/**
 * SimLaunchOverlay — staged loading shown in the moment between "launch the
 * simulation" and the cinema starting (waiting for the worker to produce the
 * sample run). Tongue-in-cheek tone; the lines change when Italy is in play.
 *
 * Progress is cosmetic (time-animated), not tied to the real worker: the actual
 * simulation takes a few tenths of a second, but a short "epic" wait makes the
 * entrance feel better. Once the sample is ready, App unmounts the overlay.
 */
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';

interface Props {
  italyActive: boolean;
  favoriteName?: string | null;
  numRuns?: number;
}

const TOTAL_MS = 10000;
const NUM_RUNS_DEFAULT = 100000;

export function SimLaunchOverlay({ italyActive, favoriteName, numRuns = NUM_RUNS_DEFAULT }: Props) {
  const { t, tList, nf } = useT();
  const messages = italyActive ? tList('launch.messages.italy') : tList('launch.messages.real');
  const [progress, setProgress] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);

  // Cosmetic progress bar: advances to ~97% over TOTAL_MS (the final jump to
  // 100% comes from the unmount when the cinema starts).
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / TOTAL_MS);
      // ease-out so it slows down near the end (feels more "alive")
      const eased = 1 - Math.pow(1 - t, 2.2);
      setProgress(eased * 0.97);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Message rotation synced to the total duration.
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
        {/* Bouncing ball + shadow */}
        <div className="simlaunch-pitch" aria-hidden>
          {italyActive
            ? <span className="fi fi-it simlaunch-ball-flag" />
            : <span className="simlaunch-ball">⚽</span>}
          <span className="simlaunch-shadow" />
        </div>

        <h2 className="simlaunch-title">
          {italyActive ? t('launch.title.italy') : t('launch.title.real')}
        </h2>
        <p className="simlaunch-msg" key={msgIdx}>{messages[msgIdx]}</p>

        <div className="simlaunch-bar">
          <div className="simlaunch-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="simlaunch-stats">
          <span className="simlaunch-pct">{pct}%</span>
          <span className="simlaunch-runs">
            {t('launch.runs', { done: nf(runsDone), total: nf(numRuns) })}
          </span>
        </div>

        {favoriteName && (
          <p className="simlaunch-fav">{t('launch.fav', { name: favoriteName })}</p>
        )}
      </div>
    </div>
  );
}
