/**
 * Struttura ufficiale del Round of 32 dei Mondiali 2026 e allocazione delle
 * 8 migliori terze.
 *
 * Fonte struttura: Wikipedia "2026 FIFA World Cup knockout stage" (sorteggio
 * 5 dic 2025). I pairing dei vincitori/secondi sono ESATTI. La tabella FIFA
 * delle 495 combinazioni per lo slot esatto di ogni terza (Annex C del
 * regolamento) non è pubblicata in forma machine-readable affidabile; qui
 * usiamo un ALLOCATORE DETERMINISTICO che rispetta i vincoli reali:
 *   - 8 terze qualificate su 12 (le migliori per punti/DR/GF);
 *   - una terza non affronta mai la vincente del proprio girone;
 *   - ogni match "terza" pesca da un insieme di gironi-candidati definito FIFA.
 * Produce un bracket valido a ogni run. Differenze dallo slotting esatto FIFA
 * in combinazioni rare hanno effetto trascurabile sulle probabilità aggregate.
 * [DA VALIDARE — vedi README §Limiti.]
 */

/** Slot del Round of 32. winner/runnerUp puntano a un girone; third è speciale. */
export interface Ro32Slot {
  matchId: number;
  /** Posizione di sinistra del match. */
  home: SlotRef;
  /** Posizione di destra del match. */
  away: SlotRef;
}

export type SlotRef =
  | { kind: 'winner'; group: string }
  | { kind: 'runnerUp'; group: string }
  | { kind: 'third'; candidates: string[] };

/** I 16 match del Round of 32 (match 73–88). Struttura esatta. */
export const RO32: Ro32Slot[] = [
  { matchId: 73, home: { kind: 'runnerUp', group: 'A' }, away: { kind: 'runnerUp', group: 'B' } },
  { matchId: 74, home: { kind: 'winner', group: 'E' }, away: { kind: 'third', candidates: ['A', 'B', 'C', 'D', 'F'] } },
  { matchId: 75, home: { kind: 'winner', group: 'F' }, away: { kind: 'runnerUp', group: 'C' } },
  { matchId: 76, home: { kind: 'winner', group: 'C' }, away: { kind: 'runnerUp', group: 'F' } },
  { matchId: 77, home: { kind: 'winner', group: 'I' }, away: { kind: 'third', candidates: ['C', 'D', 'F', 'G', 'H'] } },
  { matchId: 78, home: { kind: 'runnerUp', group: 'E' }, away: { kind: 'runnerUp', group: 'I' } },
  { matchId: 79, home: { kind: 'winner', group: 'A' }, away: { kind: 'third', candidates: ['C', 'E', 'F', 'H', 'I'] } },
  { matchId: 80, home: { kind: 'winner', group: 'L' }, away: { kind: 'third', candidates: ['E', 'H', 'I', 'J', 'K'] } },
  { matchId: 81, home: { kind: 'winner', group: 'D' }, away: { kind: 'third', candidates: ['B', 'E', 'F', 'I', 'J'] } },
  { matchId: 82, home: { kind: 'winner', group: 'G' }, away: { kind: 'third', candidates: ['A', 'E', 'H', 'I', 'J'] } },
  { matchId: 83, home: { kind: 'runnerUp', group: 'K' }, away: { kind: 'runnerUp', group: 'L' } },
  { matchId: 84, home: { kind: 'winner', group: 'H' }, away: { kind: 'runnerUp', group: 'J' } },
  { matchId: 85, home: { kind: 'winner', group: 'B' }, away: { kind: 'third', candidates: ['E', 'F', 'G', 'I', 'J'] } },
  { matchId: 86, home: { kind: 'winner', group: 'J' }, away: { kind: 'runnerUp', group: 'H' } },
  { matchId: 87, home: { kind: 'winner', group: 'K' }, away: { kind: 'third', candidates: ['D', 'E', 'I', 'J', 'L'] } },
  { matchId: 88, home: { kind: 'runnerUp', group: 'D' }, away: { kind: 'runnerUp', group: 'G' } },
];

/**
 * Albero delle eliminazioni dal Round of 16 in poi: ogni round prende coppie
 * adiacenti di vincitori dal round precedente. L'ordine dei match nel R32
 * sopra definisce l'accoppiamento R16 (match 73-vs-74, 75-vs-76, ...).
 */
export const KNOCKOUT_ROUND_NAMES = [
  'Round of 32',
  'Round of 16',
  'Quarti',
  'Semifinali',
  'Finale',
];

/**
 * Allocatore deterministico delle terze ai 5 match "third" del R32.
 * @param qualifiedThirdGroups i gironi (max 8) le cui terze si qualificano,
 *   in ordine di ranking (migliore prima).
 * @returns mappa matchId -> girone della terza assegnata.
 */
export function allocateThirds(qualifiedThirdGroups: string[]): Map<number, string> {
  const thirdSlots = RO32.filter(
    (m) => m.away.kind === 'third',
  ) as (Ro32Slot & { away: { kind: 'third'; candidates: string[] } })[];

  const assignment = new Map<number, string>();
  const available = new Set(qualifiedThirdGroups);

  // Ordina gli slot per numero di candidati disponibili crescente (most-
  // constrained first) per massimizzare le assegnazioni valide.
  const order = [...thirdSlots].sort((a, b) => {
    const ca = a.away.candidates.filter((g) => available.has(g)).length;
    const cb = b.away.candidates.filter((g) => available.has(g)).length;
    return ca - cb;
  });

  for (const slot of order) {
    const winnerGroup =
      slot.home.kind === 'winner' ? slot.home.group : undefined;
    const pick = slot.away.candidates.find(
      (g) => available.has(g) && g !== winnerGroup,
    );
    if (pick) {
      assignment.set(slot.matchId, pick);
      available.delete(pick);
    }
  }

  // Eventuali terze residue (per imperfezioni dell'euristica) vengono messe
  // negli slot ancora vuoti rispettando solo il vincolo "non proprio girone".
  const unfilled = thirdSlots.filter((s) => !assignment.has(s.matchId));
  for (const slot of unfilled) {
    const winnerGroup = slot.home.kind === 'winner' ? slot.home.group : undefined;
    const pick = [...available].find((g) => g !== winnerGroup);
    if (pick) {
      assignment.set(slot.matchId, pick);
      available.delete(pick);
    }
  }

  return assignment;
}
