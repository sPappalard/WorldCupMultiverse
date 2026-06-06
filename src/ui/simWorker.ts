/**
 * Web Worker: runs the Monte Carlo simulation off the main thread so the UI
 * stays smooth (animated spinner) even during the 100k runs.
 *
 * Maps don't structured-clone reliably through our domain types, so we
 * serialize them as entry arrays in the request message and rebuild them here.
 */
import { simulate, type SimInput } from '../engine/simulator';
import type { H2HRecord, TeamStats, SampleRun } from '../engine/types';

/** Message payload: SimInput with the Maps flattened to entries. */
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
        // Notify the sample run as soon as it's ready: the cinema can start.
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
