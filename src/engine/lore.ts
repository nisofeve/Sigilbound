// Lore milestone tracking and cosmetic rewards.
//
// Lore unlocks at specific boss milestones (stages 10, 20, ..., 100). Each
// milestone grants a cosmetic reward (card back).

import loreMilestonesJson from '@data/lore_milestones.json';

export interface LoreMilestone {
  stage: number;
  title: string;
  text: string;
  rewardCosmetic: string;
  rewardCosmeticLabel: string;
}

export const ALL_LORE_MILESTONES = loreMilestonesJson as LoreMilestone[];

export function getLoreMilestone(stage: number): LoreMilestone | null {
  return ALL_LORE_MILESTONES.find(m => m.stage === stage) ?? null;
}

export function allLoreMilestones(): LoreMilestone[] {
  return ALL_LORE_MILESTONES.slice();
}

export function loreUnlockedForStage(stage: number, unlockedStages: number[]): boolean {
  return unlockedStages.includes(stage);
}
