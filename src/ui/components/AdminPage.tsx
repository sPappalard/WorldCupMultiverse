/**
 * Pagina Admin — modifica interattiva dei coefficienti modulatori.
 * Ogni slider mostra in tempo reale l'effetto percentuale sui gol attesi
 * o sulla probabilità ai rigori, così è immediato capire cosa si sta cambiando.
 */

import { useState, useCallback, useMemo } from 'react';
import type { ModulatorConfig, Team, ModelParams, H2HRecord, TeamStats } from '../../engine/types';
import { config } from '../../config';
import { computeStrengthBreakdown } from '../../engine/strengthScore';
import { StrengthPie } from './StrengthPie';

interface Props {
  modulators: ModulatorConfig;
  onChange: (m: ModulatorConfig) => void;
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
  { id: 'adm-sec-lambda', label: '🎯 Modulatori λ' },
  { id: 'adm-sec-h2h', label: '📋 Storico H2H' },
  { id: 'adm-sec-home', label: '🏟️ Vantaggio campo' },
  { id: 'adm-sec-ko', label: '🟣 Esperienza KO' },
  { id: 'adm-sec-whatif', label: '🔮 What-if' },
  { id: 'adm-sec-ranking', label: '🏆 Classifica forza' },
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

export function AdminPage({ modulators, onChange, onGenerateRanking, teams, params, h2h, teamStats }: Props) {
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

  // Scomposizione del Punteggio Forza, reattiva agli slider correnti.
  const breakdown = useMemo(
    () => computeStrengthBreakdown({ teams, params, h2h, teamStats, modulators: localMod }),
    [teams, params, h2h, teamStats, localMod],
  );

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
        <section className="adm-section" id="adm-sec-h2h">
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
        <section className="adm-section" id="adm-sec-home">
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
        <section className="adm-section" id="adm-sec-ko">
          <h3 className="adm-section-title">
            🟣 Esperienza/Maturità — agisce <em>nelle fasi a eliminazione</em>
          </h3>
          <p className="adm-section-desc">
            Chi è abituato alle fasi finali (storia + rendimento knockout) ha un leggero
            vantaggio nelle partite a eliminazione diretta: sia sull'intera gara, sia ai
            rigori in caso di parità. Effetti piccoli, non ribaltano i valori.
          </p>

          <ModSlider
            label="🟣 Bonus partita KO"
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
            label="🟣 Bonus rigori KO"
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

        {/* SEZIONE 5: Pesi degli scenari what-if */}
        <section className="adm-section" id="adm-sec-whatif">
          <h3 className="adm-section-title">
            🔮 Scenari what-if — <em>magnitudine degli effetti</em>
          </h3>
          <p className="adm-section-desc">
            Quanto ogni scenario sposta la forza della squadra selezionata, in
            punti Elo-equivalenti. Valori negativi indeboliscono, positivi
            rafforzano. Si applicano alle squadre scelte nel pannello what-if.
          </p>

          <ModSlider
            label="🚑 Assenza di un big"
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
            label="🩼 Infortuni a 2–3 titolari"
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
            label="🔥 Rientro / stato di grazia"
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
            label="🟥 Squalifica chiave"
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
            🏆 Classifica forza — <em>squadre ordinate per punteggio</em>
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
            🏆 Genera classifica forza con questi pesi
          </button>
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
