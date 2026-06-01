import { readFileSync } from 'node:fs';
import { simulate } from '../src/engine/simulator';
import type { H2HRecord } from '../src/engine/types';

const teams = JSON.parse(readFileSync('./public/data/teams.json', 'utf-8')).teams;
const h2hJson = JSON.parse(readFileSync('./public/data/h2h.json', 'utf-8'));
const h2h = new Map<string, H2HRecord>(Object.entries(h2hJson.h2h) as [string, H2HRecord][]);

const base = simulate({ teams, params: null, numRuns: 5000, seed: 42 });
const withH2h = simulate({ teams, params: null, h2h, numRuns: 5000, seed: 42 });

console.log('Squadra | Senza H2H | Con H2H | Delta');
for (const a of withH2h.aggregates.slice(0, 10)) {
  const b = base.aggregates.find((x) => x.teamId === a.teamId)!;
  const delta = (a.winProb - b.winProb) * 100;
  console.log(
    `${a.teamId.padEnd(6)} | ${(b.winProb * 100).toFixed(1).padStart(6)}% | ${(a.winProb * 100).toFixed(1).padStart(5)}% | ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp`,
  );
}
console.log('\nH2H FRA|ITA:', h2hJson.h2h['FRA|ITA']);
console.log('H2H ARG|BRA:', h2hJson.h2h['ARG|BRA']);
