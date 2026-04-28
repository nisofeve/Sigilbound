import { describe, expect, it } from 'vitest';
import {
  allEquipment,
  equipmentBySetId,
  equipmentBySlot,
  getEquipment,
} from './equipmentCatalog';
import { EQUIPMENT_SLOTS } from './equipment';

describe('Equipment catalog', () => {
  it('loads at least 48 pieces (representative core)', () => {
    expect(allEquipment().length).toBeGreaterThanOrEqual(48);
  });

  it('every piece has a known slot', () => {
    for (const e of allEquipment()) {
      expect(EQUIPMENT_SLOTS).toContain(e.slot);
    }
  });

  it('ids are unique', () => {
    const ids = allEquipment().map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every slot has at least one common-rarity piece', () => {
    for (const slot of EQUIPMENT_SLOTS) {
      const list = equipmentBySlot(slot);
      const hasCommon = list.some(e => e.rarity === 'common');
      expect(hasCommon, `slot ${slot} missing a common piece`).toBe(true);
    }
  });

  it('every slot has at least one rare-or-better piece', () => {
    for (const slot of EQUIPMENT_SLOTS) {
      const list = equipmentBySlot(slot);
      const hasUpper = list.some(e => ['rare', 'epic', 'legendary', 'mythic'].includes(e.rarity));
      expect(hasUpper, `slot ${slot} missing high-tier piece`).toBe(true);
    }
  });

  it('all 6 mythic sets have at least 2 pieces (so 2pc bonus is achievable)', () => {
    const sets = ['phoenix', 'glacier', 'wraith', 'warden', 'hunter', 'sigilbound'];
    for (const setId of sets) {
      const pieces = equipmentBySetId(setId);
      expect(pieces.length, `set ${setId} too small`).toBeGreaterThanOrEqual(2);
    }
  });

  it('getEquipment returns a def by id', () => {
    expect(getEquipment('iron_shortsword')?.name).toBe('Iron Shortsword');
    expect(getEquipment('nope')).toBeUndefined();
  });

  it('every piece has at least one stat OR one trigger OR a setId', () => {
    for (const e of allEquipment()) {
      const hasStats = Object.keys(e.stats).length > 0;
      const hasTriggers = (e.triggers?.length ?? 0) > 0;
      const hasSet = !!e.setId;
      const hasDeck = (e.deckAdditions?.length ?? 0) > 0;
      expect(hasStats || hasTriggers || hasSet || hasDeck, `${e.id} is empty`).toBe(true);
    }
  });
});
