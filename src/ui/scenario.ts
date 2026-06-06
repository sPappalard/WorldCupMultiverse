/**
 * What-if "scenario" handling: the user-selected state, its translation into
 * engine input, and URL encoding/decoding.
 */

import type { SimInput } from '../engine/simulator';
import type { Team, ModulatorConfig, WhatIfWeights } from '../engine/types';
import { config, whatIfFactors, type WhatIfFactorId } from '../config';

/** A single applied factor instance (stackable). */
export interface AppliedFactor {
  id: WhatIfFactorId;
  /** Target teams (for needsTeam factors). Multiple teams = effect on all. */
  teamIds?: string[];
  /** Magnitude override (Elo-equivalent); uses the Admin weight if absent. */
  eloDelta?: number;
}

export interface Scenario {
  italy: boolean;
  factors: AppliedFactor[];
  /** Chaos slider 0–100. */
  chaos: number;
}

export const emptyScenario: Scenario = { italy: false, factors: [], chaos: 0 };

/** Convert an Elo-equivalent delta into a strength delta (attack+defense). */
function eloDeltaToStrength(eloDelta: number): { attack: number; defense: number } {
  const { scalePer100Elo, attackShare } = config.eloToStrength;
  const edge = (eloDelta / 100) * scalePer100Elo;
  return { attack: edge * attackShare, defense: edge * (1 - attackShare) };
}

/** A factor's default (Elo-equivalent) magnitude, from the Admin weights. */
function factorDefaultDelta(id: WhatIfFactorId, weights: WhatIfWeights): number {
  switch (id) {
    case 'missingStar': return weights.missingStar;
    case 'injuries': return weights.injuries;
    case 'starReturn': return weights.starReturn;
    case 'suspension': return weights.suspension;
    default: return 0;
  }
}

/**
 * Translate the UI scenario into input ready for simulate().
 * @param modulators the effective modulators (to read what-if weights from Admin).
 */
export function scenarioToSimInput(
  scenario: Scenario,
  teams: Team[],
  modulators?: ModulatorConfig,
): Partial<SimInput> {
  const substitutions: Record<string, string> = {};
  if (scenario.italy) substitutions.BIH = 'ITA';

  const weights = modulators?.whatIf ?? config.modulators.whatIf;
  const overrides: Record<string, { attack: number; defense: number }> = {};
  for (const f of scenario.factors) {
    const def = whatIfFactors.find((d) => d.id === f.id);
    if (!def || def.isSlider || def.flagship) continue;
    const teamIds = f.teamIds ?? [];
    if (teamIds.length === 0) continue;
    const eloDelta = f.eloDelta ?? factorDefaultDelta(f.id, weights);
    const d = eloDeltaToStrength(eloDelta);
    // The same factor applies to each selected team; multiple factors on the
    // same team sum up (stackable).
    for (const teamId of teamIds) {
      const prev = overrides[teamId] ?? { attack: 0, defense: 0 };
      overrides[teamId] = {
        attack: prev.attack + d.attack,
        defense: prev.defense + d.defense,
      };
    }
  }
  void teams;
  return {
    substitutions,
    strengthOverrides: overrides,
    chaos: scenario.chaos / 100,
  };
}

// --- URL encoding (compact, semi-readable) ---
// format: ?s=<italy:0|1>.<chaos>.<factor1>~<factor2>...
// factor: id:teamId1-teamId2-...:eloDelta

export function scenarioToUrl(scenario: Scenario): string {
  const parts = [
    scenario.italy ? '1' : '0',
    String(scenario.chaos),
    scenario.factors
      .map((f) => `${f.id}:${(f.teamIds ?? []).join('-')}:${f.eloDelta ?? ''}`)
      .join('~'),
  ];
  return parts.join('.');
}

export function scenarioFromUrl(s: string | null): Scenario {
  if (!s) return { ...emptyScenario };
  try {
    const [italy, chaos, factorsStr] = s.split('.');
    const factors: AppliedFactor[] = (factorsStr || '')
      .split('~')
      .filter(Boolean)
      .map((f) => {
        const [id, teamsPart, eloDelta] = f.split(':');
        // Back-compat: old links had a single team without "-".
        const teamIds = (teamsPart || '')
          .split('-')
          .filter(Boolean);
        return {
          id: id as WhatIfFactorId,
          teamIds: teamIds.length ? teamIds : undefined,
          eloDelta: eloDelta ? Number(eloDelta) : undefined,
        };
      });
    return {
      italy: italy === '1',
      chaos: Number(chaos) || 0,
      factors,
    };
  } catch {
    return { ...emptyScenario };
  }
}
