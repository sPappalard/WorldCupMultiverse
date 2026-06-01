/**
 * Gestione dello "scenario" what-if: stato selezionato dall'utente,
 * traduzione in input per il motore, ed encoding/decoding in URL (§9).
 */

import type { SimInput } from '../engine/simulator';
import type { Team } from '../engine/types';
import { config, whatIfFactors, type WhatIfFactorId } from '../config';

/** Una singola istanza di fattore applicata (impilabile). */
export interface AppliedFactor {
  id: WhatIfFactorId;
  /** Squadra target (per i fattori needsTeam). */
  teamId?: string;
  /** Override di magnitudine (Elo-equivalente); usa default se assente. */
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

/** Traduce lo scenario UI in input pronti per simulate(). */
export function scenarioToSimInput(scenario: Scenario, teams: Team[]): Partial<SimInput> {
  const substitutions: Record<string, string> = {};
  if (scenario.italy) substitutions.BIH = 'ITA';

  const overrides: Record<string, { attack: number; defense: number }> = {};
  for (const f of scenario.factors) {
    const def = whatIfFactors.find((d) => d.id === f.id);
    if (!def || def.isSlider || def.flagship) continue;
    if (!f.teamId) continue;
    const eloDelta = f.eloDelta ?? def.defaultEloDelta ?? 0;
    const d = eloDeltaToStrength(eloDelta);
    const prev = overrides[f.teamId] ?? { attack: 0, defense: 0 };
    overrides[f.teamId] = {
      attack: prev.attack + d.attack,
      defense: prev.defense + d.defense,
    };
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
// factor: id:teamId:eloDelta

export function scenarioToUrl(scenario: Scenario): string {
  const parts = [
    scenario.italy ? '1' : '0',
    String(scenario.chaos),
    scenario.factors
      .map((f) => `${f.id}:${f.teamId ?? ''}:${f.eloDelta ?? ''}`)
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
        const [id, teamId, eloDelta] = f.split(':');
        return {
          id: id as WhatIfFactorId,
          teamId: teamId || undefined,
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
