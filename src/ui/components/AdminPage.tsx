/**
 * Pagina Admin — due livelli.
 *
 * SEMPLICE (default): poche "leve" concettuali con Basso/Medio/Alto, pensate
 * per chi non mastica dati. All'apertura un avviso una-tantum rassicura che
 * tutto è già calibrato. In fondo, "Opzioni avanzate" (con conferma) sblocca…
 *
 * AVANZATA: il pannello tecnico completo (slider coefficienti, effetti %, mix
 * KO, classifica forza), pensato per chi di dati ne capisce.
 */

import { useState, useCallback, useMemo } from 'react';
import type { ModulatorConfig, Team, ModelParams, H2HRecord, TeamStats } from '../../engine/types';
import { config } from '../../config';
import { computeStrengthBreakdown } from '../../engine/strengthScore';
import { StrengthPie } from './StrengthPie';

interface Props {
  modulators: ModulatorConfig;
  onChange: (m: ModulatorConfig) => void;
  /** Applica i pesi E rilancia la simulazione (chiude il pannello). */
  onApplyAndSimulate?: (m: ModulatorConfig) => void;
  /** Applica i pesi correnti e apre la classifica forza nella pagina Squadre. */
  onGenerateRanking?: (m: ModulatorConfig) => void;
  /** Dati per scomporre il Punteggio Forza nel grafico a torta. */
  teams: Team[];
  params: ModelParams | null;
  h2h: Map<string, H2HRecord>;
  teamStats: Map<string, TeamStats>;
}

/** Sezioni del pannello, per la navigazione ad ancore. */
const ADM_SECTIONS = [
  { id: 'adm-sec-lambda', label: 'Modulatori λ' },
  { id: 'adm-sec-h2h', label: 'Storico H2H' },
  { id: 'adm-sec-home', label: 'Vantaggio campo' },
  { id: 'adm-sec-ko', label: 'Esperienza KO' },
  { id: 'adm-sec-whatif', label: 'What-if' },
  { id: 'adm-sec-ranking', label: 'Classifica forza' },
];

/** Converte un coefficiente log-lambda in percentuale di variazione gol. */
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
  /** Override del testo a sinistra (default: "coeff: X.XXX"). */
  valueLabel?: React.ReactNode;
}

function ModSlider({
  label, description, value, min, max, step,
  effectLabel, effectValue, color, onChange, onReset, defaultValue, valueLabel,
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
          <button className="adm-reset-btn" onClick={onReset} title="Ripristina default">
            ↺ reset
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
            {valueLabel ?? <>coeff: <strong>{value.toFixed(3)}</strong></>}
          </span>
          <span className="adm-val-effect">
            {effectLabel}: <strong>{effectValue}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Mostra un esempio concreto di partita con i modulatori correnti. */
function LiveExample({ mod }: { mod: ModulatorConfig }) {
  // Esempio: squadra "in forma" (score 85) vs squadra "in crisi" (score 30)
  const formBoostHot  = (Math.exp(((85 - 50) / 50) * mod.formCoeff) - 1) * 100;
  const formBoostCold = (Math.exp(((30 - 50) / 50) * mod.formCoeff) - 1) * 100;
  // Valore rosa: z-score +2 (es. Francia ~1480M€) vs z-score -0.5 (es. Haiti)
  const valueBoostRich = (Math.exp(2.0 * mod.squadValueCoeff) - 1) * 100;
  const valueBoostPoor = (Math.exp(-0.5 * mod.squadValueCoeff) - 1) * 100;
  // Elo: +230 punti sopra media (Brasile ~1988 vs media ~1780) vs -200 sotto
  const eloBoostTop  = (Math.exp((230 / 200) * mod.eloCoeff) - 1) * 100;
  const eloBoostLow  = (Math.exp((-200 / 200) * mod.eloCoeff) - 1) * 100;
  // Rigori: Italia (KO-exp ~72) vs Norvegia (KO-exp ~28)
  const koEdge = ((72 - 28) / 100) * mod.koExperienceCoeff * 100;
  // Vantaggio campo: quanto % di gol in più per le host
  const homeAdvPct = (Math.exp(mod.homeAdvBoost) - 1) * 100;

  const up = <span className="adm-ex-arrow up" aria-hidden>▲</span>;
  const down = <span className="adm-ex-arrow down" aria-hidden>▼</span>;
  return (
    <div className="adm-example">
      <h3 className="adm-example-title">Effetti concreti con i valori correnti</h3>
      <div className="adm-example-grid">
        <div className="adm-ex-card">
          <div className="adm-ex-icon">{up}</div>
          <div className="adm-ex-title">Forma eccellente (score 85)</div>
          <div className="adm-ex-val positive">+{formBoostHot.toFixed(1)}% gol attesi</div>
          <div className="adm-ex-sub">es. Senegal, Norvegia, Inghilterra</div>
        </div>
        <div className="adm-ex-card">
          <div className="adm-ex-icon">{down}</div>
          <div className="adm-ex-title">Forma negativa (score 30)</div>
          <div className="adm-ex-val negative">{formBoostCold.toFixed(1)}% gol attesi</div>
          <div className="adm-ex-sub">squadra in crisi profonda</div>
        </div>
        <div className="adm-ex-card">
          <div className="adm-ex-icon">{up}</div>
          <div className="adm-ex-title">Rosa ricchissima (z+2, ~€1400M)</div>
          <div className="adm-ex-val positive">+{valueBoostRich.toFixed(1)}% gol attesi</div>
          <div className="adm-ex-sub">es. Francia, Inghilterra</div>
        </div>
        <div className="adm-ex-card">
          <div className="adm-ex-icon">{down}</div>
          <div className="adm-ex-title">Rosa modesta (z−0.5)</div>
          <div className="adm-ex-val negative">{valueBoostPoor.toFixed(1)}% gol attesi</div>
          <div className="adm-ex-sub">es. Haiti, Curaçao</div>
        </div>
        <div className="adm-ex-card">
          <div className="adm-ex-icon">{up}</div>
          <div className="adm-ex-title">Elo top (+230 dalla media)</div>
          <div className="adm-ex-val positive">+{eloBoostTop.toFixed(1)}% gol attesi</div>
          <div className="adm-ex-sub">es. Brasile (Elo 1988)</div>
        </div>
        <div className="adm-ex-card">
          <div className="adm-ex-icon">{down}</div>
          <div className="adm-ex-title">Elo basso (−200 dalla media)</div>
          <div className="adm-ex-val negative">{eloBoostLow.toFixed(1)}% gol attesi</div>
          <div className="adm-ex-sub">es. Curaçao, Qatar</div>
        </div>
        <div className="adm-ex-card">
          <div className="adm-ex-icon">{up}</div>
          <div className="adm-ex-title">Vantaggio campo (USA/CAN/MEX)</div>
          <div className="adm-ex-val positive">+{homeAdvPct.toFixed(1)}% gol in casa</div>
          <div className="adm-ex-sub">exp({mod.homeAdvBoost.toFixed(3)}) applicato solo alle 3 ospitanti</div>
        </div>
        <div className="adm-ex-card adm-ex-card--wide">
          <div className="adm-ex-icon">{up}</div>
          <div className="adm-ex-title">Rigori KO: Italia (exp 72) vs Norvegia (exp 28)</div>
          <div className="adm-ex-val positive">Italia +{koEdge.toFixed(1)}% probabilità</div>
          <div className="adm-ex-sub">bonus esperienza su base coin-flip inclinato verso i λ</div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   LIVELLO SEMPLICE — poche leve concettuali, niente gergo.
   Ogni leva ha 3 livelli; "Medio" coincide coi default calibrati.
   I valori mappano su uno o più coefficienti reali del motore.
   ════════════════════════════════════════════════════════════════════ */

type LeverLevel = 'low' | 'mid' | 'high';

/* Icone line-art minimali (stile premium del sito), niente emoji decorative. */
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
/* Icone grandi per i dialog (32px). */
const IconSliders = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="9" cy="7" r="2.3" fill="var(--surface-1)"/><circle cx="15" cy="12" r="2.3" fill="var(--surface-1)"/><circle cx="8" cy="17" r="2.3" fill="var(--surface-1)"/></svg>
);
const IconAdvanced = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>
);

interface SimpleLever {
  id: string;
  icon: React.ReactNode;
  title: string;
  /** Una riga, linguaggio quotidiano. */
  blurb: string;
  /** Etichette dei tre livelli mostrate sul selettore. */
  levels: { low: string; mid: string; high: string };
  /** Spiega in una riga cosa succede su ogni livello (sotto il selettore). */
  hint: { low: string; mid: string; high: string };
  /** Applica il livello scelto ai modulatori (mid = default). */
  apply: (m: ModulatorConfig, level: LeverLevel) => ModulatorConfig;
  /** Ricava il livello corrente dai modulatori (per evidenziare la scelta). */
  read: (m: ModulatorConfig) => LeverLevel;
}

const SIMPLE_LEVERS: SimpleLever[] = [
  {
    id: 'surprises',
    icon: <IconDice />,
    title: 'Quanto sono pazzi i Mondiali',
    blurb: 'Sposta l’equilibrio tra «vincono i più forti» e «tutto può succedere».',
    levels: { low: 'Pochi ribaltoni', mid: 'Equilibrato', high: 'Tante sorprese' },
    hint: {
      low: 'Le favorite dominano: poche Cenerentole.',
      mid: 'Il bilanciamento consigliato, realistico.',
      high: 'Più imprevisti: le piccole arrivano lontano più spesso.',
    },
    apply: (m, l) => ({ ...m, lambdaShrink: l === 'low' ? 0.15 : l === 'high' ? 0.45 : DEFAULTS.lambdaShrink }),
    read: (m) => (m.lambdaShrink <= 0.22 ? 'low' : m.lambdaShrink >= 0.38 ? 'high' : 'mid'),
  },
  {
    id: 'home',
    icon: <IconHome />,
    title: 'Spinta dei padroni di casa',
    blurb: 'Quanto aiuta giocare in casa (USA, Canada, Messico).',
    levels: { low: 'Quasi nulla', mid: 'Normale', high: 'Forte' },
    hint: {
      low: 'Il fattore campo conta pochissimo.',
      mid: 'Vantaggio realistico per le ospitanti.',
      high: 'Le ospitanti hanno una spinta marcata.',
    },
    apply: (m, l) => ({ ...m, homeAdvBoost: l === 'low' ? 0.08 : l === 'high' ? 0.40 : DEFAULTS.homeAdvBoost }),
    read: (m) => (m.homeAdvBoost <= 0.14 ? 'low' : m.homeAdvBoost >= 0.31 ? 'high' : 'mid'),
  },
  {
    id: 'form',
    icon: <IconPulse />,
    title: 'Peso dello stato di forma',
    blurb: 'Quanto conta il momento (squadra in fiducia o in crisi).',
    levels: { low: 'Poco', mid: 'Normale', high: 'Molto' },
    hint: {
      low: 'Conta solo il valore di fondo della squadra.',
      mid: 'La forma pesa, ma senza esagerare.',
      high: 'Il momento di forma incide parecchio.',
    },
    apply: (m, l) => ({ ...m, formCoeff: l === 'low' ? 0.005 : l === 'high' ? 0.08 : DEFAULTS.formCoeff }),
    read: (m) => (m.formCoeff <= 0.012 ? 'low' : m.formCoeff >= 0.05 ? 'high' : 'mid'),
  },
];

/** Selettore a 3 livelli, stile segmented-control premium. */
function LeverCard({ lever, mod, onPick }: {
  lever: SimpleLever;
  mod: ModulatorConfig;
  onPick: (level: LeverLevel) => void;
}) {
  const current = lever.read(mod);
  const order: LeverLevel[] = ['low', 'mid', 'high'];
  return (
    <div className="lever-card">
      <div className="lever-head">
        <span className="lever-ico">{lever.icon}</span>
        <div className="lever-text">
          <span className="lever-title">{lever.title}</span>
          <span className="lever-blurb">{lever.blurb}</span>
        </div>
      </div>
      <div className="lever-seg" role="group" aria-label={lever.title}>
        {order.map((lv) => (
          <button
            key={lv}
            className={`lever-seg-btn ${current === lv ? 'active' : ''}`}
            onClick={() => onPick(lv)}
          >
            {lever.levels[lv]}
          </button>
        ))}
      </div>
      <p className="lever-hint">{lever.hint[current]}</p>
    </div>
  );
}

/** Card scenario what-if (intuitivo): mostra solo l'intensità, niente "pt Elo". */
function SimpleWhatIf({ mod, onChange }: { mod: ModulatorConfig; onChange: (m: ModulatorConfig) => void }) {
  const items: { key: keyof ModulatorConfig['whatIf']; icon: React.ReactNode; label: string; sign: 'neg' | 'pos' }[] = [
    { key: 'missingStar', icon: <IconUserMinus />, label: 'Assenza di un big', sign: 'neg' },
    { key: 'injuries', icon: <IconBandage />, label: 'Più infortuni pesanti', sign: 'neg' },
    { key: 'starReturn', icon: <IconSpark />, label: 'Rientro / stato di grazia', sign: 'pos' },
    { key: 'suspension', icon: <IconCard />, label: 'Squalifica chiave', sign: 'neg' },
  ];
  // Intensità 1–3 (lieve/medio/forte) mappata sul valore in punti.
  const magToLevel = (v: number) => {
    const a = Math.abs(v);
    return a <= 30 ? 1 : a <= 70 ? 2 : 3;
  };
  const levelToMag = (lv: number, sign: 'neg' | 'pos') => {
    const base = lv === 1 ? 25 : lv === 2 ? 55 : 95;
    return sign === 'neg' ? -base : Math.round(base * 0.55); // i bonus sono più piccoli
  };
  return (
    <div className="swi-grid">
      {items.map((it) => {
        const lv = magToLevel(mod.whatIf[it.key]);
        return (
          <div key={it.key} className="swi-card">
            <div className="swi-head">
              <span className="swi-ico">{it.icon}</span>
              <span className="swi-label">{it.label}</span>
            </div>
            <div className="swi-seg" role="group" aria-label={it.label}>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  className={`swi-seg-btn ${lv === n ? 'active' : ''}`}
                  onClick={() => onChange({ ...mod, whatIf: { ...mod.whatIf, [it.key]: levelToMag(n, it.sign) } })}
                >
                  {n === 1 ? 'Lieve' : n === 2 ? 'Medio' : 'Forte'}
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
  const [localMod, setLocalMod] = useState<ModulatorConfig>({ ...modulators });
  const [applied, setApplied] = useState(false);
  /** Livello del pannello: parte semplice, "Opzioni avanzate" lo sblocca. */
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
  /** Avviso una-tantum all'apertura ("tutto è già calibrato…"). */
  const [showIntro, setShowIntro] = useState(true);
  /** Dialog di conferma per sbloccare la modalità avanzata. */
  const [showUnlock, setShowUnlock] = useState(false);

  const update = useCallback((key: keyof ModulatorConfig, value: number) => {
    setLocalMod((prev) => {
      const next = { ...prev, [key]: value };
      // KO weights devono sommare a 1
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

  // "Applica" nella vista avanzata: aggiorna solo i pesi (lo specialista può
  // continuare a smanettare). Per rilanciare c'è il bottone dedicato in fondo.
  const apply = () => {
    onChange(localMod);
    setApplied(true);
  };

  const isModified = JSON.stringify(localMod) !== JSON.stringify(DEFAULTS);

  // Scomposizione del Punteggio Forza, reattiva agli slider correnti.
  const breakdown = useMemo(
    () => computeStrengthBreakdown({ teams, params, h2h, teamStats, modulators: localMod }),
    [teams, params, h2h, teamStats, localMod],
  );

  // Le leve aggiornano solo lo stato locale: l'utente conferma con il bottone
  // "Applica e rilancia". Così niente ri-simulazioni a ogni click.
  const applyLever = (lever: SimpleLever, level: LeverLevel) => {
    setLocalMod(lever.apply(localMod, level));
    setApplied(false);
  };
  const applySimpleWhatIf = (next: ModulatorConfig) => {
    setLocalMod(next);
    setApplied(false);
  };
  /** Applica i valori correnti e rilancia la simulazione (chiude il pannello). */
  const applyAndSimulate = () => {
    if (onApplyAndSimulate) onApplyAndSimulate(localMod);
    else { onChange(localMod); setApplied(true); }
  };

  // ── DIALOG condivisi (intro una-tantum + sblocco avanzato) ──
  const dialogs = (
    <>
      {showIntro && (
        <div className="adm-modal-backdrop" onClick={() => setShowIntro(false)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-icon"><IconSliders /></div>
            <h3 className="adm-modal-title">Zona regolazioni</h3>
            <p className="adm-modal-body">
              Qui puoi <strong>giocare con le impostazioni</strong> della simulazione.
              Sappi però che è <strong>già tutto calibrato</strong> con cura: non serve
              toccare niente per avere risultati sensati.
            </p>
            <p className="adm-modal-body adm-modal-body--soft">
              Se ti va di sperimentare, accomodati pure — puoi sempre ripristinare tutto.
            </p>
            <button className="adm-modal-cta" onClick={() => setShowIntro(false)}>
              Ho capito, entro
            </button>
          </div>
        </div>
      )}

      {showUnlock && (
        <div className="adm-modal-backdrop" onClick={() => setShowUnlock(false)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-icon"><IconAdvanced /></div>
            <h3 className="adm-modal-title">Opzioni avanzate</h3>
            <p className="adm-modal-body">
              Stai per sbloccare i <strong>controlli tecnici</strong>: coefficienti grezzi,
              effetti in percentuale, pesi del modello. Roba per chi <strong>mastica i dati</strong>.
            </p>
            <p className="adm-modal-body adm-modal-body--soft">
              Tutto resta reversibile, ma le scritte diventano parecchio più dense.
            </p>
            <div className="adm-modal-actions">
              <button className="adm-modal-ghost" onClick={() => setShowUnlock(false)}>
                No, resto qui
              </button>
              <button
                className="adm-modal-cta"
                onClick={() => { setMode('advanced'); setShowUnlock(false); }}
              >
                Sì, sblocca
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ════════════════════════════════════════════════════════════════
  // VISTA SEMPLICE — leve grandi, niente gergo. (default)
  // ════════════════════════════════════════════════════════════════
  if (mode === 'simple') {
    return (
      <div className="adm-page adm-page--simple">
        {dialogs}

        <div className="adm-simple-head">
          <h2 className="adm-simple-title">Regola la simulazione</h2>
          <p className="adm-simple-sub">
            È già tutto impostato bene. Tocca solo se ti va.
          </p>
        </div>

        <div className="lever-list">
          {SIMPLE_LEVERS.map((lever) => (
            <LeverCard key={lever.id} lever={lever} mod={localMod} onPick={(lv) => applyLever(lever, lv)} />
          ))}
        </div>

        <div className="adm-simple-block">
          <h3 className="adm-simple-block-title">Scenari «e se…»</h3>
          <p className="adm-simple-block-sub">
            Quanto pesano gli imprevisti su una squadra.
          </p>
          <SimpleWhatIf mod={localMod} onChange={applySimpleWhatIf} />
        </div>

        <button className="adm-simple-cta" onClick={applyAndSimulate}>
          ▶ Applica e vai alla simulazione
        </button>

        {isModified && (
          <div className="adm-simple-actions">
            <button className="adm-btn-reset" onClick={resetAll}>
              ↺ Rimetti tutto com'era
            </button>
          </div>
        )}

        <button className="adm-unlock-card" onClick={() => setShowUnlock(true)}>
          <span className="adm-unlock-ico"><IconAdvanced /></span>
          <span className="adm-unlock-text">
            <span className="adm-unlock-title">Opzioni avanzate</span>
            <span className="adm-unlock-sub">Sblocca i controlli tecnici · per chi mastica i dati</span>
          </span>
          <span className="adm-unlock-arrow" aria-hidden>→</span>
        </button>
        <p className="adm-simple-foot">
          Le modifiche valgono solo per te, in questa sessione.
        </p>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // VISTA AVANZATA — pannello tecnico completo.
  // ════════════════════════════════════════════════════════════════
  return (
    <div className="adm-page">
      {dialogs}
      <div className="adm-header">
        <div className="adm-back-row">
          <button className="adm-back-btn" onClick={() => setMode('simple')}>
            ← Torna alla vista semplice
          </button>
        </div>
        <h2 className="adm-title">Pannello Admin — Coefficienti Simulatore</h2>
        <p className="adm-subtitle">
          Modifica i pesi dei modulatori e premi <strong>Applica</strong> per ri-simulare con i nuovi valori.
          Le modifiche sono valide solo per questa sessione.
        </p>
        <div className="adm-header-actions">
          {isModified && (
            <button className="adm-btn-reset" onClick={resetAll}>↺ Ripristina tutti i default</button>
          )}
          <button className="adm-btn-apply" onClick={apply} disabled={applied}>
            {applied ? '✓ Applicato' : '▶ Applica al simulatore'}
          </button>
        </div>
      </div>

      {/* Navigazione rapida tra le sezioni */}
      <nav className="adm-nav">
        {ADM_SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="adm-nav-link">
            {s.label}
          </a>
        ))}
      </nav>

      <div className="adm-sections">

        {/* SEZIONE 1: Modulatori su ogni partita */}
        <section className="adm-section" id="adm-sec-lambda">
          <h3 className="adm-section-title">
            Modulatori λ — agiscono su <em>ogni</em> partita
          </h3>
          <p className="adm-section-desc">
            Questi coefficienti moltiplicano i gol attesi (<em>λ</em>) calcolati dal modello bayesiano core.
            Effetti piccoli e proporzionali: non ribaltano un mismatch, spostano l'ago nelle sfide equilibrate.
          </p>

          <ModSlider
            label="Forma recente"
            description="Ultime 30 partite (score 0–100, media ≈ 50). Peso volutamente marginale: una squadra in grande forma segna pochissimo di più, una in crisi pochissimo di meno."
            value={localMod.formCoeff}
            min={0} max={0.15} step={0.005}
            effectLabel="effetto max (score 0 o 100)"
            effectValue={toGolPct(localMod.formCoeff, 1)}
            color="#22c55e"
            onChange={(v) => update('formCoeff', v)}
            onReset={() => update('formCoeff', DEFAULTS.formCoeff)}
            defaultValue={DEFAULTS.formCoeff}
          />

          <ModSlider
            label="Valore rosa"
            description="Valore di mercato della rosa (z-score sulle 48 squadre). Riflette la qualità media dei calciatori, non già catturata del tutto dall'Elo."
            value={localMod.squadValueCoeff}
            min={0} max={0.25} step={0.005}
            effectLabel="effetto max (z ≈ ±2)"
            effectValue={toGolPct(localMod.squadValueCoeff, 2)}
            color="#f59e0b"
            onChange={(v) => update('squadValueCoeff', v)}
            onReset={() => update('squadValueCoeff', DEFAULTS.squadValueCoeff)}
            defaultValue={DEFAULTS.squadValueCoeff}
          />

          <ModSlider
            label="Elo corrente"
            description="Rating Elo snapshot giugno 2026. Corregge le distorsioni del fit bayesiano sulle big europee/sudamericane. Calibrato su quote bookmaker giugno 2026."
            value={localMod.eloCoeff}
            min={0} max={0.35} step={0.005}
            effectLabel="effetto max (±230 pt Elo)"
            effectValue={toGolPct(localMod.eloCoeff, 230 / 200)}
            color="#3b82f6"
            onChange={(v) => update('eloCoeff', v)}
            onReset={() => update('eloCoeff', DEFAULTS.eloCoeff)}
            defaultValue={DEFAULTS.eloCoeff}
          />

          <ModSlider
            label="Equilibratore (shrink)"
            description="Avvicina i gol attesi delle due squadre verso la loro media. Più alto = partite più equilibrate e più sorprese, distribuzione di vittoria del torneo meno concentrata sulle big. A 0 nessun effetto."
            value={localMod.lambdaShrink}
            min={0} max={0.5} step={0.01}
            effectLabel="riduzione scarto favorita/sfavorita"
            effectValue={`${(localMod.lambdaShrink * 100).toFixed(0)}%`}
            color="#a855f7"
            onChange={(v) => update('lambdaShrink', v)}
            onReset={() => update('lambdaShrink', DEFAULTS.lambdaShrink)}
            defaultValue={DEFAULTS.lambdaShrink}
          />
        </section>

        {/* SEZIONE 2: Scontri diretti H2H */}
        <section className="adm-section" id="adm-sec-h2h">
          <h3 className="adm-section-title">
            Storico H2H — agisce su <em>coppie con almeno 3 precedenti</em>
          </h3>
          <p className="adm-section-desc">
            Per ogni coppia con storico disponibile (dataset 1994–2026), i lambda vengono aggiustati
            in base al win-rate reale vs quello implicito nel modello. Il peso cresce con √n partite
            (massimo a n=20). A 0 lo storico diretto viene ignorato completamente.
            Nota: la maggior parte delle partite dei gironi 2026 ha solo 2–4 precedenti → effetto piccolo (±5–15%).
          </p>
          <ModSlider
            label="Max boost H2H"
            description="Moltiplicatore massimo applicabile ai λ per effetto H2H. Es. 0.25 = ±25% sui gol attesi. Agisce solo se la coppia ha storico sufficiente."
            value={localMod.h2hMaxBoost}
            min={0} max={0.50} step={0.01}
            effectLabel="boost massimo sui λ"
            effectValue={`±${(localMod.h2hMaxBoost * 100).toFixed(0)}%`}
            color="#8b5cf6"
            onChange={(v) => update('h2hMaxBoost', v)}
            onReset={() => update('h2hMaxBoost', DEFAULTS.h2hMaxBoost)}
            defaultValue={DEFAULTS.h2hMaxBoost}
          />
        </section>

        {/* SEZIONE 3: Vantaggio campo */}
        <section className="adm-section" id="adm-sec-home">
          <h3 className="adm-section-title">
            Vantaggio campo — agisce su <em>ogni partita delle 3 ospitanti</em>
          </h3>
          <p className="adm-section-desc">
            USA, Canada e Messico giocano in casa propria. Il vantaggio è in scala log-lambda:
            più è alto, più gol si aspettano dalla squadra ospitante. A 0 il campo non conta nulla.
          </p>

          <ModSlider
            label="Bonus campo (log-λ)"
            description="Applicato ai λ della squadra ospitante (solo USA/CAN/MEX). exp(0.27) ≈ +31% gol attesi. A parità di tutto, la host ha una spinta offensiva."
            value={localMod.homeAdvBoost}
            min={0} max={0.60} step={0.01}
            effectLabel="gol attesi in più in casa"
            effectValue={`+${((Math.exp(localMod.homeAdvBoost) - 1) * 100).toFixed(1)}%`}
            color="#f97316"
            onChange={(v) => update('homeAdvBoost', v)}
            onReset={() => update('homeAdvBoost', DEFAULTS.homeAdvBoost)}
            defaultValue={DEFAULTS.homeAdvBoost}
          />
        </section>

        {/* SEZIONE 4: Esperienza KO */}
        <section className="adm-section" id="adm-sec-ko">
          <h3 className="adm-section-title">
            Esperienza/Maturità — agisce <em>nelle fasi a eliminazione</em>
          </h3>
          <p className="adm-section-desc">
            Chi è abituato alle fasi finali (storia + rendimento knockout) ha un leggero
            vantaggio nelle partite a eliminazione diretta: sia sull'intera gara, sia ai
            rigori in caso di parità. Effetti piccoli, non ribaltano i valori.
          </p>

          <ModSlider
            label="Bonus partita KO"
            description="Quanto l'esperienza sposta i gol attesi nell'INTERA partita a eliminazione diretta (Round of 32 in poi). Con gap massimo (100 pt) e coeff 0.05 → ~±5% gol per la squadra più esperta."
            value={localMod.koMatchCoeff}
            min={0} max={0.15} step={0.005}
            effectLabel="effetto max sui gol (gap 100 pt)"
            effectValue={`±${((Math.exp(localMod.koMatchCoeff) - 1) * 100).toFixed(1)}%`}
            color="#a855f7"
            onChange={(v) => update('koMatchCoeff', v)}
            onReset={() => update('koMatchCoeff', DEFAULTS.koMatchCoeff)}
            defaultValue={DEFAULTS.koMatchCoeff}
          />

          <ModSlider
            label="Bonus rigori KO"
            description="Quanto l'esperienza sposta la probabilità ai rigori (quando la partita finisce in parità nei 90'). Con gap massimo (100 pt) e coeff 0.08 → +8pp sulla probabilità base (es. 52% → 60%)."
            value={localMod.koExperienceCoeff}
            min={0} max={0.20} step={0.005}
            effectLabel="effetto max (gap exp 100 pt)"
            effectValue={`±${(localMod.koExperienceCoeff * 100).toFixed(1)}pp prob. rigori`}
            color="#a855f7"
            onChange={(v) => update('koExperienceCoeff', v)}
            onReset={() => update('koExperienceCoeff', DEFAULTS.koExperienceCoeff)}
            defaultValue={DEFAULTS.koExperienceCoeff}
          />

          <div className="adm-mix-row">
            <div className="adm-mix-header">
              <span className="adm-slider-label">Mix Knockout / Storia nell'indice esperienza</span>
              <span className="adm-mix-vals">
                KO: <strong>{Math.round(localMod.koKnockoutWeight * 100)}%</strong>
                {' · '}
                Storia: <strong>{Math.round(localMod.koHistoryWeight * 100)}%</strong>
              </span>
            </div>
            <p className="adm-slider-desc">
              Knockout = rendimento nelle fasi finali dal 1994 (win rate pesato per torneo).
              Storia = titoli storici nella storia completa del torneo.
            </p>
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
              <span>← 100% Storia</span>
              <span>100% Knockout →</span>
            </div>
          </div>
        </section>

        {/* SEZIONE 5: Pesi degli scenari what-if */}
        <section className="adm-section" id="adm-sec-whatif">
          <h3 className="adm-section-title">
            Scenari what-if — <em>magnitudine degli effetti</em>
          </h3>
          <p className="adm-section-desc">
            Quanto ogni scenario sposta la forza della squadra selezionata, in
            punti Elo-equivalenti. Valori negativi indeboliscono, positivi
            rafforzano. Si applicano alle squadre scelte nel pannello what-if.
          </p>

          <ModSlider
            label="Assenza di un big"
            description="Una stella out (es. infortunio dell'ultimo minuto). Indebolisce la squadra."
            value={localMod.whatIf.missingStar}
            min={-120} max={0} step={5}
            valueLabel={<>valore: <strong>{localMod.whatIf.missingStar} pt</strong></>}
            effectLabel="forza squadra"
            effectValue={`${localMod.whatIf.missingStar} pt Elo`}
            color="#f59e0b"
            onChange={(v) => updateWhatIf('missingStar', v)}
            onReset={() => updateWhatIf('missingStar', DEFAULTS.whatIf.missingStar)}
            defaultValue={DEFAULTS.whatIf.missingStar}
          />
          <ModSlider
            label="Infortuni a 2–3 titolari"
            description="Più assenze pesanti. Riduzione maggiore della forza della squadra."
            value={localMod.whatIf.injuries}
            min={-160} max={0} step={5}
            valueLabel={<>valore: <strong>{localMod.whatIf.injuries} pt</strong></>}
            effectLabel="forza squadra"
            effectValue={`${localMod.whatIf.injuries} pt Elo`}
            color="#ef4444"
            onChange={(v) => updateWhatIf('injuries', v)}
            onReset={() => updateWhatIf('injuries', DEFAULTS.whatIf.injuries)}
            defaultValue={DEFAULTS.whatIf.injuries}
          />
          <ModSlider
            label="Rientro / stato di grazia"
            description="Un big torna al top o la squadra è in forma smagliante. Piccolo bonus."
            value={localMod.whatIf.starReturn}
            min={0} max={80} step={5}
            valueLabel={<>valore: <strong>+{localMod.whatIf.starReturn} pt</strong></>}
            effectLabel="forza squadra"
            effectValue={`+${localMod.whatIf.starReturn} pt Elo`}
            color="#22c55e"
            onChange={(v) => updateWhatIf('starReturn', v)}
            onReset={() => updateWhatIf('starReturn', DEFAULTS.whatIf.starReturn)}
            defaultValue={DEFAULTS.whatIf.starReturn}
          />
          <ModSlider
            label="Squalifica chiave"
            description="Un titolare squalificato. Penalità una-tantum sulla forza."
            value={localMod.whatIf.suspension}
            min={-120} max={0} step={5}
            valueLabel={<>valore: <strong>{localMod.whatIf.suspension} pt</strong></>}
            effectLabel="forza squadra"
            effectValue={`${localMod.whatIf.suspension} pt Elo`}
            color="#f97316"
            onChange={(v) => updateWhatIf('suspension', v)}
            onReset={() => updateWhatIf('suspension', DEFAULTS.whatIf.suspension)}
            defaultValue={DEFAULTS.whatIf.suspension}
          />
        </section>

        {/* SEZIONE 6: Genera classifica forza */}
        <section className="adm-section" id="adm-sec-ranking">
          <h3 className="adm-section-title">
            Classifica forza — <em>squadre ordinate per punteggio</em>
          </h3>
          <p className="adm-section-desc">
            Genera la lista delle 48 squadre con un <strong>Punteggio Forza</strong> (0–100)
            che tiene conto di tutto: parametri del modello, Elo, valore rosa, forma,
            esperienza KO/storia, vantaggio campo e tutti i pesi qui sopra. La lista si
            apre nella pagina <strong>Squadre</strong>, ordinata per forza; clicca una
            squadra per i dettagli (incluso il win-rate medio contro tutte le altre).
          </p>

          {/* Torta: quanto pesa ogni componente sul Punteggio Forza */}
          <div className="adm-pie-block">
            <div className="adm-pie-title">
              Composizione del Punteggio Forza
              <span className="adm-pie-hint">si aggiorna mentre modifichi i pesi</span>
            </div>
            <StrengthPie components={breakdown} />
          </div>

          <button
            className="adm-btn-apply adm-btn-apply--big"
            onClick={() => onGenerateRanking?.(localMod)}
          >
            Genera classifica forza con questi pesi
          </button>
        </section>

        {/* Anteprima effetti live */}
        <LiveExample mod={localMod} />

        {/* Tasto applica in fondo */}
        <div className="adm-footer-actions">
          {isModified && (
            <button className="adm-btn-reset" onClick={resetAll}>↺ Ripristina default</button>
          )}
          <button className="adm-btn-apply" onClick={apply} disabled={applied}>
            {applied ? '✓ Valori pronti' : 'Applica (senza simulare)'}
          </button>
          <button className="adm-btn-apply adm-btn-apply--big" onClick={applyAndSimulate}>
            ▶ Applica e vai alla simulazione
          </button>
        </div>
      </div>
    </div>
  );
}
