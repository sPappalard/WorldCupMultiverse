/**
 * Geometria del bracket simmetrico, condivisa tra il cinema (animato) e la
 * dashboard (statico). Layout classico playoff: metà match a sinistra, metà a
 * destra, finale al centro; i round interni convergono verso il centro.
 */

export const CARD_W   = 150;  // larghezza box partita
export const CARD_H   = 64;   // altezza box partita
export const COL_GAP  = 32;   // spazio orizzontale tra colonne
export const ROW_BASE = 78;   // slot verticale per match del R32

export interface PlacedMatch {
  roundIdx: number;
  matchIdx: number;
  side: 'L' | 'R' | 'C';
  x: number; y: number;     // angolo alto-sx
  cx: number; cy: number;   // centro
  cardH: number;
  parentRoundIdx: number;
  parentMatchIdx: number;
}

/**
 * Posiziona ogni match del tabellone in coordinate "mondo".
 *  col 0: R32-L … col finalIdx: Finale … col 2*finalIdx: R32-R
 * Il padre di un match (r, localIdx) è il match (r+1, floor(localIdx/2)) dello
 * stesso lato — usato per disegnare i connettori.
 */
export function buildBracketLayout(rounds: { matches: unknown[] }[]) {
  const nRounds  = rounds.length;
  const finalIdx = nRounds - 1;
  const r32Count = rounds[0]?.matches.length ?? 0;
  const perSide0 = r32Count / 2;

  const colSpan = CARD_W + COL_GAP;
  const worldH  = perSide0 * ROW_BASE;
  const centerY = worldH / 2;
  const worldW  = (2 * finalIdx + 1) * colSpan;

  const placed: PlacedMatch[] = [];

  for (let r = 0; r < nRounds; r++) {
    const total = rounds[r].matches.length;
    const cH    = CARD_H;

    if (r === finalIdx) {
      placed.push({
        roundIdx: r, matchIdx: 0, side: 'C',
        x: finalIdx * colSpan, y: centerY - cH / 2,
        cx: finalIdx * colSpan + CARD_W / 2, cy: centerY,
        cardH: cH, parentRoundIdx: -1, parentMatchIdx: -1,
      });
      continue;
    }

    const perSide = total / 2;
    const step    = worldH / perSide;

    for (let i = 0; i < total; i++) {
      const side: 'L' | 'R' = i < perSide ? 'L' : 'R';
      const localIdx = side === 'L' ? i : i - perSide;
      const col = side === 'L' ? r : (2 * finalIdx - r);
      const x   = col * colSpan;
      const y   = localIdx * step + step / 2 - cH / 2;

      const nextTotal   = rounds[r + 1]?.matches.length ?? 0;
      const perSideNext = nextTotal / 2;
      const isNextFinal = r + 1 === finalIdx;
      const parentMatchIdx = isNextFinal
        ? 0
        : side === 'L'
          ? Math.floor(localIdx / 2)
          : perSideNext + Math.floor(localIdx / 2);

      placed.push({
        roundIdx: r, matchIdx: i, side,
        x, y, cx: x + CARD_W / 2, cy: y + cH / 2,
        cardH: cH,
        parentRoundIdx: r + 1, parentMatchIdx,
      });
    }
  }

  return { placed, worldW, worldH, colSpan, finalIdx, perSide0 };
}
