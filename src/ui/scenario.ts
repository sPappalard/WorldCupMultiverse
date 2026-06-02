/**
 * Gestione dello "scenario" what-if: stato selezionato dall'utente,
 * traduzione in input per il motore, ed encoding/decoding in URL (§9).
 */

import type { SimInput } from '../engine/simulator';
import type { Team, ModulatorConfig, WhatIfWeights } from '../engine/types';
import { config, whatIfFactors, type WhatIfFactorId } from '../config';

/** Una singola istanza di fattore applicata (impilabile). */
export interface AppliedFactor {
  id: WhatIfFactorId;
  /** Squadre target (per i fattori needsTeam). Più squadre = effetto su tutte. */
  teamIds?: string[];
  /** Override di magnitudine (Elo-equivalente); usa il peso da Admin se assente. */
  eloDelta?: number;
}

export interface Scenario {
  italy: boolean;
  factors: AppliedFactor[];
  /** Slider caos 0–100. */
  chaos: number;
}

export const emptyScenario: Scenario = { italy: false, factors: [], chaos: 0 };

/** Converte un delta Elo-equivalente in delta di forza (attacco+difesa). */
function eloDeltaToStrength(eloDelta: number): { attack: number; defense: number } {
  const { scalePer100Elo, attackShare } = config.eloToStrength;
  const edge = (eloDelta / 100) * scalePer100Elo;
  return { attack: edge * attackShare, defense: edge * (1 - attackShare) };
}

/** Magnitudine (Elo-equivalente) di default di un fattore, dai pesi Admin. */
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
 * Traduce lo scenario UI in input pronti per simulate().
 * @param modulators i modulatori effettivi (per leggere i pesi what-if da Admin).
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
    // Lo stesso fattore si applica a ogni squadra selezionata; più fattori
    // sulla stessa squadra si sommano (impilabili).
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

// --- URL encoding (compatto, leggibile-ish) ---
// formato: ?s=<italy:0|1>.<chaos>.<factor1>~<factor2>...
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
        // Retrocompatibilità: i vecchi link avevano una sola squadra senza "-".
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
