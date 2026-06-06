import type { StrengthComponent } from '../../engine/strengthScore';
import { useT } from '../../i18n';

interface Props {
  components: StrengthComponent[];
}

/** Color per component (consistent with the slider themes). */
const COLORS: Record<StrengthComponent['key'], string> = {
  core: '#46d39a',
  h2h: '#8b5cf6',
  value: '#f59e0b',
  elo: '#3b82f6',
  form: '#22c55e',
  koExp: '#a855f7',
  home: '#f97316',
};

/**
 * Pie chart (conic-gradient, no library) showing how much each component weighs
 * on the Strength Score. Updates when the weights change.
 */
export function StrengthPie({ components }: Props) {
  const { t } = useT();
  // Build the conic-gradient stops by accumulating the percentages.
  let acc = 0;
  const stops: string[] = [];
  for (const c of components) {
    const start = acc;
    acc += c.pct;
    stops.push(`${COLORS[c.key]} ${start.toFixed(2)}% ${acc.toFixed(2)}%`);
  }
  const gradient = `conic-gradient(${stops.join(', ')})`;

  return (
    <div className="sp-wrap">
      <div className="sp-pie" style={{ background: gradient }}>
        <div className="sp-hole" />
      </div>
      <ul className="sp-legend">
        {components.map((c) => (
          <li key={c.key} className="sp-legend-item">
            <span className="sp-swatch" style={{ background: COLORS[c.key] }} />
            <span className="sp-legend-label">{t(`strength.${c.key}`)}</span>
            <span className="sp-legend-pct">{c.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
