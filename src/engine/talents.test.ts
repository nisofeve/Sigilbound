import { describe, expect, it } from 'vitest';
import { allTalents, getTalent, talentsByRarity } from './talents';

describe('Talent data', () => {
  it('loads exactly 20 talents per the GDD', () => {
    expect(allTalents()).toHaveLength(20);
  });

  it('rarity distribution matches GDD: 5 common, 5 uncommon, 5 rare, 3 epic, 2 legendary', () => {
    expect(talentsByRarity('common')).toHaveLength(5);
    expect(talentsByRarity('uncommon')).toHaveLength(5);
    expect(talentsByRarity('rare')).toHaveLength(5);
    expect(talentsByRarity('epic')).toHaveLength(3);
    expect(talentsByRarity('legendary')).toHaveLength(2);
  });

  it('all talent ids are unique', () => {
    const ids = allTalents().map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every talent has name + icon + description + modifier', () => {
    for (const t of allTalents()) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.icon.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.modifier).toBeDefined();
    }
  });

  it('Sigilbound Master is legendary', () => {
    const t = getTalent('talent.sigilbound_master');
    expect(t).toBeDefined();
    expect(t?.rarity).toBe('legendary');
  });

  it('Onslaught Amplifier is rare and bumps the onslaught tier', () => {
    const t = getTalent('talent.onslaught_amplifier');
    expect(t?.rarity).toBe('rare');
    expect(t?.modifier.type).toBe('onslaught_tier_bump');
  });

  it('Triple Threat targets Triadic Strike', () => {
    const t = getTalent('talent.triple_threat');
    expect(t?.rarity).toBe('epic');
    expect(t?.modifier.type).toBe('triadic_damage_bonus');
  });
});
