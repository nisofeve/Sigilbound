// Storage barrel — re-exports the public API of the four storage submodules
// so callers can `import { ... } from '@storage/index'` without having to
// know which file holds which helper. Mirrors the engine's own index.ts
// pattern.

export * from './types';
export * from './profile';
export * from './inventory';
export * from './perks';
export * from './shop';
// Phase 7 — combat collection + shop storage helpers.
export * from './combatShop';
