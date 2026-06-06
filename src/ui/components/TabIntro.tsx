import { useState } from 'react';
import { useT } from '../../i18n';

interface Props {
  icon: string;
  title: string;
  subtitle: string;
  hints?: string[];
}

/**
 * TabIntro — minimal section header. Inline title + subtitle.
 * Optional hints are hidden behind an (i) icon to save space.
 */
export function TabIntro({ title, subtitle, hints }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  return (
    <div className="ti-bar">
      <div className="ti-main">
        <span className="ti-title">{title}</span>
        <span className="ti-sub">{subtitle}</span>
      </div>
      {hints && hints.length > 0 && (
        <div className="ti-info-wrap">
          <button
            className={`ti-info-btn ${open ? 'on' : ''}`}
            onClick={() => setOpen(v => !v)}
            aria-label={t('tabintro.info.aria')}
            title={t('tabintro.info.title')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </button>
          {open && (
            <div className="ti-tooltip">
              {hints.map((h, i) => (
                <span key={i} className="ti-hint">{h}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
