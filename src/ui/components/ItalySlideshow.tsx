/**
 * ItalySlideshow — slideshow fotografico per la card bento Focus Italia.
 * Carica i file da /images/italy/manifest.json.
 * Ogni foto dura SLIDE_DURATION ms con effetto Ken Burns (zoom lento randomizzato)
 * e transizione a dissolvenza tra una foto e l'altra.
 */
import { useEffect, useRef, useState } from 'react';

const SLIDE_DURATION = 12000; // ms per foto
const FADE_DURATION  = 1200;  // ms dissolvenza

// Varianti Ken Burns: ogni foto ha un'animazione CSS diversa
const KB_VARIANTS = [
  'kb-zoom-in-tl',
  'kb-zoom-in-tr',
  'kb-zoom-in-bl',
  'kb-zoom-out-c',
  'kb-zoom-in-c',
];

interface SlideshowProps {
  /** Overlay scuro sulla foto (per rendere leggibile il testo sopra). */
  overlay?: boolean;
}

export function ItalySlideshow({ overlay = true }: SlideshowProps) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Carica il manifest una volta sola
  useEffect(() => {
    fetch('/images/italy/manifest.json')
      .then(r => r.json())
      .then((list: string[]) => {
        if (Array.isArray(list) && list.length > 0) {
          setPhotos(list.map(f => `/images/italy/${f}`));
        }
      })
      .catch(() => {}); // silenzioso: nessuna foto → nessun slideshow
  }, []);

  // Avanza slide
  useEffect(() => {
    if (photos.length < 2) return;
    timerRef.current = window.setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setCurrent(c => (c + 1) % photos.length);
        setFading(false);
      }, FADE_DURATION);
    }, SLIDE_DURATION);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [photos]);

  if (photos.length === 0) return null;

  const kbClass = KB_VARIANTS[current % KB_VARIANTS.length];

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
