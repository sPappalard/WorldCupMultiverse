/**
 * Web Worker: esegue la simulazione Monte Carlo fuori dal main thread, così la
 * UI resta fluida (spinner animato) anche durante le 100k run.
 *
 * Le Map non sono strutturate-clonabili in modo affidabile attraverso i tipi
 * del nostro dominio, quindi le serializziamo come array di entries nel
 * messaggio in ingresso e le ricostruiamo qui.
 */
import { simulate, type SimInput } from '../engine/simulator';
import type { H2HRecord, TeamStats, SampleRun } from '../engine/types';

/** Payload del messaggio: SimInput con le Map appiattite in entries. */
export interface SimWorkerRequest {
  teams: SimInput['teams'];
  params: SimInput['params'];
  h2hEntries?: [string, H2HRecord][];
  teamStatsEntries?: [string, TeamStats][];
  strengthOverrides?: SimInput['strengthOverrides'];
  substitutions?: SimInput['substitutions'];
  numRuns?: number;
  seed?: number;
  chaos?: number;
  modulators?: SimInput['modulators'];
}

export type SimWorkerMessage =
  | { type: 'sample'; sample: SampleRun }
  | { type: 'progress'; fraction: number }
  | { type: 'done'; result: ReturnType<typeof simulate> }
  | { type: 'error'; message: string };

self.onmessage = (e: MessageEvent<SimWorkerRequest>) => {
  const req = e.data;
  try {
    const input: SimInput = {
      teams: req.teams,
      params: req.params,
      h2h: req.h2hEntries ? new Map(req.h2hEntries) : undefined,
      teamStats: req.teamStatsEntries ? new Map(req.teamStatsEntries) : undefined,
      strengthOverrides: req.strengthOverrides,
      substitutions: req.substitutions,
      numRuns: req.numRuns,
      seed: req.seed,
      chaos: req.chaos,
      modulators: req.modulators,
      onProgress: (fraction) => {
        const msg: SimWorkerMessage = { type: 'progress', fraction };
        self.postMessage(msg);
      },
      onSample: (sample) => {
        // Notifica la sample run appena pronta: il cinema può già partire.
        const msg: SimWorkerMessage = { type: 'sample', sample };
        self.postMessage(msg);
      },
    };
    const result = simulate(input);
    const msg: SimWorkerMessage = { type: 'done', result };
    self.postMessage(msg);
  } catch (err) {
    const msg: SimWorkerMessage = {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(msg);
  }
};
