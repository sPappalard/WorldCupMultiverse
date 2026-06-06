import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { simulate } from './simulator';
import type { Team } from './types';

const teamsData = JSON.parse(
  readFileSync(new URL('../../public/data/teams.json', import.meta.url), 'utf-8'),
) as { teams: Team[] };

const teams = teamsData.teams;

describe('teams.json sanity', () => {
  it('has 48 active teams + Italy inactive', () => {
    const active = teams.filter((t) => t.active);
    expect(active.length).toBe(48);
    const ita = teams.find((t) => t.id === 'ITA');
    expect(ita?.active).toBe(false);
    expect(ita?.substituteFor).toBe('BIH');
  });

  it('has exactly 4 teams per group (active)', () => {
    const groups = new Map<string, number>();
    for (const t of teams.filter((t) => t.active)) {
      groups.set(t.group, (groups.get(t.group) ?? 0) + 1);
    }
    expect(groups.size).toBe(12);
    for (const [, n] of groups) expect(n).toBe(4);
  });
});

describe('simulate (Elo fallback)', () => {
  it('produces win probabilities summing to ~100%', () => {
    const out = simulate({ teams, params: null, numRuns: 3000, seed: 42 });
    const sum = out.aggregates.reduce((s, a) => s + a.winProb, 0);
    expect(sum).toBeGreaterThan(0.98);
    expect(sum).toBeLessThan(1.02);
  });

  it('favors stronger teams but no team wins 100%', () => {
    const out = simulate({ teams, params: null, numRuns: 5000, seed: 7 });
    const top = out.aggregates[0];
    expect(top.winProb).toBeLessThan(0.5); // no outright dominance
    expect(top.winProb).toBeGreaterThan(0.02);
    // Spain (top Elo) should be among the favorites
    const esp = out.aggregates.find((a) => a.teamId === 'ESP')!;
    expect(esp.winProb).toBeGreaterThan(0.05);
  });

  it('Italy does NOT appear by default, appears with substitution', () => {
    const base = simulate({ teams, params: null, numRuns: 1000, seed: 1 });
    expect(base.aggregates.find((a) => a.teamId === 'ITA')?.winProb ?? 0).toBe(0);

    const withItaly = simulate({
      teams,
      params: null,
      numRuns: 1000,
      seed: 1,
      substitutions: { BIH: 'ITA' },
    });
    const ita = withItaly.aggregates.find((a) => a.teamId === 'ITA');
    expect(ita).toBeDefined();
    expect(ita!.reachRo32Prob).toBeGreaterThan(0);
    // Bosnia excluded when Italy is in
    expect(withItaly.aggregates.find((a) => a.teamId === 'BIH')?.winProb ?? 0).toBe(0);
  });

  it('sample run has a champion and full bracket', () => {
    const out = simulate({ teams, params: null, numRuns: 500, seed: 99 });
    expect(out.sample.championId).toBeTruthy();
    expect(out.sample.knockoutRounds.length).toBe(5);
    expect(Object.keys(out.sample.groupStandings).length).toBe(12);
  });
});
