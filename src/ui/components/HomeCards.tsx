/**
 * HomeCards — the home Bento grid. Each card opens a full-screen view.
 * Layout: results (lg) + simulation (md) on top, then italy (lg) + teams (md)
 * below. A small "How it works" card at the bottom.
 */
import { useState, useCallback } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import { useT } from '../../i18n';

export type CardId = 'sim' | 'results' | 'matchup' | 'teams' | 'italy' | 'howto';

interface CardDef {
  id: CardId;
  icon: ReactNode;
  title: string;
  blurb: string;
  theme: 'amber' | 'green' | 'cyan' | 'violet' | 'italy' | 'slate';
  size?: 'lg' | 'md' | 'sm';
  stat?: ReactNode;
  bigStat?: ReactNode;
  bgImage?: string;
  /** Slideshow component to show as an animated background (replaces bgImage). */
  slideshow?: ReactNode;
}

interface GridProps {
  cards: CardDef[];
  onOpen: (id: CardId) => void;
}

/* ── SVG Icons ── */
const IconBarChart = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="18" y="3" width="4" height="18"/><rect x="10" y="8" width="4" height="13"/><rect x="2" y="13" width="4" height="8"/>
  </svg>
);
const IconTrophy = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
  </svg>
);

const IconSwords = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" y1="14" x2="9" y2="18"/><line x1="7" y1="21" x2="9" y2="19"/>
  </svg>
);
const IconGlobe = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);
const IconInfo = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>
);

export const CARD_ICONS: Record<CardId, ReactNode> = {
  results: <IconBarChart />,
  sim:     <IconTrophy />,
  italy:   <span className="fi fi-it" style={{ width: 28, height: 20, borderRadius: 3, display: 'inline-block' }} />,
  matchup: <IconSwords />,
  teams:   <IconGlobe />,
  howto:   <IconInfo />,
};

export function HomeCardGrid({ cards, onOpen }: GridProps) {
  return (
    <div className="bento">
      {cards.map((c) => {
        const hasMedia = !!(c.slideshow || c.bgImage);
        return (
          <button
            key={c.id}
            className={`bento-card hc--${c.theme} bento--${c.size ?? 'md'}${c.bgImage ? ' bento--photo' : ''}${c.slideshow ? ' bento--slideshow' : ''}`}
            onClick={() => onOpen(c.id)}
            style={c.bgImage && !c.slideshow ? { '--bento-bg': `url(${c.bgImage})` } as CSSProperties : undefined}
          >
            {/* React slideshow (takes priority over bgImage) */}
            {c.slideshow && c.slideshow}

            {/* Text content — z-index above the slideshow */}
            <span className={`bento-icon${hasMedia ? ' bento-icon--light' : ''}`}>{c.icon}</span>
            <span className={`bento-title${hasMedia ? ' bento-title--light' : ''}`}>{c.title}</span>
            <span className={`bento-blurb${hasMedia ? ' bento-blurb--light' : ''}`}>{c.blurb}</span>
            {c.bigStat && <span className="bento-bigstat">{c.bigStat}</span>}
            <span className="bento-foot">
              {c.stat && <span className="bento-stat">{c.stat}</span>}
            </span>
            <span className="bento-corner-arrow" aria-hidden>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
              </svg>
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface OverlayProps {
  title: string;
  icon: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export function CardOverlay({ title, icon, onClose, children }: OverlayProps) {
  const { t } = useT();
  const [leaving, setLeaving] = useState(false);

  const handleClose = useCallback(() => {
    setLeaving(true);
    // Wait for the exit animation to finish before unmounting.
    setTimeout(() => onClose(), 340);
  }, [onClose]);

  return (
    <div className={`hc-overlay ${leaving ? 'hc-overlay--leaving' : ''}`}>
      <div className="hc-overlay-bar">
        <button className="hc-back" onClick={handleClose}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          {t('common.back')}
        </button>
        <h2 className="hc-overlay-title">
          <span className="hc-overlay-icon">{icon}</span>
          <span className="hc-overlay-title-text">{title}</span>
        </h2>
      </div>
      <div className="hc-overlay-body">{children}</div>
    </div>
  );
}

export type { CardDef };
