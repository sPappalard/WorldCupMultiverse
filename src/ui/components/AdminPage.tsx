/**
 * Admin page — two levels.
 *
 * SIMPLE (default): a few conceptual "levers" with Low/Medium/High, for users
 * who aren't into data. A one-time notice on open reassures that everything is
 * already calibrated. At the bottom, "Advanced options" (with confirm) unlocks…
 *
 * ADVANCED: the full technical panel (coefficient sliders, % effects, KO mix,
 * strength ranking), for users comfortable with data.
 */

import { useState, useCallback, useMemo } from 'react';
import type { ModulatorConfig, Team, ModelParams, H2HRecord, TeamStats } from '../../engine/types';
import { config } from '../../config';
import { computeStrengthBreakdown } from '../../engine/strengthScore';
import { StrengthPie } from './StrengthPie';
import { useT } from '../../i18n';

interface Props {
  modulators: ModulatorConfig;
  onChange: (m: ModulatorConfig) => void;
  /** Apply the weights AND re-run the simulation (closes the panel). */
  onApplyAndSimulate?: (m: ModulatorConfig) => void;
  /** Apply the current weights and open the strength ranking in the Teams page. */
  onGenerateRanking?: (m: ModulatorConfig) => void;
  /** Data to decompose the Strength Score in the pie chart. */
  teams: Team[];
  params: ModelParams | null;
  h2h: Map<string, H2HRecord>;
  teamStats: Map<string, TeamStats>;
}

/** Panel sections, for anchor navigation. */
const ADM_SECTION_IDS = [
  { id: 'adm-sec-lambda', key: 'admin.nav.lambda' },
  { id: 'adm-sec-h2h',    key: 'admin.nav.h2h' },
  { id: 'adm-sec-home',   key: 'admin.nav.home' },
  { id: 'adm-sec-ko',     key: 'admin.nav.ko' },
  { id: 'adm-sec-whatif', key: 'admin.nav.whatif' },
  { id: 'adm-sec-ranking',key: 'admin.nav.ranking' },
];

/** Convert a log-lambda coefficient into a goal-change percentage. */
function toGolPct(coeff: number, maxAdj: number): string {
  const pct = (Math.exp(maxAdj * coeff) - 1) * 100;
  return `±${pct.toFixed(1)}%`;
}

const DEFAULTS: ModulatorConfig = {
  formCoeff: config.modulators.formCoeff,
  squadValueCoeff: config.modulators.squadValueCoeff,
  eloCoeff: config.modulators.eloCoeff,
  koExperienceCoeff: config.modulators.koExperienceCoeff,
  koMatchCoeff: config.modulators.koMatchCoeff,
  koKnockoutWeight: config.modulators.koKnockoutWeight,
  koHistoryWeight: config.modulators.koHistoryWeight,
  homeAdvBoost: config.modulators.homeAdvBoost,
  h2hMaxBoost: config.modulators.h2hMaxBoost,
  lambdaShrink: config.modulators.lambdaShrink,
  whatIf: { ...config.modulators.whatIf },
};

interface SliderProps {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  effectLabel: string;
  effectValue: string;
  color: string;
  onChange: (v: number) => void;
  onReset: () => void;
  defaultValue: number;
  resetTitle: string;
  resetLabel: string;
  coeffLabel: string;
  /** Override for the left-hand text (default: "coeff: X.XXX"). */
  valueLabel?: React.ReactNode;
}

function ModSlider({
  label, description, value, min, max, step,
  effectLabel, effectValue, color, onChange, onReset, defaultValue,
  resetTitle, resetLabel, coeffLabel, valueLabel,
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const isModified = Math.abs(value - defaultValue) > 1e-6;

  return (
    <div className="adm-slider-row">
      <div className="adm-slider-header">
        <span className="adm-slider-label">
          <span className="adm-slider-dot" style={{ background: color }} aria-hidden />
          {label}
        </span>
        {isModified && (
          <button className="adm-reset-btn" onClick={onReset} title={resetTitle}>
            {resetLabel}
          </button>
        )}
      </div>
      <p className="adm-slider-desc">{description}</p>
      <div className="adm-slider-track">
        <input
          type="range"
          min={min} max={max} step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ '--pct': `${pct}%`, '--color': color } as React.CSSProperties}
          className="adm-range"
        />
        <div className="adm-slider-vals">
          <span className="adm-val-current" style={{ color }}>
            {valueLabel ?? <>{coeffLabel} <strong>{value.toFixed(3)}</strong></>}
          </span>
          <span className="adm-val-effect">
            {effectLabel}: <strong>{effectValue}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Show a concrete example match with the current modulators. */
function LiveExample({ mod }: { mod: ModulatorConfig }) {
  const { t } = useT();
  const formBoostHot  = (Math.exp(((85 - 50) / 50) * mod.formCoeff) - 1) * 100;
  const formBoostCold = (Math.exp(((30 - 50) / 50) * mod.formCoeff) - 1) * 100;
  const valueBoostRich = (Math.exp(2.0 * mod.squadValueCoeff) - 1) * 100;
  const valueBoostPoor = (Math.exp(-0.5 * mod.squadValueCoeff) - 1) * 100;
  const eloBoostTop  = (Math.exp((230 / 200) * mod.eloCoeff) - 1) * 100;
  const eloBoostLow  = (Math.exp((-200 / 200) * mod.eloCoeff) - 1) * 100;
  const koEdge = ((72 - 28) / 100) * mod.koExperienceCoeff * 100;
  const homeAdvPct = (Math.exp(mod.homeAdvBoost) - 1) * 100;

  const up = <span className="adm-ex-arrow up" aria-hidden>▲</span>;
  const down = <span className="adm-ex-arrow down" aria-hidden>▼</span>;
  return (
    <div className="adm-example">
      <h3 className="adm-example-title">{t('admin.ex.title')}</h3>
      <div className="adm-example-grid">
        <div className="adm-ex-card">
          <div className="adm-ex-icon">{up}</div>
          <div className="adm-ex-title">{t('admin.ex.formHot.title')}</div>
          <div className="adm-ex-val positive">+{formBoostHot.toFixed(1)}% {t('admin.ex.goals', { v: '' }).replace('% ', '')}</div>
          <div className="adm-ex-sub">{t('admin.ex.formHot.sub')}</div>
        </div>
        <div className="adm-ex-card">
          <div className="adm-ex-icon">{down}</div>
          <div className="adm-ex-title">{t('admin.ex.formCold.title')}</div>
          <div className="adm-ex-val negative">{formBoostCold.toFixed(1)}% {t('admin.ex.goals', { v: '' }).replace('% ', '')}</div>
          <div className="adm-ex-sub">{t('admin.ex.formCold.sub')}</div>
        </div>
        <div className="adm-ex-card">
          <div className="adm-ex-icon">{up}</div>
          <div className="adm-ex-title">{t('admin.ex.rich.title')}</div>
          <div className="adm-ex-val positive">+{valueBoostRich.toFixed(1)}% {t('admin.ex.goals', { v: '' }).replace('% ', '')}</div>
          <div className="adm-ex-sub">{t('admin.ex.rich.sub')}</div>
        </div>
        <div className="adm-ex-card">
          <div className="adm-ex-icon">{down}</div>
          <div className="adm-ex-title">{t('admin.ex.poor.title')}</div>
          <div className="adm-ex-val negative">{valueBoostPoor.toFixed(1)}% {t('admin.ex.goals', { v: '' }).replace('% ', '')}</div>
          <div className="adm-ex-sub">{t('admin.ex.poor.sub')}</div>
        </div>
        <div className="adm-ex-card">
          <div className="adm-ex-icon">{up}</div>
          <div className="adm-ex-title">{t('admin.ex.eloTop.title')}</div>
          <div className="adm-ex-val positive">+{eloBoostTop.toFixed(1)}% {t('admin.ex.goals', { v: '' }).replace('% ', '')}</div>
          <div className="adm-ex-sub">{t('admin.ex.eloTop.sub')}</div>
        </div>
        <div className="adm-ex-card">
          <div className="adm-ex-icon">{down}</div>
          <div className="adm-ex-title">{t('admin.ex.eloLow.title')}</div>
          <div className="adm-ex-val negative">{eloBoostLow.toFixed(1)}% {t('admin.ex.goals', { v: '' }).replace('% ', '')}</div>
          <div className="adm-ex-sub">{t('admin.ex.eloLow.sub')}</div>
        </div>
        <div className="adm-ex-card">
          <div className="adm-ex-icon">{up}</div>
          <div className="adm-ex-title">{t('admin.ex.home.title')}</div>
          <div className="adm-ex-val positive">{t('admin.ex.home.goals', { v: homeAdvPct.toFixed(1) })}</div>
          <div className="adm-ex-sub">{t('admin.ex.home.sub', { v: mod.homeAdvBoost.toFixed(3) })}</div>
        </div>
        <div className="adm-ex-card adm-ex-card--wide">
          <div className="adm-ex-icon">{up}</div>
          <div className="adm-ex-title">{t('admin.ex.ko.title')}</div>
          <div className="adm-ex-val positive">{t('admin.ex.ko.val', { v: koEdge.toFixed(1) })}</div>
          <div className="adm-ex-sub">{t('admin.ex.ko.sub')}</div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   LIVELLO SEMPLICE — poche leve concettuali, niente gergo.
   ════════════════════════════════════════════════════════════════════ */

type LeverLevel = 'low' | 'mid' | 'high';

/* Minimal line-art icons (matching the site style), no decorative emoji. */
const svgProps = {
  width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};
const IconDice = () => (
  <svg {...svgProps}><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1" fill="currentColor"/></svg>
);
const IconHome = () => (
  <svg {...svgProps}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M9 21v-6h6v6"/></svg>
);
const IconPulse = () => (
  <svg {...svgProps}><path d="M3 12h4l2.5-7 5 14 2.5-7H21"/></svg>
);
const IconUserMinus = () => (
  <svg {...svgProps}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
);
const IconBandage = () => (
  <svg {...svgProps}><rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(45 12 12)"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/><circle cx="9.5" cy="12" r="0.6" fill="currentColor"/><circle cx="14.5" cy="12" r="0.6" fill="currentColor"/></svg>
);
const IconSpark = () => (
  <svg {...svgProps}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></svg>
);
const IconCard = () => (
  <svg {...svgProps}><rect x="6" y="3" width="12" height="18" rx="2"/></svg>
);
/* Large icons for the dialogs (32px). */
const IconSliders = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="9" cy="7" r="2.3" fill="var(--surface-1)"/><circle cx="15" cy="12" r="2.3" fill="var(--surface-1)"/><circle cx="8" cy="17" r="2.3" fill="var(--surface-1)"/></svg>
);
const IconAdvanced = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>
);

interface SimpleLeverDef {
  id: string;
  icon: React.ReactNode;
  apply: (m: ModulatorConfig, level: LeverLevel) => ModulatorConfig;
  read: (m: ModulatorConfig) => LeverLevel;
}

const SIMPLE_LEVER_DEFS: SimpleLeverDef[] = [
  {
    id: 'surprises',
    icon: <IconDice />,
    apply: (m, l) => ({ ...m, lambdaShrink: l === 'low' ? 0.15 : l === 'high' ? 0.45 : DEFAULTS.lambdaShrink }),
    read: (m) => (m.lambdaShrink <= 0.22 ? 'low' : m.lambdaShrink >= 0.38 ? 'high' : 'mid'),
  },
  {
    id: 'home',
    icon: <IconHome />,
    apply: (m, l) => ({ ...m, homeAdvBoost: l === 'low' ? 0.08 : l === 'high' ? 0.40 : DEFAULTS.homeAdvBoost }),
    read: (m) => (m.homeAdvBoost <= 0.14 ? 'low' : m.homeAdvBoost >= 0.31 ? 'high' : 'mid'),
  },
  {
    id: 'form',
    icon: <IconPulse />,
    apply: (m, l) => ({ ...m, formCoeff: l === 'low' ? 0.005 : l === 'high' ? 0.08 : DEFAULTS.formCoeff }),
    read: (m) => (m.formCoeff <= 0.012 ? 'low' : m.formCoeff >= 0.05 ? 'high' : 'mid'),
  },
];

/** 3-level selector, segmented-control style. */
function LeverCard({ def, mod, onPick }: {
  def: SimpleLeverDef;
  mod: ModulatorConfig;
  onPick: (level: LeverLevel) => void;
}) {
  const { t } = useT();
  const current = def.read(mod);
  const order: LeverLevel[] = ['low', 'mid', 'high'];
  const id = def.id;
  const title = t(`admin.lever.${id}.title`);
  const blurb = t(`admin.lever.${id}.blurb`);
  const levels = { low: t(`admin.lever.${id}.low`), mid: t(`admin.lever.${id}.mid`), high: t(`admin.lever.${id}.high`) };
  const hint = t(`admin.lever.${id}.hint.${current}`);
  return (
    <div className="lever-card">
      <div className="lever-head">
        <span className="lever-ico">{def.icon}</span>
        <div className="lever-text">
          <span className="lever-title">{title}</span>
          <span className="lever-blurb">{blurb}</span>
        </div>
      </div>
      <div className="lever-seg" role="group" aria-label={title}>
        {order.map((lv) => (
          <button
            key={lv}
            className={`lever-seg-btn ${current === lv ? 'active' : ''}`}
            onClick={() => onPick(lv)}
          >
            {levels[lv]}
          </button>
        ))}
      </div>
      <p className="lever-hint">{hint}</p>
    </div>
  );
}

/** What-if scenario card (intuitive): shows intensity only, no "Elo pts". */
function SimpleWhatIf({ mod, onChange }: { mod: ModulatorConfig; onChange: (m: ModulatorConfig) => void }) {
  const { t } = useT();
  const items: { key: keyof ModulatorConfig['whatIf']; icon: React.ReactNode; labelKey: string; sign: 'neg' | 'pos' }[] = [
    { key: 'missingStar', icon: <IconUserMinus />, labelKey: 'admin.swi.missingStar', sign: 'neg' },
    { key: 'injuries',    icon: <IconBandage />,   labelKey: 'admin.swi.injuries',    sign: 'neg' },
    { key: 'starReturn',  icon: <IconSpark />,     labelKey: 'admin.swi.starReturn',  sign: 'pos' },
    { key: 'suspension',  icon: <IconCard />,      labelKey: 'admin.swi.suspension',  sign: 'neg' },
  ];
  const magToLevel = (v: number) => {
    const a = Math.abs(v);
    return a <= 30 ? 1 : a <= 70 ? 2 : 3;
  };
  const levelToMag = (lv: number, sign: 'neg' | 'pos') => {
    const base = lv === 1 ? 25 : lv === 2 ? 55 : 95;
    return sign === 'neg' ? -base : Math.round(base * 0.55);
  };
  return (
    <div className="swi-grid">
      {items.map((it) => {
        const lv = magToLevel(mod.whatIf[it.key]);
        const label = t(it.labelKey);
        return (
          <div key={it.key} className="swi-card">
            <div className="swi-head">
              <span className="swi-ico">{it.icon}</span>
              <span className="swi-label">{label}</span>
            </div>
            <div className="swi-seg" role="group" aria-label={label}>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  className={`swi-seg-btn ${lv === n ? 'active' : ''}`}
                  onClick={() => onChange({ ...mod, whatIf: { ...mod.whatIf, [it.key]: levelToMag(n, it.sign) } })}
                >
                  {n === 1 ? t('admin.swi.light') : n === 2 ? t('admin.swi.medium') : t('admin.swi.strong')}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AdminPage({ modulators, onChange, onApplyAndSimulate, onGenerateRanking, teams, params, h2h, teamStats }: Props) {
  const { t } = useT();
  const [localMod, setLocalMod] = useState<ModulatorConfig>({ ...modulators });
  const [applied, setApplied] = useState(false);
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
  const [showIntro, setShowIntro] = useState(true);
  const [showUnlock, setShowUnlock] = useState(false);

  const update = useCallback((key: keyof ModulatorConfig, value: number) => {
    setLocalMod((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'koKnockoutWeight') {
        next.koHistoryWeight = Math.round((1 - value) * 100) / 100;
      } else if (key === 'koHistoryWeight') {
        next.koKnockoutWeight = Math.round((1 - value) * 100) / 100;
      }
      return next;
    });
    setApplied(false);
  }, []);

  const updateWhatIf = useCallback((key: keyof ModulatorConfig['whatIf'], value: number) => {
    setLocalMod((prev) => ({ ...prev, whatIf: { ...prev.whatIf, [key]: value } }));
    setApplied(false);
  }, []);

  const resetAll = () => {
    setLocalMod({ ...DEFAULTS });
    setApplied(false);
  };

  const apply = () => {
    onChange(localMod);
    setApplied(true);
  };

  const isModified = JSON.stringify(localMod) !== JSON.stringify(DEFAULTS);

  const breakdown = useMemo(
    () => computeStrengthBreakdown({ teams, params, h2h, teamStats, modulators: localMod }),
    [teams, params, h2h, teamStats, localMod],
  );

  const applyLever = (def: SimpleLeverDef, level: LeverLevel) => {
    setLocalMod(def.apply(localMod, level));
    setApplied(false);
  };
  const applySimpleWhatIf = (next: ModulatorConfig) => {
    setLocalMod(next);
    setApplied(false);
  };
  const applyAndSimulate = () => {
    if (onApplyAndSimulate) onApplyAndSimulate(localMod);
    else { onChange(localMod); setApplied(true); }
  };

  const resetTitle = t('admin.resetTitle');
  const resetLabel = t('admin.reset');
  const coeffLabel = t('admin.coeff');

  // ── Shared dialogs ──
  const dialogs = (
    <>
      {showIntro && (
        <div className="adm-modal-backdrop" onClick={() => setShowIntro(false)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-icon"><IconSliders /></div>
            <h3 className="adm-modal-title">{t('admin.intro.title')}</h3>
            <p className="adm-modal-body">
              {t('admin.intro.body1.pre')}<strong>{t('admin.intro.body1.b1')}</strong>{t('admin.intro.body1.mid')}<strong>{t('admin.intro.body1.b2')}</strong>{t('admin.intro.body1.post')}
            </p>
            <p className="adm-modal-body adm-modal-body--soft">
              {t('admin.intro.body2')}
            </p>
            <button className="adm-modal-cta" onClick={() => setShowIntro(false)}>
              {t('admin.intro.cta')}
            </button>
          </div>
        </div>
      )}

      {showUnlock && (
        <div className="adm-modal-backdrop" onClick={() => setShowUnlock(false)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-icon"><IconAdvanced /></div>
            <h3 className="adm-modal-title">{t('admin.unlock.title')}</h3>
            <p className="adm-modal-body">
              {t('admin.unlock.body1.pre')}<strong>{t('admin.unlock.body1.b1')}</strong>{t('admin.unlock.body1.mid')}<strong>{t('admin.unlock.body1.b2')}</strong>{t('admin.unlock.body1.post')}
            </p>
            <p className="adm-modal-body adm-modal-body--soft">
              {t('admin.unlock.body2')}
            </p>
            <div className="adm-modal-actions">
              <button className="adm-modal-ghost" onClick={() => setShowUnlock(false)}>
                {t('admin.unlock.no')}
              </button>
              <button
                className="adm-modal-cta"
                onClick={() => { setMode('advanced'); setShowUnlock(false); }}
              >
                {t('admin.unlock.yes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ════════════════════════════════════════════════════════════════
  // SIMPLE VIEW
  // ════════════════════════════════════════════════════════════════
  if (mode === 'simple') {
    return (
      <div className="adm-page adm-page--simple">
        {dialogs}

        <div className="adm-simple-head">
          <h2 className="adm-simple-title">{t('admin.simple.title')}</h2>
          <p className="adm-simple-sub">{t('admin.simple.sub')}</p>
        </div>

        <div className="lever-list">
          {SIMPLE_LEVER_DEFS.map((def) => (
            <LeverCard key={def.id} def={def} mod={localMod} onPick={(lv) => applyLever(def, lv)} />
          ))}
        </div>

        <div className="adm-simple-block">
          <h3 className="adm-simple-block-title">{t('admin.simple.whatifTitle')}</h3>
          <p className="adm-simple-block-sub">{t('admin.simple.whatifSub')}</p>
          <SimpleWhatIf mod={localMod} onChange={applySimpleWhatIf} />
        </div>

        <button className="adm-simple-cta" onClick={applyAndSimulate}>
          {t('admin.simple.cta')}
        </button>

        {isModified && (
          <div className="adm-simple-actions">
            <button className="adm-btn-reset" onClick={resetAll}>
              {t('admin.simple.resetAll')}
            </button>
          </div>
        )}

        <button className="adm-unlock-card" onClick={() => setShowUnlock(true)}>
          <span className="adm-unlock-ico"><IconAdvanced /></span>
          <span className="adm-unlock-text">
            <span className="adm-unlock-title">{t('admin.simple.unlock.title')}</span>
            <span className="adm-unlock-sub">{t('admin.simple.unlock.sub')}</span>
          </span>
          <span className="adm-unlock-arrow" aria-hidden>→</span>
        </button>
        <p className="adm-simple-foot">{t('admin.simple.foot')}</p>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // ADVANCED VIEW — full technical panel.
  // ════════════════════════════════════════════════════════════════
  return (
    <div className="adm-page">
      {dialogs}
      <div className="adm-header">
        <div className="adm-back-row">
          <button className="adm-back-btn" onClick={() => setMode('simple')}>
            {t('admin.adv.back')}
          </button>
        </div>
        <h2 className="adm-title">{t('admin.adv.title')}</h2>
        <p className="adm-subtitle">
          {t('admin.adv.subtitle.pre')}<strong>{t('admin.adv.subtitle.apply')}</strong>{t('admin.adv.subtitle.post')}
        </p>
        <div className="adm-header-actions">
          {isModified && (
            <button className="adm-btn-reset" onClick={resetAll}>{t('admin.adv.resetAllDefaults')}</button>
          )}
          <button className="adm-btn-apply" onClick={apply} disabled={applied}>
            {applied ? t('admin.adv.applied') : t('admin.adv.applyToSim')}
          </button>
        </div>
      </div>

      {/* Quick navigation between sections */}
      <nav className="adm-nav">
        {ADM_SECTION_IDS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="adm-nav-link">
            {t(s.key)}
          </a>
        ))}
      </nav>

      <div className="adm-sections">

        {/* SECTION 1: Per-match modulators */}
        <section className="adm-section" id="adm-sec-lambda">
          <h3 className="adm-section-title">
            {t('admin.sec.lambda.title.pre')}<em>{t('admin.sec.lambda.title.em')}</em>{t('admin.sec.lambda.title.post')}
          </h3>
          <p className="adm-section-desc">{t('admin.sec.lambda.desc')}</p>

          <ModSlider
            label={t('admin.slider.form.label')}
            description={t('admin.slider.form.desc')}
            value={localMod.formCoeff}
            min={0} max={0.15} step={0.005}
            effectLabel={t('admin.slider.form.effect')}
            effectValue={toGolPct(localMod.formCoeff, 1)}
            color="#22c55e"
            onChange={(v) => update('formCoeff', v)}
            onReset={() => update('formCoeff', DEFAULTS.formCoeff)}
            defaultValue={DEFAULTS.formCoeff}
            resetTitle={resetTitle} resetLabel={resetLabel} coeffLabel={coeffLabel}
          />

          <ModSlider
            label={t('admin.slider.value.label')}
            description={t('admin.slider.value.desc')}
            value={localMod.squadValueCoeff}
            min={0} max={0.25} step={0.005}
            effectLabel={t('admin.slider.value.effect')}
            effectValue={toGolPct(localMod.squadValueCoeff, 2)}
            color="#f59e0b"
            onChange={(v) => update('squadValueCoeff', v)}
            onReset={() => update('squadValueCoeff', DEFAULTS.squadValueCoeff)}
            defaultValue={DEFAULTS.squadValueCoeff}
            resetTitle={resetTitle} resetLabel={resetLabel} coeffLabel={coeffLabel}
          />

          <ModSlider
            label={t('admin.slider.elo.label')}
            description={t('admin.slider.elo.desc')}
            value={localMod.eloCoeff}
            min={0} max={0.35} step={0.005}
            effectLabel={t('admin.slider.elo.effect')}
            effectValue={toGolPct(localMod.eloCoeff, 230 / 200)}
            color="#3b82f6"
            onChange={(v) => update('eloCoeff', v)}
            onReset={() => update('eloCoeff', DEFAULTS.eloCoeff)}
            defaultValue={DEFAULTS.eloCoeff}
            resetTitle={resetTitle} resetLabel={resetLabel} coeffLabel={coeffLabel}
          />

          <ModSlider
            label={t('admin.slider.shrink.label')}
            description={t('admin.slider.shrink.desc')}
            value={localMod.lambdaShrink}
            min={0} max={0.5} step={0.01}
            effectLabel={t('admin.slider.shrink.effect')}
            effectValue={`${(localMod.lambdaShrink * 100).toFixed(0)}%`}
            color="#a855f7"
            onChange={(v) => update('lambdaShrink', v)}
            onReset={() => update('lambdaShrink', DEFAULTS.lambdaShrink)}
            defaultValue={DEFAULTS.lambdaShrink}
            resetTitle={resetTitle} resetLabel={resetLabel} coeffLabel={coeffLabel}
          />
        </section>

        {/* SECTION 2: Head-to-head H2H */}
        <section className="adm-section" id="adm-sec-h2h">
          <h3 className="adm-section-title">
            {t('admin.sec.h2h.title.pre')}<em>{t('admin.sec.h2h.title.em')}</em>
          </h3>
          <p className="adm-section-desc">{t('admin.sec.h2h.desc')}</p>
          <ModSlider
            label={t('admin.slider.h2h.label')}
            description={t('admin.slider.h2h.desc')}
            value={localMod.h2hMaxBoost}
            min={0} max={0.50} step={0.01}
            effectLabel={t('admin.slider.h2h.effect')}
            effectValue={`±${(localMod.h2hMaxBoost * 100).toFixed(0)}%`}
            color="#8b5cf6"
            onChange={(v) => update('h2hMaxBoost', v)}
            onReset={() => update('h2hMaxBoost', DEFAULTS.h2hMaxBoost)}
            defaultValue={DEFAULTS.h2hMaxBoost}
            resetTitle={resetTitle} resetLabel={resetLabel} coeffLabel={coeffLabel}
          />
        </section>

        {/* SECTION 3: Home advantage */}
        <section className="adm-section" id="adm-sec-home">
          <h3 className="adm-section-title">
            {t('admin.sec.home.title.pre')}<em>{t('admin.sec.home.title.em')}</em>
          </h3>
          <p className="adm-section-desc">{t('admin.sec.home.desc')}</p>

          <ModSlider
            label={t('admin.slider.home.label')}
            description={t('admin.slider.home.desc')}
            value={localMod.homeAdvBoost}
            min={0} max={0.60} step={0.01}
            effectLabel={t('admin.slider.home.effect')}
            effectValue={`+${((Math.exp(localMod.homeAdvBoost) - 1) * 100).toFixed(1)}%`}
            color="#f97316"
            onChange={(v) => update('homeAdvBoost', v)}
            onReset={() => update('homeAdvBoost', DEFAULTS.homeAdvBoost)}
            defaultValue={DEFAULTS.homeAdvBoost}
            resetTitle={resetTitle} resetLabel={resetLabel} coeffLabel={coeffLabel}
          />
        </section>

        {/* SECTION 4: KO experience */}
        <section className="adm-section" id="adm-sec-ko">
          <h3 className="adm-section-title">
            {t('admin.sec.ko.title.pre')}<em>{t('admin.sec.ko.title.em')}</em>
          </h3>
          <p className="adm-section-desc">{t('admin.sec.ko.desc')}</p>

          <ModSlider
            label={t('admin.slider.koMatch.label')}
            description={t('admin.slider.koMatch.desc')}
            value={localMod.koMatchCoeff}
            min={0} max={0.15} step={0.005}
            effectLabel={t('admin.slider.koMatch.effect')}
            effectValue={`±${((Math.exp(localMod.koMatchCoeff) - 1) * 100).toFixed(1)}%`}
            color="#a855f7"
            onChange={(v) => update('koMatchCoeff', v)}
            onReset={() => update('koMatchCoeff', DEFAULTS.koMatchCoeff)}
            defaultValue={DEFAULTS.koMatchCoeff}
            resetTitle={resetTitle} resetLabel={resetLabel} coeffLabel={coeffLabel}
          />

          <ModSlider
            label={t('admin.slider.koPen.label')}
            description={t('admin.slider.koPen.desc')}
            value={localMod.koExperienceCoeff}
            min={0} max={0.20} step={0.005}
            effectLabel={t('admin.slider.koPen.effect')}
            effectValue={t('admin.slider.koPen.effectUnit', { v: (localMod.koExperienceCoeff * 100).toFixed(1) })}
            color="#a855f7"
            onChange={(v) => update('koExperienceCoeff', v)}
            onReset={() => update('koExperienceCoeff', DEFAULTS.koExperienceCoeff)}
            defaultValue={DEFAULTS.koExperienceCoeff}
            resetTitle={resetTitle} resetLabel={resetLabel} coeffLabel={coeffLabel}
          />

          <div className="adm-mix-row">
            <div className="adm-mix-header">
              <span className="adm-slider-label">{t('admin.mix.label')}</span>
              <span className="adm-mix-vals">
                {t('admin.mix.vals', {
                  ko: Math.round(localMod.koKnockoutWeight * 100),
                  hist: Math.round(localMod.koHistoryWeight * 100),
                })}
              </span>
            </div>
            <p className="adm-slider-desc">{t('admin.mix.desc')}</p>
            <input
              type="range"
              min={0} max={1} step={0.05}
              value={localMod.koKnockoutWeight}
              onChange={(e) => update('koKnockoutWeight', Number(e.target.value))}
              style={{
                '--pct': `${localMod.koKnockoutWeight * 100}%`,
                '--color': '#a855f7',
              } as React.CSSProperties}
              className="adm-range"
            />
            <div className="adm-mix-labels">
              <span>{t('admin.mix.leftLabel')}</span>
              <span>{t('admin.mix.rightLabel')}</span>
            </div>
          </div>
        </section>

        {/* SECTION 5: What-if scenario weights */}
        <section className="adm-section" id="adm-sec-whatif">
          <h3 className="adm-section-title">
            {t('admin.sec.whatif.title.pre')}<em>{t('admin.sec.whatif.title.em')}</em>
          </h3>
          <p className="adm-section-desc">{t('admin.sec.whatif.desc')}</p>

          <ModSlider
            label={t('admin.whatif.missingStar.label')}
            description={t('admin.whatif.missingStar.desc')}
            value={localMod.whatIf.missingStar}
            min={-120} max={0} step={5}
            valueLabel={<>{t('admin.whatif.valueLabel', { v: localMod.whatIf.missingStar })}</>}
            effectLabel={t('admin.whatif.strength')}
            effectValue={t('admin.whatif.effectVal', { v: localMod.whatIf.missingStar })}
            color="#f59e0b"
            onChange={(v) => updateWhatIf('missingStar', v)}
            onReset={() => updateWhatIf('missingStar', DEFAULTS.whatIf.missingStar)}
            defaultValue={DEFAULTS.whatIf.missingStar}
            resetTitle={resetTitle} resetLabel={resetLabel} coeffLabel={coeffLabel}
          />
          <ModSlider
            label={t('admin.whatif.injuries.label')}
            description={t('admin.whatif.injuries.desc')}
            value={localMod.whatIf.injuries}
            min={-160} max={0} step={5}
            valueLabel={<>{t('admin.whatif.valueLabel', { v: localMod.whatIf.injuries })}</>}
            effectLabel={t('admin.whatif.strength')}
            effectValue={t('admin.whatif.effectVal', { v: localMod.whatIf.injuries })}
            color="#ef4444"
            onChange={(v) => updateWhatIf('injuries', v)}
            onReset={() => updateWhatIf('injuries', DEFAULTS.whatIf.injuries)}
            defaultValue={DEFAULTS.whatIf.injuries}
            resetTitle={resetTitle} resetLabel={resetLabel} coeffLabel={coeffLabel}
          />
          <ModSlider
            label={t('admin.whatif.starReturn.label')}
            description={t('admin.whatif.starReturn.desc')}
            value={localMod.whatIf.starReturn}
            min={0} max={80} step={5}
            valueLabel={<>{t('admin.whatif.valueLabelPos', { v: localMod.whatIf.starReturn })}</>}
            effectLabel={t('admin.whatif.strength')}
            effectValue={t('admin.whatif.effectValPos', { v: localMod.whatIf.starReturn })}
            color="#22c55e"
            onChange={(v) => updateWhatIf('starReturn', v)}
            onReset={() => updateWhatIf('starReturn', DEFAULTS.whatIf.starReturn)}
            defaultValue={DEFAULTS.whatIf.starReturn}
            resetTitle={resetTitle} resetLabel={resetLabel} coeffLabel={coeffLabel}
          />
          <ModSlider
            label={t('admin.whatif.suspension.label')}
            description={t('admin.whatif.suspension.desc')}
            value={localMod.whatIf.suspension}
            min={-120} max={0} step={5}
            valueLabel={<>{t('admin.whatif.valueLabel', { v: localMod.whatIf.suspension })}</>}
            effectLabel={t('admin.whatif.strength')}
            effectValue={t('admin.whatif.effectVal', { v: localMod.whatIf.suspension })}
            color="#f97316"
            onChange={(v) => updateWhatIf('suspension', v)}
            onReset={() => updateWhatIf('suspension', DEFAULTS.whatIf.suspension)}
            defaultValue={DEFAULTS.whatIf.suspension}
            resetTitle={resetTitle} resetLabel={resetLabel} coeffLabel={coeffLabel}
          />
        </section>

        {/* SECTION 6: Generate strength ranking */}
        <section className="adm-section" id="adm-sec-ranking">
          <h3 className="adm-section-title">
            {t('admin.sec.ranking.title.pre')}<em>{t('admin.sec.ranking.title.em')}</em>
          </h3>
          <p className="adm-section-desc">{t('admin.sec.ranking.desc')}</p>

          <div className="adm-pie-block">
            <div className="adm-pie-title">
              {t('admin.pie.title')}
              <span className="adm-pie-hint">{t('admin.pie.hint')}</span>
            </div>
            <StrengthPie components={breakdown} />
          </div>

          <button
            className="adm-btn-apply adm-btn-apply--big"
            onClick={() => onGenerateRanking?.(localMod)}
          >
            {t('admin.ranking.generate')}
          </button>
        </section>

        {/* Live effects preview */}
        <LiveExample mod={localMod} />

        {/* Apply button at the bottom */}
        <div className="adm-footer-actions">
          {isModified && (
            <button className="adm-btn-reset" onClick={resetAll}>{t('admin.adv.resetAllDefaults')}</button>
          )}
          <button className="adm-btn-apply" onClick={apply} disabled={applied}>
            {applied ? t('admin.footer.valuesReady') : t('admin.footer.applyNoSim')}
          </button>
          <button className="adm-btn-apply adm-btn-apply--big" onClick={applyAndSimulate}>
            {t('admin.footer.applyAndSim')}
          </button>
        </div>
      </div>
    </div>
  );
}
