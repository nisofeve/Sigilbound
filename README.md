# Sigilbound

Roguelike deck-building combat card game. HTML5 client (Phaser 3 + React + Vite), Firebase Cloud Functions for cloud code. **Forked from Plotbound v0.1** — see [GDD/sigilbound_gdd.html](GDD/sigilbound_gdd.html) for the design and the migration playbook.

## Status

Sigilbound's combat, collection, progression, deck-building, battle-pass, and
stronghold UI are playable locally. The older Plotbound Phaser flow remains in
the repository for compatibility, but the normal entry point is the Sigilbound
combat hub.

### Plotbound foundation (still active)

Anonymous Firebase Auth signs the player in transparently on first launch, Cloud Functions validate every run with a signed seed token, and the player profile syncs to Firestore. Daily quests track in real time. The game still works fully offline / local-only when no Firebase project is configured.

## Quick start

```sh
npm install
npm run dev:playtest # http://127.0.0.1:5174
npm run playtest:check
npm run playtest:edge # Windows: open Microsoft Edge
npm run assets:compress # convert new PNG card art to delivery-sized WebP
npm test             # vitest — engine combo + season tests
npm run typecheck
```

`dev:playtest` uses a fixed port and fails if that port is occupied. Do not run
multiple Vite servers for the same playtest.

The app boots with cloud sync **off** by default. Drop in Firebase credentials (see below) to enable cloud features.

### Legacy Plotbound route

The retired Plotbound farm flow is available only during local development at
`http://127.0.0.1:5174/?legacy=1`. Production builds always enter Sigilbound.

## Project layout

```
src/
  engine/             # Pure TS — runs in client AND cloud (deterministic)
    rng.ts            # Mulberry32 seeded PRNG (byte-identical client/cloud)
    combos.ts         # Abundance, Garden Variety, Loyal Harvest
    cards.ts          # Loads cards from src/data/*.json
    perks.ts          # Perk modifier composition
    events.ts         # Event card trigger logic
    upgrades.ts       # Farmstead upgrade modifier application
    season.ts         # SeasonRunner state machine + draft + tool effects
    quests.ts         # Daily quest evaluator (Phase 3)
    types.ts          # Shared engine types
  data/               # JSON: cards (seeds, tools), perks, events, upgrades, quests
  game/scenes/        # Phaser scenes
    GameScene.ts      # Plot grid, hand bar, drag/click play, animations
    ActiveModifiersPanel.ts  # Live perk/buff chips with SFX
  game/sfx.ts         # Web Audio synth helpers (placeholder SFX)
  ui/                 # React shell
    HomeScreen.tsx    # Home + cloud status badge + daily quests preview
    PerkLoadoutScreen.tsx
    FarmsteadScreen.tsx
    SettingsScreen.tsx        # Phase 3 — audio, account, reset
    GameView.tsx
    ResultsScreen.tsx
    DraftModal.tsx
  firebase/
    client.ts         # Auth/Firestore/Functions init (null if no env)
    auth.ts           # Anonymous sign-in + state observer
    profileSync.ts    # Firestore profile pull/push
    cloudRun.ts       # Callable wrappers for startRun/submitRun
  storage/profile.ts  # Local profile (localStorage v3)

functions/            # Firebase Cloud Functions (startRun, submitRun, ping)
  src/sign.ts         # HMAC seed token signing
  src/validate.ts     # Reasonableness checks (anti-cheat lite)
  src/types.ts        # Wire types (kept in sync with engine — Phase 5 unifies)
```

## Cloud setup (optional)

Phase 3 runs fully without Firebase credentials. To enable cloud sync locally:

1. `npm install -g firebase-tools`
2. Copy `.firebaserc.example` → `.firebaserc`, set your project id
3. Copy `.env.example` → `.env.local`, fill in `VITE_FIREBASE_*` from the Firebase console
4. Set `VITE_USE_FIREBASE_EMULATOR=true` to point the client at the local suite
5. Build the functions: `cd functions && npm install && npm run build`
6. Start the emulator suite: `firebase emulators:start`
7. Run the client: `npm run dev`

The Home screen shows a badge ("☁️ Anon · synced" / "📴 Local only" / "⚠ Sync offline") so you can see whether cloud is active.

### Production secret

Cloud Functions sign seed tokens with HMAC. Override the dev secret in production:

```sh
firebase functions:config:set runs.secret="$(openssl rand -hex 32)"
# or via env var:
firebase deploy --only functions
```

## Engine determinism

`src/engine/rng.ts` mulberry32 is byte-identical between client and cloud. Phase 3 cloud verifies the *signed seed* round-trips and applies reasonableness checks; Phase 5 will replay the full action log server-side for true anti-cheat.

## Sigilbound migration status

The codebase has been transformed from Plotbound (farming) into Sigilbound
(combat). All 7 migration phases are complete on the engine + UI layer:

- **Phase 1 — vocabulary rename:** combat names, currencies, stats
- **Phase 2 — combat core:** damage, status effects, player combatant, enemy AI, reactions, battle runner (134 tests)
- **Phase 3 — equipment:** 6 slots, 6 rarities, 6 mythic sets (42 tests)
- **Phase 4 — content:** 30 Actions + 20 Tactics + 10 Reactions + 52 equipment + 30 enemies + 100 stages + 20 talents (66 tests)
- **Phase 5 — UI integration:** CombatView (pure React/CSS), CombatHomeScreen, CombatResultScreen
- **Phase 6 — depth:** draw/discard pile, tactic play, talent runtime wiring, Hardcore mode (25 tests)
- **Phase 7 — collection:** combat card inventory, deck builder, daily-rotating Bazaar (11 tests)

**Current totals:** 343 tests across 19 files. Card art ships as 960px WebP
files; the current production build is about 41 MB. Lazy loading remains
future release work.

## Deferred (post-v1)

- **Release-quality verification.** Tests must be reconciled with current
  balance and content before a release gate can pass. Several tests still
  assert superseded values from the original 100-stage design.
- **Browser playtest delivery.** The local Vite server needs a browser running
  on the same host, or a hosted preview. The Codex in-app browser cannot reach
  the local development server.
- **Asset delivery.** Add responsive variants and lazy-load screens or
  galleries that do not need every card image.

- **Server-authoritative combat replay.** Signed combat sessions now store
  authenticated loadout + outcome audit records in `combatRuns`. Rewards stay
  local until action-log replay can run in Cloud Functions. That requires
  extracting the deterministic engine into a package shared by client + cloud.
- **PvP / async duels.** UI not yet built. Engine supports it via shared-seed `BattleConfig`, but social screen still wired to legacy Plotbound flows.
- **999 achievements.** Engine + storage support is in; UI presentation needs the Sigilbound theme pass.
- **Battle Pass.** Same situation — engine ready, UI on legacy theme.
- **Anonymous → Google/Apple account upgrade UI.**
- **Push notifications.**
- **IAP integration.**

## Engine determinism

`src/engine/rng.ts` mulberry32 is byte-identical between client and cloud.
Cloud verifies the signed seed and applies reasonableness checks for farming
runs. Combat stores a signed session and outcome audit record; it does not yet
grant server-authoritative rewards.
