/**
 * HowItWorks — pagina-blog "Come funziona MonteCalcio".
 * Layout: articolo scrollabile, niente card-grid, niente pills.
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

function Source({ children }: { children: React.ReactNode; }) {
  const { t } = useT();
  return (
    <div className="hiw-source">
      <span className="hiw-source-tag">{t('hiw.source')}</span>
      <span className="hiw-source-text">{children}</span>
    </div>
  );
}

/* ── Componente principale ───────────────────────────────────────── */

export function HowItWorks({ modulators, onOpenAdmin, teams = [], params = null, h2h = new Map(), teamStats = new Map() }: Props) {
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

      {/* ── Divider ── */}
      <div className="hiw-divider" />

      {/* ── Sezione 1: La simulazione ── */}
      <section className="hiw-section">
        <div className="hiw-section-label">01</div>
        <h2 className="hiw-h2">{t('hiw.s1.h2')}</h2>
        <p className="hiw-p">{t('hiw.s1.p1')}</p>
        <p className="hiw-p">{t('hiw.s1.p2')}</p>
        <div className="hiw-callout">{t('hiw.s1.callout')}</div>
        <p className="hiw-p">{t('hiw.s1.p3')}</p>
      </section>

      <div className="hiw-divider" />

      {/* ── Sezione 2: Punteggio Forza ── */}
      <section className="hiw-section">
        <div className="hiw-section-label">02</div>
        <h2 className="hiw-h2">{t('hiw.s2.h2')}</h2>
        <p className="hiw-p">{t('hiw.s2.p1')}</p>

        {/* Indicatori */}
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

        {/* Torta */}
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

      {/* ── Sezione 3: What-if ── */}
      <section className="hiw-section">
        <div className="hiw-section-label">03</div>
        <h2 className="hiw-h2">{t('hiw.s3.h2')}</h2>
        <p className="hiw-p">{t('hiw.s3.p1')}</p>
        <p className="hiw-p">{t('hiw.s3.p2')}</p>
        <div className="hiw-callout hiw-callout--amber">{t('hiw.s3.callout')}</div>
      </section>

      <div className="hiw-divider" />

      {/* ── Sezione 4: Limiti ── */}
      <section className="hiw-section">
        <div className="hiw-section-label">04</div>
        <h2 className="hiw-h2">{t('hiw.s4.h2')}</h2>
        <p className="hiw-p">{t('hiw.s4.p1')}</p>
        <p className="hiw-p">{t('hiw.s4.p2')}</p>
        <p className="hiw-p">
          {t('hiw.s4.p3.pre')}
          <a className="hiw-contact-link" href="https://www.linkedin.com/in/salvatore-pappalardo98/" target="_blank" rel="noopener noreferrer">{t('hiw.s4.p3.link')}</a>
          {t('hiw.s4.p3.post')}
        </p>
        <p className="hiw-p">{t('hiw.s4.p4')}</p>
        <div className="hiw-callout hiw-callout--muted">{t('hiw.s4.callout')}</div>
      </section>

    </article>
  );
}
