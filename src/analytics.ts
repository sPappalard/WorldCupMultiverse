import { track } from '@vercel/analytics';

export const Analytics = {
  simulationRun: (italyActive: boolean) =>
    track('simulation_run', { italy_active: italyActive }),

  italyToggleOn: () =>
    track('italy_toggle_on'),

  shareCardOpened: () =>
    track('share_card_opened'),

  bracketViewed: () =>
    track('bracket_viewed'),

  whatifChanged: (key: string) =>
    track('whatif_changed', { key }),
};
