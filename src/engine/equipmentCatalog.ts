// Loader for the equipment data file. Mirrors actionCards.ts in shape.
//
// The data file is a JSON array of `EquipmentDef`. We freeze the array at
// import time so callers can't accidentally mutate the source.

import type { EquipmentDef, EquipmentSlot } from './equipment';
import equipmentData from '../data/equipment.json';

const ALL: ReadonlyArray<EquipmentDef> = Object.freeze(
  (equipmentData as EquipmentDef[]).map(e => Object.freeze(e)),
);
const BY_ID = new Map(ALL.map(e => [e.id, e]));
const BY_SLOT = new Map<EquipmentSlot, EquipmentDef[]>();
for (const def of ALL) {
  const list = BY_SLOT.get(def.slot) ?? [];
  list.push(def);
  BY_SLOT.set(def.slot, list);
}

export function allEquipment(): ReadonlyArray<EquipmentDef> { return ALL; }

export function getEquipment(id: string): EquipmentDef | undefined {
  return BY_ID.get(id);
}

export function equipmentBySlot(slot: EquipmentSlot): ReadonlyArray<EquipmentDef> {
  return BY_SLOT.get(slot) ?? [];
}

export function equipmentBySetId(setId: string): ReadonlyArray<EquipmentDef> {
  return ALL.filter(e => e.setId === setId);
}
