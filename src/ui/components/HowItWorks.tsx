/**
 * HowItWorks — two split panels: About The Creator + About The Project.
 * Each panel reuses the same hiw-article layout/design.
 */

import { useMemo } from 'react';
import type { ModulatorConfig, Team, ModelParams, H2HRecord, TeamStats } from '../../engine/types';
import { config } from '../../config';
import { computeStrengthBreakdown } from '../../engine/strengthScore';
import { StrengthPie } from './StrengthPie';
import { useT } from '../../i18n';

interface Props {
  modulators?: ModulatorConfig;
  onOpenAdmin?: () => void;
  teams?: Team[];
  params?: ModelParams | null;
  h2h?: Map<string, H2HRecord>;
  teamStats?: Map<string, TeamStats>;
}

function Source({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  return (
    <div className="hiw-source">
      <span className="hiw-source-tag">{t('hiw.source')}</span>
      <span className="hiw-source-text">{children}</span>
    </div>
  );
}

/* ── About The Creator ──────────────────────────────────────────────── */

function AboutCreator() {
  const { t } = useT();
  return (
    <article className="hiw-article">

      <header className="hiw-hero hiw-hero--nodeck">
        <p className="hiw-eyebrow">{t('hiw.creator.eyebrow')}</p>
        <h1 className="hiw-h1">{t('hiw.creator.h1')}</h1>
      </header>

      <div className="hiw-divider" />

      <section className="hiw-section" id="hiw-creator">
        <div className="hiw-section-label">00</div>
        <p className="hiw-p"><strong>{t('hiw.creator.intro')}</strong></p>
        <p className="hiw-p">{t('hiw.creator.p1')}</p>
        <p className="hiw-p">{t('hiw.creator.p2')}</p>
        <p className="hiw-p">{t('hiw.creator.p3')}</p>
        <p className="hiw-p">{t('hiw.creator.p4')}</p>

        <div className="hiw-creator-buttons">
          <a
            className="hiw-creator-btn hiw-creator-btn--linkedin"
            href="https://www.linkedin.com/in/salvatore-pappalardo98/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg className="hiw-creator-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            {t('hiw.creator.linkedin')}
          </a>
          <a
            className="hiw-creator-btn hiw-creator-btn--github"
            href="https://github.com/sPappalard"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg className="hiw-creator-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
            </svg>
            {t('hiw.creator.github')}
          </a>
          <a
            className="hiw-creator-btn hiw-creator-btn--email"
            href="mailto:salvo.pappalardo.98.27@gmail.com"
          >
            <svg className="hiw-creator-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
            {t('hiw.creator.contact')}
          </a>
        </div>
      </section>

    </article>
  );
}

/* ── About The Project ──────────────────────────────────────────────── */

function AboutProject({ modulators, onOpenAdmin, teams = [], params = null, h2h = new Map(), teamStats = new Map() }: Props) {
  const { t } = useT();
  const mods = modulators ?? config.modulators;

  const breakdown = useMemo(
    () => computeStrengthBreakdown({ teams, params, h2h, teamStats, modulators: mods }),
    [teams, params, h2h, teamStats, mods],
  );

  return (
    <article className="hiw-article">

      {/* ── Hero ── */}
      <header className="hiw-hero">
        <p className="hiw-eyebrow">{t('hiw.eyebrow')}</p>
        <h1 className="hiw-h1">
          {t('hiw.h1').split('. ').filter(Boolean).map((s, i, arr) => (
            <span key={i}>{s}{i < arr.length - 1 ? '.' : ''}<br /></span>
          ))}
        </h1>
        <p className="hiw-deck">{t('hiw.deck')}</p>
      </header>

      <div className="hiw-divider" />

      {/* ── Story ── */}
      <section className="hiw-section">
        <div className="hiw-section-label">{t('hiw.story.label')}</div>
        <h2 className="hiw-h2">{t('hiw.story.h2')}</h2>
        <p className="hiw-p"><em>{t('hiw.story.q')}</em></p>
        <p className="hiw-p">{t('hiw.story.p1')}</p>
        <p className="hiw-p">{t('hiw.story.p2')}</p>
        <p className="hiw-p">{t('hiw.story.p3')}</p>
        <div className="hiw-callout hiw-callout--amber">{t('hiw.story.callout')}</div>
      </section>

      <div className="hiw-divider" />

      {/* ── What can you do ── */}
      <section className="hiw-section">
        <div className="hiw-section-label">{t('hiw.what.label')}</div>
        <h2 className="hiw-h2">{t('hiw.what.h2')}</h2>
        <p className="hiw-p"><strong>{t('hiw.what.intro')}</strong></p>

        <div className="hiw-indicators">
          <div className="hiw-indicator">
            <div className="hiw-ind-head">
              <span className="hiw-ind-dot" style={{ background: '#2fe08a' }} />
              <strong>{t('hiw.what.realistic.title')}</strong>
            </div>
            <p>{t('hiw.what.realistic.body')}</p>
          </div>
          <div className="hiw-indicator">
            <div className="hiw-ind-head">
              <span className="hiw-ind-dot" style={{ background: '#60a5fa' }} />
              <strong>{t('hiw.what.italy.title')}</strong>
            </div>
            <p>{t('hiw.what.italy.body')}</p>
          </div>
          <div className="hiw-indicator">
            <div className="hiw-ind-head">
              <span className="hiw-ind-dot" style={{ background: '#ffc233' }} />
              <strong>{t('hiw.what.whatif.title')}</strong>
            </div>
            <p>{t('hiw.what.whatif.body')}</p>
          </div>
          <div className="hiw-indicator">
            <div className="hiw-ind-head">
              <span className="hiw-ind-dot" style={{ background: '#a78bfa' }} />
              <strong>{t('hiw.what.compare.title')}</strong>
            </div>
            <p>{t('hiw.what.compare.body')}</p>
          </div>
        </div>
      </section>

      <div className="hiw-divider" />

      {/* ── Section 1: The simulation ── */}
      <section className="hiw-section">
        <div className="hiw-section-label">03</div>
        <h2 className="hiw-h2">{t('hiw.s1.h2')}</h2>
        <p className="hiw-p">{t('hiw.s1.p1')}</p>
        <p className="hiw-p">{t('hiw.s1.p2')}</p>
        <div className="hiw-callout">{t('hiw.s1.callout')}</div>
        <p className="hiw-p">{t('hiw.s1.p3')}</p>
      </section>

      <div className="hiw-divider" />

      {/* ── Section 2: Strength Score ── */}
      <section className="hiw-section">
        <div className="hiw-section-label">04</div>
        <h2 className="hiw-h2">{t('hiw.s2.h2')}</h2>
        <p className="hiw-p">{t('hiw.s2.p1')}</p>

        <div className="hiw-indicators">
          <div className="hiw-indicator">
            <div className="hiw-ind-head">
              <span className="hiw-ind-dot" style={{ background: '#2fe08a' }} />
              <strong>{t('hiw.ind.elo.title')}</strong>
            </div>
            <p>{t('hiw.ind.elo.body')}</p>
            <Source>{t('hiw.ind.elo.source')}</Source>
          </div>
          <div className="hiw-indicator">
            <div className="hiw-ind-head">
              <span className="hiw-ind-dot" style={{ background: '#60a5fa' }} />
              <strong>{t('hiw.ind.atkdef.title')}</strong>
            </div>
            <p>{t('hiw.ind.atkdef.body')}</p>
            <Source>{t('hiw.ind.atkdef.source')}</Source>
          </div>
          <div className="hiw-indicator">
            <div className="hiw-ind-head">
              <span className="hiw-ind-dot" style={{ background: '#ffc233' }} />
              <strong>{t('hiw.ind.form.title')}</strong>
            </div>
            <p>{t('hiw.ind.form.body')}</p>
            <Source>{t('hiw.ind.form.source')}</Source>
          </div>
          <div className="hiw-indicator">
            <div className="hiw-ind-head">
              <span className="hiw-ind-dot" style={{ background: '#a78bfa' }} />
              <strong>{t('hiw.ind.ko.title')}</strong>
            </div>
            <p>{t('hiw.ind.ko.body')}</p>
            <Source>{t('hiw.ind.ko.source')}</Source>
          </div>
          <div className="hiw-indicator">
            <div className="hiw-ind-head">
              <span className="hiw-ind-dot" style={{ background: '#18d6ec' }} />
              <strong>{t('hiw.ind.value.title')}</strong>
            </div>
            <p>{t('hiw.ind.value.body')}</p>
            <Source>{t('hiw.ind.value.source')}</Source>
            <div className="hiw-postilla">{t('hiw.ind.value.note')}</div>
          </div>
          <div className="hiw-indicator">
            <div className="hiw-ind-head">
              <span className="hiw-ind-dot" style={{ background: '#f87171' }} />
              <strong>{t('hiw.ind.h2h.title')}</strong>
            </div>
            <p>{t('hiw.ind.h2h.body')}</p>
            <Source>{t('hiw.ind.h2h.source')}</Source>
          </div>
        </div>

        {/* Pie */}
        <div className="hiw-pie-block">
          <h3 className="hiw-h3">{t('hiw.pie.title')}</h3>
          <p className="hiw-p hiw-p--sm">
            {t('hiw.pie.body.pre')}
            {onOpenAdmin
              ? <button className="hiw-link-btn" onClick={onOpenAdmin}>{t('hiw.pie.body.link')}</button>
              : <span>{t('hiw.pie.body.linkPlain')}</span>
            }{t('hiw.pie.body.post')}
          </p>
          <StrengthPie components={breakdown} />
        </div>
      </section>

      <div className="hiw-divider" />

      {/* ── What-if ── */}
      <section className="hiw-section">
        <div className="hiw-section-label">05</div>
        <h2 className="hiw-h2">{t('hiw.s3.h2')}</h2>
        <p className="hiw-p">{t('hiw.s3.p1')}</p>
        <p className="hiw-p">{t('hiw.s3.p2')}</p>
        <div className="hiw-callout hiw-callout--amber">{t('hiw.s3.callout')}</div>
      </section>

      <div className="hiw-divider" />

      {/* ── Limitations ── */}
      <section className="hiw-section">
        <div className="hiw-section-label">06</div>
        <h2 className="hiw-h2">{t('hiw.s4.h2')}</h2>
        <p className="hiw-p">{t('hiw.s4.p1')}</p>
        <p className="hiw-p">{t('hiw.s4.p2')}</p>
        <p className="hiw-p">
          {t('hiw.s4.p3.pre')}
          <a className="hiw-contact-link" href="#hiw-creator">{t('hiw.s4.p3.link')}</a>
          {t('hiw.s4.p3.post')}
        </p>
        <p className="hiw-p">{t('hiw.s4.p4')}</p>
        <div className="hiw-callout hiw-callout--muted">{t('hiw.s4.callout')}</div>
      </section>

      <div className="hiw-divider" />

      {/* ── Disclaimer ── */}
      <section className="hiw-section">
        <div className="hiw-section-label">{t('hiw.disclaimer.label')}</div>
        <h2 className="hiw-h2">{t('hiw.disclaimer.h2')}</h2>
        <p className="hiw-p">{t('hiw.disclaimer.p1')}</p>
        <p className="hiw-p">{t('hiw.disclaimer.p2')}</p>
        <p className="hiw-p">{t('hiw.disclaimer.p3')}</p>
      </section>

      <div className="hiw-divider" />

      {/* ── Privacy ── */}
      <section className="hiw-section">
        <div className="hiw-section-label">{t('hiw.privacy.label')}</div>
        <h2 className="hiw-h2">{t('hiw.privacy.h2')}</h2>
        <p className="hiw-p">{t('hiw.privacy.p1')}</p>
      </section>

    </article>
  );
}

/* ── Main wrapper — vertical layout (creator on top, project below) ── */

export function HowItWorks(props: Props) {
  return (
    <div className="hiw-stack">
      <div className="hiw-stack-pane">
        <AboutCreator />
      </div>
      <div className="hiw-stack-divider" aria-hidden />
      <div className="hiw-stack-pane">
        <AboutProject {...props} />
      </div>
    </div>
  );
}
