import { useRef } from 'react';
import type { TeamAggregate, Team } from '../../engine/types';
import type { Scenario } from '../scenario';

interface Props {
  aggregates: TeamAggregate[];
  teamsById: Map<string, Team>;
  scenario: Scenario;
  shareUrl: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Disegna la card su un canvas e la offre come download PNG (§9). */
function drawCard(
  canvas: HTMLCanvasElement,
  aggregates: TeamAggregate[],
  teamsById: Map<string, Team>,
  scenario: Scenario,
): void {
  const W = 1200;
  const H = 630;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Sfondo
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#0b132b');
  grad.addColorStop(1, '#1c2541');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Titolo
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 46px system-ui, sans-serif';
  ctx.fillText('MonteCalcio — Mondiali 2026', 60, 90);

  ctx.font = '24px system-ui, sans-serif';
  ctx.fillStyle = '#9fb3c8';
  const subtitle = scenario.italy
    ? "🇮🇹 E se l'Italia ci fosse? — simulazione Monte Carlo"
    : 'Simulazione Monte Carlo del torneo';
  ctx.fillText(subtitle, 60, 130);

  // Top 6
  const top = aggregates.filter((a) => a.winProb > 0).slice(0, 6);
  let y = 200;
  ctx.font = 'bold 34px system-ui, sans-serif';
  top.forEach((a, i) => {
    const t = teamsById.get(a.teamId);
    const isItaly = a.teamId === 'ITA';
    ctx.fillStyle = isItaly ? '#5cb85c' : '#ffffff';
    ctx.fillText(`${i + 1}. ${t?.name ?? a.teamId}`, 60, y);
    ctx.fillStyle = '#46d39a';
    ctx.textAlign = 'right';
    ctx.fillText(pct(a.winProb), 560, y);
    ctx.textAlign = 'left';
    y += 56;
  });

  // Affermazione discutibile
  const challenger = aggregates.filter((a) => a.winProb > 0)[3];
  if (challenger) {
    ctx.font = 'italic 26px system-ui, sans-serif';
    ctx.fillStyle = '#ffd166';
    const t = teamsById.get(challenger.teamId);
    wrapText(
      ctx,
      `«Il modello dà ${t?.name} al ${pct(challenger.winProb)} — d'accordo?»`,
      640,
      230,
      500,
      36,
    );
  }

  // Footer
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillStyle = '#6c7a89';
  ctx.fillText('Metodo Monte Carlo · Poisson-Dixon-Coles · 100% client-side', 60, H - 40);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word + ' ';
      y += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, y);
}

export function ShareCard({ aggregates, teamsById, scenario, shareUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generate = () => {
    if (canvasRef.current) drawCard(canvasRef.current, aggregates, teamsById, scenario);
  };

  const download = () => {
    generate();
    const canvas = canvasRef.current!;
    const link = document.createElement('a');
    link.download = 'montecalcio-2026.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const top = aggregates.filter((a) => a.winProb > 0).slice(0, 3);
  const linkedinText = buildLinkedInText(top, teamsById, scenario, shareUrl);

  const copyText = () => navigator.clipboard.writeText(linkedinText);
  const copyLink = () => navigator.clipboard.writeText(shareUrl);

  return (
    <div className="card">
      <h2>Condividi il tuo scenario</h2>
      <canvas ref={canvasRef} className="share-canvas" />
      <div className="share-actions">
        <button onClick={download}>⬇️ Scarica card PNG</button>
        <button onClick={copyText}>📋 Copia testo LinkedIn</button>
        <button onClick={copyLink}>🔗 Copia link scenario</button>
      </div>
      <details>
        <summary className="small muted">Anteprima testo</summary>
        <pre className="share-text">{linkedinText}</pre>
      </details>
    </div>
  );
}

function buildLinkedInText(
  top: TeamAggregate[],
  teamsById: Map<string, Team>,
  scenario: Scenario,
  url: string,
): string {
  const lines: string[] = [];
  if (scenario.italy) {
    lines.push("L'Italia non c'è ai Mondiali 2026. Così l'ho rimessa dentro io. 🇮🇹");
    const ita = top.find((t) => t.teamId === 'ITA');
    if (ita) lines.push(`Con l'Italia nel Girone B, vittoria al ${pct(ita.winProb)}.`);
  } else {
    lines.push('Ho simulato i Mondiali 2026 con il metodo Monte Carlo. 🏆');
  }
  lines.push('');
  lines.push('Top 3 secondo il modello:');
  top.forEach((a, i) => {
    lines.push(`${i + 1}. ${teamsById.get(a.teamId)?.name} — ${pct(a.winProb)}`);
  });
  lines.push('');
  lines.push(`Prova il tuo scenario: ${url}`);
  lines.push('#Mondiali2026 #DataScience #ProductManagement');
  return lines.join('\n');
}
