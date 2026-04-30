// Plotbound foundation (still in use until Phase 5 wires the new combat
// engine into the UI):
export * from './types';
export * from './grades';
export * from './orders';
export * from './levels';
export * from './stages';
export * from './dailyShop';
export * from './rng';
export * from './combos';
export * from './cards';
export * from './perks';
export * from './events';
export * from './upgrades';
export * from './season';
export * from './quests';
export * from './bp';
export * from './achievements';

// Sigilbound combat engine (Phase 2 — additive, parallel to season.ts).
// Phase 5 wires these into the React UI + Phaser scene; until then they live
// as a pure parallel engine for tests + cloud replay.
export * from './damage';
export * from './status';
export * from './player';
export * from './enemy';
export * from './enemyAI';
export * from './reactions';
export * from './equipment';
export * from './battle';

// Sigilbound content layer (Phase 4 — data + loaders).
export * from './actionCards';
export * from './equipmentCatalog';
export * from './bestiary';
export * from './talents';
export * from './stageDef';
export * from './battleFactory';
export * from './upgradeBuffs';
// Phase 7 — combat shop.
export * from './combatShop';