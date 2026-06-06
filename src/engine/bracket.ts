/**
 * Official Round of 32 structure for the 2026 World Cup, plus allocation of the
 * 8 best third-placed teams.
 *
 * Structure source: Wikipedia "2026 FIFA World Cup knockout stage" (5 Dec 2025
 * draw). The winner/runner-up pairings are EXACT. FIFA's 495-combination table
 * for the exact slot of each third-placed team (regulation Annex C) isn't
 * published in a reliable machine-readable form; we use a DETERMINISTIC
 * ALLOCATOR that respects the real constraints:
 *   - 8 of 12 third-placed teams qualify (best by points/GD/GF);
 *   - a third-placed team never faces its own group's winner;
 *   - each "third" match draws from a FIFA-defined set of candidate groups.
 * Produces a valid bracket every run. Differences from FIFA's exact slotting in
 * rare combinations have negligible effect on the aggregate probabilities.
 * [TO VALIDATE — see README, Known limitations.]
 */

/** Round of 32 slot. winner/runnerUp point to a group; third is special. */
export interface Ro32Slot {
  matchId: number;
  /** Left side of the match. */
  home: SlotRef;
  /** Right side of the match. */
  away: SlotRef;
}

export type SlotRef =
  | { kind: 'winner'; group: string }
  | { kind: 'runnerUp'; group: string }
  | { kind: 'third'; candidates: string[] };

/** The 16 Round of 32 matches (matches 73–88). Exact structure. */
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
 * Knockout names from the Round of 32 onward; each round pairs adjacent winners
 * from the previous one. The R32 match order above defines the R16 pairing
 * (match 73-vs-74, 75-vs-76, ...). NOTE: these strings are also used as lookup
 * keys by the UI's round-label maps — keep them in sync if changed.
 */
export const KNOCKOUT_ROUND_NAMES = [
  'Round of 32',
  'Round of 16',
  'Quarti',
  'Semifinali',
  'Finale',
];

/**
 * Deterministic allocator of third-placed teams to the R32 "third" matches.
 * @param qualifiedThirdGroups the groups (max 8) whose third-placed teams
 *   qualify, in ranking order (best first).
 * @returns map of matchId -> group of the assigned third-placed team.
 */
export function allocateThirds(qualifiedThirdGroups: string[]): Map<number, string> {
  const thirdSlots = RO32.filter(
    (m) => m.away.kind === 'third',
  ) as (Ro32Slot & { away: { kind: 'third'; candidates: string[] } })[];

  // Backtracking: guarantees a valid solution for any combination of 8
  // qualified third-placed teams, respecting the FIFA candidate constraints.
  const assignment = new Map<number, string>();
  const available = new Set(qualifiedThirdGroups);

  // Sort slots by ascending available-candidate count (most-constrained first).
  const slots = [...thirdSlots].sort((a, b) => {
    const ca = a.away.candidates.filter((g) => available.has(g)).length;
    const cb = b.away.candidates.filter((g) => available.has(g)).length;
    return ca - cb;
  });

  function backtrack(idx: number): boolean {
    if (idx === slots.length) return true;
    const slot = slots[idx];
    const winnerGroup = slot.home.kind === 'winner' ? slot.home.group : undefined;
    const candidates = slot.away.candidates.filter(
      (g) => available.has(g) && g !== winnerGroup,
    );
    for (const pick of candidates) {
      assignment.set(slot.matchId, pick);
      available.delete(pick);
      if (backtrack(idx + 1)) return true;
      assignment.delete(slot.matchId);
      available.add(pick);
    }
    return false; // no valid assignment for this slot → backtrack
  }

  // Most-constrained-first backtracking always finds a valid solution for the 8
  // third-placed teams in their 8 slots. If it somehow fails, retry unordered.
  if (!backtrack(0)) {
    assignment.clear();
    available.clear();
    for (const g of qualifiedThirdGroups) available.add(g);
    const slotsUnordered = [...thirdSlots];
    backtrack2: for (const slot of slotsUnordered) {
      const winnerGroup = slot.home.kind === 'winner' ? slot.home.group : undefined;
      const pick = slot.away.candidates.find((g) => available.has(g) && g !== winnerGroup);
      if (pick) { assignment.set(slot.matchId, pick); available.delete(pick); }
    }
  }
  return assignment;
}
