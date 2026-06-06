/**
 * ItalySlideshow — photo slideshow for the Italy focus bento card.
 * Loads files from /images/italy/manifest.json.
 * Each photo lasts SLIDE_DURATION ms with a Ken Burns effect (randomized slow
 * zoom) and a crossfade between photos.
 */
import { useEffect, useRef, useState } from 'react';

const SLIDE_DURATION = 12000; // ms per photo
const FADE_DURATION  = 1200;  // ms crossfade

// Ken Burns variants: each photo gets a different CSS animation.
const KB_VARIANTS = [
  'kb-zoom-in-tl',
  'kb-zoom-in-tr',
  'kb-zoom-in-bl',
  'kb-zoom-out-c',
  'kb-zoom-in-c',
];

interface SlideshowProps {
  /** Dark overlay on the photo (to keep text above it readable). */
  overlay?: boolean;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nextRandom(current: number, total: number): number {
  if (total <= 1) return 0;
  let next: number;
  do { next = Math.floor(Math.random() * total); } while (next === current);
  return next;
}

export function ItalySlideshow({ overlay = true }: SlideshowProps) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [kbClass, setKbClass] = useState(KB_VARIANTS[0]);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Load the manifest, shuffle immediately.
  useEffect(() => {
    fetch('/images/italy/manifest.json')
      .then(r => r.json())
      .then((list: string[]) => {
        if (Array.isArray(list) && list.length > 0) {
          const shuffled = shuffle(list.map(f => `/images/italy/${f}`));
          setPhotos(shuffled);
          setKbClass(KB_VARIANTS[Math.floor(Math.random() * KB_VARIANTS.length)]);
        }
      })
      .catch(() => {}); // silent: no photos → no slideshow
  }, []);

  // Advance slides randomly.
  useEffect(() => {
    if (photos.length < 2) return;
    let fadeTimer = 0; // inner setTimeout: must also be cancelled on unmount
    timerRef.current = window.setInterval(() => {
      setFading(true);
      fadeTimer = window.setTimeout(() => {
        setCurrent(c => {
          const next = nextRandom(c, photos.length);
          setKbClass(KB_VARIANTS[Math.floor(Math.random() * KB_VARIANTS.length)]);
          return next;
        });
        setFading(false);
      }, FADE_DURATION);
    }, SLIDE_DURATION);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, [photos]);

  if (photos.length === 0) return null;

  return (
    <div className="its-root" aria-hidden>
      <div
        className={`its-slide ${fading ? 'its-fade-out' : 'its-fade-in'}`}
        key={current}
      >
        <div
          className={`its-img ${kbClass}`}
          style={{ backgroundImage: `url(${photos[current]})` }}
        />
      </div>
      {overlay && <div className="its-overlay" />}
    </div>
  );
}
