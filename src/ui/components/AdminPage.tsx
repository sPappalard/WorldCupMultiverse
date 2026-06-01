/**
 * Pagina Admin — modifica interattiva dei coefficienti modulatori.
 * Ogni slider mostra in tempo reale l'effetto percentuale sui gol attesi
 * o sulla probabilità ai rigori, così è immediato capire cosa si sta cambiando.
 */

import { useState, useCallback } from 'react';
import type { ModulatorConfig } from '../../engine/types';
import { config } from '../../config';

interface Props {
  modulators: ModulatorConfig;
  onChange: (m: ModulatorConfig) => void;
}

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
  koKnockoutWeight: config.modulators.koKnockoutWeight,
  koHistoryWeight: config.modulators.koHistoryWeight,
  homeAdvBoost: config.modulators.homeAdvBoost,
  h2hMaxBoost: config.modulators.h2hMaxBoost,
  lambdaShrink: config.modulators.lambdaShrink,
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
}

function ModSlider({
  label, description, value, min, max, step,
  effectLabel, effectValue, color, onChange, onReset, defaultValue,
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const isModified = Math.abs(value - defaultValue) > 1e-6;

  return (
    <div className="adm-slider-row">
      <div className="adm-slider-header">
        <span className="adm-slider-label">{label}</span>
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
            coeff: <strong>{value.toFixed(3)}</strong>
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

  return (
    <div className="adm-example">
      <h3 className="adm-example-title">📊 Effetti concreti con i valori correnti</h3>
      <div className="adm-example-grid">
        <div className="adm-ex-card">
          <div className="adm-ex-icon">🔥</div>
          <div className="adm-ex-title">Forma eccellente (score 85)</div>
          <div className="adm-ex-val positive">+{formBoostHot.toFixed(1)}% gol attesi</div>
          <div className="adm-ex-sub">es. Senegal, Norvegia, Inghilterra</div>
        </div>
        <div className="adm-ex-card">
          <div className="adm-ex-icon">📉</div>
          <div className="adm-ex-title">Forma negativa (score 30)</div>
          <div className="adm-ex-val negative">{formBoostCold.toFixed(1)}% gol attesi</div>
          <div className="adm-ex-sub">squadra in crisi profonda</div>
        </div>
        <div className="adm-ex-card">
          <div className="adm-ex-icon">💰</div>
          <div className="adm-ex-title">Rosa ricchissima (z+2, ~€1400M)</div>
          <div className="adm-ex-val positive">+{valueBoostRich.toFixed(1)}% gol attesi</div>
          <div className="adm-ex-sub">es. Francia, Inghilterra</div>
        </div>
        <div className="adm-ex-card">
          <div className="adm-ex-icon">🏚️</div>
          <div className="adm-ex-title">Rosa modesta (z−0.5)</div>
          <div className="adm-ex-val negative">{valueBoostPoor.toFixed(1)}% gol attesi</div>
          <div className="adm-ex-sub">es. Haiti, Curaçao</div>
        </div>
        <div className="adm-ex-card">
          <div className="adm-ex-icon">👑</div>
          <div className="adm-ex-title">Elo top (+230 dalla media)</div>
          <div className="adm-ex-val positive">+{eloBoostTop.toFixed(1)}% gol attesi</div>
          <div className="adm-ex-sub">es. Brasile (Elo 1988)</div>
        </div>
        <div className="adm-ex-card">
          <div className="adm-ex-icon">🐣</div>
          <div className="adm-ex-title">Elo basso (−200 dalla media)</div>
          <div className="adm-ex-val negative">{eloBoostLow.toFixed(1)}% gol attesi</div>
          <div className="adm-ex-sub">es. Curaçao, Qatar</div>
        </div>
        <div className="adm-ex-card">
          <div className="adm-ex-icon">🏟️</div>
          <div className="adm-ex-title">Vantaggio campo (USA/CAN/MEX)</div>
          <div className="adm-ex-val positive">+{homeAdvPct.toFixed(1)}% gol in casa</div>
          <div className="adm-ex-sub">exp({mod.homeAdvBoost.toFixed(3)}) applicato solo alle 3 ospitanti</div>
        </div>
        <div className="adm-ex-card adm-ex-card--wide">
          <div className="adm-ex-icon">🧠</div>
          <div className="adm-ex-title">Rigori KO: Italia (exp 72) vs Norvegia (exp 28)</div>
          <div className="adm-ex-val positive">Italia +{koEdge.toFixed(1)}% probabilità</div>
          <div className="adm-ex-sub">bonus esperienza su base coin-flip inclinato verso i λ</div>
        </div>
      </div>
    </div>
  );
}

export function AdminPage({ modulators, onChange }: Props) {
  const [localMod, setLocalMod] = useState<ModulatorConfig>({ ...modulators });
  const [applied, setApplied] = useState(false);

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

  const resetAll = () => {
    setLocalMod({ ...DEFAULTS });
    setApplied(false);
  };

  const apply = () => {
    onChange(localMod);
    setApplied(true);
  };

  const isModified = JSON.stringify(localMod) !== JSON.stringify(DEFAULTS);

  return (
    <div className="adm-page">
      <div className="adm-header">
        <h2 className="adm-title">⚙️ Pannello Admin — Coefficienti Simulatore</h2>
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

      <div className="adm-sections">

        {/* SEZIONE 1: Modulatori su ogni partita */}
        <section className="adm-section">
          <h3 className="adm-section-title">
            🎯 Modulatori λ — agiscono su <em>ogni</em> partita
          </h3>
          <p className="adm-section-desc">
            Questi coefficienti moltiplicano i gol attesi (<em>λ</em>) calcolati dal modello bayesiano core.
            Effetti piccoli e proporzionali: non ribaltano un mismatch, spostano l'ago nelle sfide equilibrate.
          </p>

          <ModSlider
            label="🟢 Forma recente"
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
            label="💰 Valore rosa"
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
            label="🔵 Elo corrente"
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
            label="🎲 Equilibratore (shrink)"
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
        <section className="adm-section">
          <h3 className="adm-section-title">
            📋 Storico H2H — agisce su <em>coppie con almeno 3 precedenti</em>
          </h3>
          <p className="adm-section-desc">
            Per ogni coppia con storico disponibile (dataset 1994–2026), i lambda vengono aggiustati
            in base al win-rate reale vs quello implicito nel modello. Il peso cresce con √n partite
            (massimo a n=20). A 0 lo storico diretto viene ignorato completamente.
            Nota: la maggior parte delle partite dei gironi 2026 ha solo 2–4 precedenti → effetto piccolo (±5–15%).
          </p>
          <ModSlider
            label="📋 Max boost H2H"
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
        <section className="adm-section">
          <h3 className="adm-section-title">
            🏟️ Vantaggio campo — agisce su <em>ogni partita delle 3 ospitanti</em>
          </h3>
          <p className="adm-section-desc">
            USA, Canada e Messico giocano in casa propria. Il vantaggio è in scala log-lambda:
            più è alto, più gol si aspettano dalla squadra ospitante. A 0 il campo non conta nulla.
          </p>

          <ModSlider
            label="🏟️ Bonus campo (log-λ)"
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
        <section className="adm-section">
          <h3 className="adm-section-title">
            🟣 Esperienza/Maturità — agisce <em>solo sui rigori KO</em>
          </h3>
          <p className="adm-section-desc">
            Nelle eliminazioni dirette, quando una partita finisce in parità, la probabilità
            ai rigori viene corretta dall'esperienza storica. Chi ha più storia nei grandi
            tornei parte leggermente avvantaggiato.
          </p>

          <ModSlider
            label="🟣 Peso esperienza KO"
            description="Quanto l'esperienza (knockout + storia) sposta la probabilità ai rigori. Unità: punti percentuali assoluti. Con gap massimo (100 pt) e coeff 0.08 → +8pp sulla probabilità base (es. 52% → 60%)."
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
              <span className="adm-slider-label">⚖️ Mix Knockout / Storia nell'indice esperienza</span>
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

        {/* Anteprima effetti live */}
        <LiveExample mod={localMod} />

        {/* Tasto applica in fondo */}
        <div className="adm-footer-actions">
          {isModified && (
            <button className="adm-btn-reset" onClick={resetAll}>↺ Ripristina default</button>
          )}
          <button className="adm-btn-apply adm-btn-apply--big" onClick={apply} disabled={applied}>
            {applied ? '✓ Valori applicati al simulatore' : '▶ Applica e ri-simula'}
          </button>
        </div>
      </div>
    </div>
  );
}
