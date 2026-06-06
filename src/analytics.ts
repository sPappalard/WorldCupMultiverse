import { track } from '@vercel/analytics';

export const Analytics = {
  simulationRun: (italyActive: boolean) =>
    track('simulation_run', { italy_active: italyActive }),

  italyToggleOn: () =>
    track('italy_toggle_on'),

  bracketViewed: () =>
    track('bracket_viewed'),
};
