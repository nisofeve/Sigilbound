import { useEffect, useRef, useState } from 'react';
import HomeScreen from '@ui/screens/HomeScreen';
import GameView from '@ui/components/GameView';
import ResultsScreen from '@ui/screens/ResultsScreen';
import PerkLoadoutScreen from '@ui/screens/PerkLoadoutScreen';
import FarmsteadScreen from '@ui/screens/FarmsteadScreen';
import SettingsScreen from '@ui/screens/SettingsScreen';
import SocialScreen from '@ui/screens/SocialScreen';
import BattlePassScreen from '@ui/screens/BattlePassScreen';
import AchievementsScreen from '@ui/screens/AchievementsScreen';
import ProfileScreen from '@ui/screens/ProfileScreen';
import OrderPickScreen from '@ui/screens/OrderPickScreen';
import StageInfoModal from '@ui/modals/StageInfoModal';
import StageSelectScreen from '@ui/screens/StageSelectScreen';
import WelcomeModal from '@ui/modals/WelcomeModal';
// Sigilbound combat flow (Phase 5).
import CombatHomeScreen from '@ui/screens/CombatHomeScreen';
import StageIntroScreen from '@ui/screens/StageIntroScreen';
import StageInfoScreen from '@ui/screens/StageInfoScreen';
import CombatResultScreen from '@ui/screens/CombatResultScreen';
import CombatView from '@ui/components/CombatView';
import SigilboundHubScreen from '@ui/screens/SigilboundHubScreen';
import CombatDeckScreen from '@ui/screens/CombatDeckScreen';
import CombatShopScreen from '@ui/screens/CombatShopScreen';
import CardEncyclopediaScreen from '@ui/screens/CardEncyclopediaScreen';
import LeaderboardScreen from '@ui/screens/LeaderboardScreen';
import LoreCardUnlockModal from '@ui/modals/LoreCardUnlockModal';
import CardUpgradeScreen from '@ui/screens/CardUpgradeScreen';
import {
  applyStageOutcomeToProfile,
  applyCombatClearToProfile,
  applyQuestActionToProfile,
  consumeEquippedPerksForRun,
  loadProfile,
  presetToStartingDeck,
  recordRun,
  saveProfile,
  setProfile,
  type Profile,
  type StageRunOutcome,
} from '@storage/index';
import { emptyEquippedSet, type RunResult } from '@engine/index';
import { isCloudEnabled } from '@firebase-app/client';
import { watchAuth, type AuthStatus } from '@firebase-app/auth';
import { pullOrSeedProfile, pushProfile } from '@firebase-app/profileSync';
import { cloudStartRun, cloudSubmitRun } from '@firebase-app/cloudRun';
import type { CloudRunHandle, Screen } from './types';

export default function App() {
  const [profile, setProfileState] = useState<Profile>(() => loadProfile());
  // Sigilbound default — the heraldic combat hub. The legacy Plotbound
  // farm home is still reachable as `{ kind: 'home' }` if a screen routes
  // there explicitly, but no normal flow does anymore.
  const [screen, setScreen] = useState<Screen>({ kind: 'sigilbound_hub' });
  const prevScreenRef = useRef<Screen | null>(null);
  function navigateTo(next: Screen) {
    prevScreenRef.current = screen;
    setScreen(next);
  }
  const [auth, setAuth] = useState<AuthStatus>(
    isCloudEnabled() ? { kind: 'signing_in' } : { kind: 'cloud_disabled' },
  );

  useEffect(() => {
    return watchAuth(async (status) => {
      setAuth(status);
      if (status.kind === 'signed_in') {
        try {
          const cloudProfile = await pullOrSeedProfile(status.uid);
          setProfileState(setProfile(cloudProfile));
        } catch (err) {
          console.warn('[profileSync] pull failed, using local:', err);
        }
      }
    });
  }, []);

  // Fire open_app quest progress once per session — guarded by todayQuestsISO
  // so the increment is harmless if it fires twice in the same UTC day.
  useEffect(() => {
    setProfileState(prev => {
      const next = applyQuestActionToProfile(prev, { kind: 'open_app' });
      if (next === prev) return prev;
      saveProfile(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persistProfile(next: Profile) {
    setProfileState(next);
    if (auth.kind === 'signed_in') {
      void pushProfile(auth.uid, next);
    }
  }

  function activeDeckPayload(): { customDeck: string[]; customDeckGrades: string[]; ownedCardIds: string[] } {
    const preset = profile.deckPresets[profile.activeDeckPreset];
    const ownedCardIds = Object.keys(profile.cardInventory);
    if (!preset) return { customDeck: [], customDeckGrades: [], ownedCardIds };
    const flat = presetToStartingDeck(preset);
    return { customDeck: flat.cards, customDeckGrades: flat.grades, ownedCardIds };
  }

  // Modal state for the stage-info popover. When set, the home screen
  // overlays the StageInfoModal; pressing "Start Farming" from there routes
  // through the perk loadout into the game with that stage's fixed orders.
  const [stageInfoOpen, setStageInfoOpen] = useState<number | { stage: number; hardmode?: boolean } | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [cardUpgradeOpen, setCardUpgradeOpen] = useState(false);
  // Stage numbers of lore milestones unlocked by the just-finished combat run.
  // Drives the post-result LoreCardUnlockModal.
  const [pendingLoreUnlocks, setPendingLoreUnlocks] = useState<number[]>([]);

  function startCombatRun(stage: number, hardmode?: boolean) {
    setScreen({
      kind: 'combat',
      stageNumber: stage,
      talents: [],
      equipment: emptyEquippedSet(),
      hardcore: false,
      hardmode,
      customDeck: profile.combatDeck,
      ownedUpgradeIds: profile.upgradesOwned,
    });
  }

  async function startPvpRun(matchId: string, _sharedSeedFromList: number) {
    if (auth.kind !== 'signed_in') return;
    const cloudStart = await cloudStartRun({
      perks: profile.perksEquipped,
      ownedUpgradeIds: profile.upgradesOwned,
      mode: 'pvp',
      pvpMatchId: matchId,
    });
    if (!cloudStart) return; // cloudStart returns null on auth/network failure
    const cloud: CloudRunHandle = {
      runId: cloudStart.runId,
      token: cloudStart.token,
      startedAt: cloudStart.startedAt,
      mode: 'pvp',
      pvpMatchId: matchId,
    };
    const { customDeck, customDeckGrades, ownedCardIds } = activeDeckPayload();
    setScreen({
      kind: 'order_pick',
      seed: cloudStart.seed,
      perkIds: profile.perksEquipped,
      ownedUpgradeIds: profile.upgradesOwned,
      customDeck,
      customDeckGrades,
      ownedCardIds,
      cloud,
    });
  }

  async function handleSeasonEnd(result: RunResult, cloud: CloudRunHandle | null) {
    const before = profile.bestScore;

    let cloudOutcome: { profile: Profile; questsCompleted: string[]; gemsAwarded: number; achievementsUnlocked: string[] } | null = null;
    if (cloud && auth.kind === 'signed_in') {
      const cloudResp = await cloudSubmitRun({
        runId: cloud.runId,
        token: cloud.token,
        result,
        perksUsed: profile.perksEquipped,
        ownedUpgradeIds: profile.upgradesOwned,
        mode: cloud.mode,
        pvpMatchId: cloud.pvpMatchId,
      });
      if (cloudResp?.accepted) {
        cloudOutcome = {
          profile: setProfile(cloudResp.profile),
          questsCompleted: cloudResp.rewards.questsCompleted,
          gemsAwarded: cloudResp.rewards.gems,
          achievementsUnlocked: cloudResp.rewards.achievementsUnlocked,
        };
      } else if (cloudResp && !cloudResp.accepted) {
        console.warn('[submitRun] rejected:', cloudResp.rejectionReason);
      }
    }

    const outcome = cloudOutcome ?? recordRun(result);
    // Cloud responses don't include stage progression (cloud functions still
    // unaware of stages). Always apply stage outcome locally on top of
    // whichever profile snapshot came back, so stars/unlocks work in both
    // local-only and cloud-synced sessions.
    let outcomeProfile = outcome.profile;
    let stageOutcome: StageRunOutcome | null =
      'stageOutcome' in outcome ? (outcome as { stageOutcome: StageRunOutcome | null }).stageOutcome : null;
    if (cloudOutcome) {
      const applied = applyStageOutcomeToProfile(outcomeProfile, result);
      outcomeProfile = applied.profile;
      stageOutcome = applied.outcome;
    }
    setProfileState(outcomeProfile);
    setScreen({
      kind: 'results',
      result,
      profile: outcomeProfile,
      isNewBest: result.finalCoins > before,
      questsCompleted: outcome.questsCompleted,
      gemsAwarded: outcome.gemsAwarded,
      achievementsUnlocked: outcome.achievementsUnlocked,
      pvpMatchId: cloud?.pvpMatchId,
      stageOutcome,
    });
  }

  return (
    <div className="sb-app-frame h-full w-full overflow-hidden">
      {!profile.tutorialSeen && (
        <WelcomeModal
          onDismiss={() => persistProfile({ ...profile, tutorialSeen: true })}
        />
      )}

      {/* Sigilbound primary entry. Routes to combat home, stronghold,
          profile, settings, deck, shop. */}
      {screen.kind === 'sigilbound_hub' && (
        <SigilboundHubScreen
          profile={profile}
          onProfileChange={persistProfile}
          onCombat={() => setScreen({ kind: 'combat_home' })}
          onStronghold={() => setScreen({ kind: 'farmstead' })}
          onProfile={() => setScreen({ kind: 'profile' })}
          onSettings={() => setScreen({ kind: 'settings' })}
          onDeck={() => setScreen({ kind: 'deck' })}
          onShop={() => setScreen({ kind: 'shop' })}
          onEncyclopedia={() => setScreen({ kind: 'encyclopedia' })}
          onBattlePass={() => setScreen({ kind: 'battlepass' })}
          onLeaderboard={() => setLeaderboardOpen(true)}
        />
      )}
      {screen.kind === 'home' && (
        <HomeScreen
          profile={profile}
          auth={auth}
          onStart={() => setScreen({ kind: 'perks', stage: null })}
          onStartStage={() => setStageInfoOpen(profile.currentStage)}
          onStageSelect={() => setScreen({ kind: 'stage_select' })}
          onFarmstead={() => setScreen({ kind: 'farmstead' })}
          onSettings={() => setScreen({ kind: 'settings' })}
          onSocial={() => setScreen({ kind: 'social' })}
          onBattlePass={() => setScreen({ kind: 'battlepass' })}
          onShop={() => setScreen({ kind: 'shop' })}
          onDeck={() => setScreen({ kind: 'deck' })}
          onProfile={() => setScreen({ kind: 'profile' })}
          onCombat={() => setScreen({ kind: 'combat_home' })}
        />
      )}
      {screen.kind === 'stage_select' && (
        <StageSelectScreen
          profile={profile}
          onProfileChange={persistProfile}
          onPick={(stage, hardmode) => setStageInfoOpen({ stage, hardmode })}
          onBack={() => setScreen({ kind: 'home' })}
          onDeck={() => navigateTo({ kind: 'deck', from: 'stage_select' })}
        />
      )}
      {stageInfoOpen !== null && typeof stageInfoOpen === 'object' && (
        <StageInfoModal
          stage={stageInfoOpen.stage}
          hardmode={stageInfoOpen.hardmode}
          profile={profile}
          onClose={() => setStageInfoOpen(null)}
          onStart={() => {
            const target = stageInfoOpen.stage;
            const hm = stageInfoOpen.hardmode;
            setStageInfoOpen(null);
            setScreen({ kind: 'perks', stage: target, hardmode: hm });
          }}
        />
      )}
      {leaderboardOpen && (
        <LeaderboardScreen
          profile={profile}
          onClose={() => setLeaderboardOpen(false)}
        />
      )}
      {pendingLoreUnlocks.length > 0 && screen.kind !== 'combat_result' && (
        <LoreCardUnlockModal
          stageNumbers={pendingLoreUnlocks}
          onClose={() => setPendingLoreUnlocks([])}
        />
      )}
      {cardUpgradeOpen && (
        <CardUpgradeScreen
          profile={profile}
          onClose={() => setCardUpgradeOpen(false)}
          onProfileChange={persistProfile}
        />
      )}
      {screen.kind === 'profile' && (
        <ProfileScreen
          profile={profile}
          auth={auth}
          onProfileChange={persistProfile}
          onBack={() => setScreen({ kind: 'sigilbound_hub' })}
        />
      )}
      {/* Sigilbound combat deck builder — Phase 7. */}
      {screen.kind === 'deck' && (
        <CombatDeckScreen
          profile={profile}
          onProfileChange={persistProfile}
          from={screen.from}
          onBack={() => {
            const prev = prevScreenRef.current;
            if (screen.from && prev) setScreen(prev);
            else setScreen({ kind: 'sigilbound_hub' });
          }}
        />
      )}
      {screen.kind === 'battlepass' && (
        <BattlePassScreen
          profile={profile}
          auth={auth}
          onProfileChange={persistProfile}
          onBack={() => setScreen({ kind: 'sigilbound_hub' })}
        />
      )}
      {/* Sigilbound combat shop — Phase 7. */}
      {screen.kind === 'shop' && (
        <CombatShopScreen
          profile={profile}
          onProfileChange={persistProfile}
          onBack={() => setScreen({ kind: 'sigilbound_hub' })}
        />
      )}
      {screen.kind === 'perks' && (
        <PerkLoadoutScreen
          profile={profile}
          onProfileChange={persistProfile}
          onStart={() => void startCombatRun(screen.stage ?? 1, screen.hardmode)}
          onBack={() => setScreen({ kind: 'sigilbound_hub' })}
        />
      )}
      {screen.kind === 'farmstead' && (
        <FarmsteadScreen
          profile={profile}
          onProfileChange={persistProfile}
          onBack={() => setScreen({ kind: 'sigilbound_hub' })}
        />
      )}
      {screen.kind === 'settings' && (
        <SettingsScreen
          profile={profile}
          onProfileChange={persistProfile}
          onBack={() => setScreen({ kind: 'sigilbound_hub' })}
        />
      )}
      {screen.kind === 'achievements' && (
        <AchievementsScreen
          profile={profile}
          onBack={() => setScreen({ kind: 'settings' })}
          onProfileChange={persistProfile}
        />
      )}
      {screen.kind === 'social' && (
        <SocialScreen
          profile={profile}
          auth={auth}
          onProfileChange={persistProfile}
          onPlayPvp={(matchId, seed) => void startPvpRun(matchId, seed)}
          onBack={() => setScreen({ kind: 'home' })}
        />
      )}
      {screen.kind === 'order_pick' && (
        <OrderPickScreen
          runSeed={screen.seed}
          onConfirm={(chosenOrders) => {
            // Burn one charge of every consumable perk equipped for this run.
            // Starter perks (Early Bird / Extra Draw) are exempt and stay
            // permanent. We do this here — at the moment the player commits
            // — so quitting mid-run doesn't refund the charges.
            persistProfile(consumeEquippedPerksForRun(profile));
            setScreen({
              kind: 'game',
              seed: screen.seed,
              perkIds: screen.perkIds,
              ownedUpgradeIds: screen.ownedUpgradeIds,
              customDeck: screen.customDeck,
              customDeckGrades: screen.customDeckGrades,
              ownedCardIds: screen.ownedCardIds,
              chosenOrders,
              stageNumber: null, // free play
              cloud: screen.cloud,
            });
          }}
          onBack={() => setScreen({ kind: 'perks', stage: null })}
        />
      )}
      {screen.kind === 'game' && (
        <GameView
          seed={screen.seed}
          perkIds={screen.perkIds}
          ownedUpgradeIds={screen.ownedUpgradeIds}
          customDeck={screen.customDeck}
          customDeckGrades={screen.customDeckGrades}
          ownedCardIds={screen.ownedCardIds}
          chosenOrders={screen.chosenOrders}
          stageNumber={screen.stageNumber}
          isPvp={screen.cloud?.mode === 'pvp'}
          onSeasonEnd={(r) => void handleSeasonEnd(r, screen.cloud)}
          onExit={() => setScreen({ kind: 'home' })}
        />
      )}
      {screen.kind === 'results' && (
        <ResultsScreen
          result={screen.result}
          profile={screen.profile}
          isNewBest={screen.isNewBest}
          questsCompleted={screen.questsCompleted}
          gemsAwarded={screen.gemsAwarded}
          achievementsUnlocked={screen.achievementsUnlocked}
          stageOutcome={screen.stageOutcome}
          isPvp={Boolean(screen.pvpMatchId)}
          onPlayAgain={() => {
            // Stage runs replay the same stage; free play returns to perks
            // for another random-orders run.
            const stage = screen.result.stageNumber ?? null;
            setScreen({ kind: 'perks', stage });
          }}
          onNextStage={() => {
            // Only available when this was a stage run that earned >= 1 star.
            const next = (screen.result.stageNumber ?? 0) + 1;
            if (next >= 1) setStageInfoOpen(next);
            setScreen({ kind: 'home' });
          }}
          onHome={() => setScreen({ kind: 'sigilbound_hub' })}
        />
      )}

      {/* Sigilbound combat flow (Phase 5 — parallel to the farming flow).
          Routed via the "⚔ Combat" entrypoint on the home screen. */}
      {screen.kind === 'combat_home' && (
        <CombatHomeScreen
          profile={profile}
          currentStage={profile.currentStage}
          ownedUpgradeIds={profile.upgradesOwned}
          onBegin={({ stageNumber, talents, equipment, hardcore }) =>
            setScreen({
              kind: 'combat', stageNumber, talents, equipment, hardcore,
              // Phase 7: forward the player's custom combat deck.
              customDeck: profile.combatDeck,
              // Stronghold upgrades — flow into combat as stat mods + buffs.
              ownedUpgradeIds: profile.upgradesOwned,
            })
          }
          onBack={() => setScreen({ kind: 'sigilbound_hub' })}
          onDeck={() => setScreen({ kind: 'deck' })}
          onProfileChange={persistProfile}
        />
      )}
      {screen.kind === 'combat' && (
        <CombatView
          stageNumber={screen.stageNumber}
          playerLevel={1}
          equipment={screen.equipment}
          talents={screen.talents}
          hardcore={screen.hardcore}
          hardmode={screen.hardmode}
          enemyPrestigeLevel={profile.enemyPrestigeLevel}
          initialHp={screen.carryHp}
          customDeck={screen.customDeck}
          ownedUpgradeIds={screen.ownedUpgradeIds}
          cardTierMultipliers={profile.combatCardTiers}
          playerName={profile.displayName ?? 'Sigilist'}
          playerAvatar={profile.avatarEmoji || '⚔️'}
          onOutcome={(outcome, stage, runner) => {
            // Apply combat clear rewards to the profile before transitioning.
            // Defeat passes through with no profile changes. The granted
            // outcome is forwarded to the result screen so it can show what
            // the player just earned.
            const { profile: nextProfile, outcome: clearOutcome } = applyCombatClearToProfile(
              profile,
              stage,
              {
                cleared: outcome === 'cleared',
                currentHp: runner.state.player.currentHp,
                maxHp: runner.state.player.stats.maxHp,
                hardcore: screen.hardcore,
                combosTriggered: runner.state.combosTriggeredThisStage.element_chain,
                damageDealtByType: runner.state.player.damageDealtByType,
                damageTakenThisStage: runner.state.player.damageTakenThisStage,
              },
            );
            if (nextProfile !== profile) {
              persistProfile(nextProfile);
              setProfileState(nextProfile);
            }
            // Queue any newly-unlocked lore so the unlock modal fires after
            // the player closes the result screen.
            if (clearOutcome.loreUnlocked.length > 0) {
              setPendingLoreUnlocks(clearOutcome.loreUnlocked);
            }
            setScreen({
              kind: 'combat_result',
              outcome,
              stage,
              runner,
              talents: screen.talents,
              equipment: screen.equipment,
              hardcore: screen.hardcore,
              customDeck: screen.customDeck,
              ownedUpgradeIds: screen.ownedUpgradeIds,
              clearOutcome,
            });
          }}
          onExit={() => setScreen({ kind: 'sigilbound_hub' })}
        />
      )}
      {screen.kind === 'bestiary' && (
        <CardEncyclopediaScreen profile={profile} initialTab="bestiary" onBack={() => setScreen({ kind: 'sigilbound_hub' })} />
      )}
      {screen.kind === 'encyclopedia' && (
        <CardEncyclopediaScreen profile={profile} initialTab={screen.initialTab} onBack={() => setScreen({ kind: 'sigilbound_hub' })} />
      )}
      {screen.kind === 'combat_result' && (
        <CombatResultScreen
          outcome={screen.outcome}
          stage={screen.stage}
          runner={screen.runner}
          clearOutcome={screen.clearOutcome}
          onReplay={() => setScreen({
            kind: 'combat',
            stageNumber: screen.stage.number,
            talents: screen.talents,
            equipment: screen.equipment,
            hardcore: screen.hardcore,
            customDeck: screen.customDeck,
            ownedUpgradeIds: screen.ownedUpgradeIds,
            // Hardcore replays start at full HP — replays reset the arc.
          })}
          onNext={() => setScreen({
            kind: 'stage_intro',
            stageNumber: screen.stage.number + 1,
            talents: screen.talents,
            equipment: screen.equipment,
            hardcore: screen.hardcore,
            customDeck: screen.customDeck,
            ownedUpgradeIds: screen.ownedUpgradeIds,
          })}
          onHome={() => setScreen({ kind: 'sigilbound_hub' })}
        />
      )}
      {screen.kind === 'stage_intro' && (
        <StageIntroScreen
          stageNumber={screen.stageNumber}
          onContinue={() => setScreen({
            kind: 'stage_info',
            stageNumber: screen.stageNumber,
            talents: screen.talents,
            equipment: screen.equipment,
            hardcore: screen.hardcore,
            customDeck: screen.customDeck,
            ownedUpgradeIds: screen.ownedUpgradeIds,
          })}
          onSkip={() => setScreen({
            kind: 'stage_info',
            stageNumber: screen.stageNumber,
            talents: screen.talents,
            equipment: screen.equipment,
            hardcore: screen.hardcore,
            customDeck: screen.customDeck,
            ownedUpgradeIds: screen.ownedUpgradeIds,
          })}
        />
      )}
      {screen.kind === 'stage_info' && (
        <StageInfoScreen
          stageNumber={screen.stageNumber}
          profile={profile}
          ownedUpgradeIds={profile.upgradesOwned}
          onBegin={({ stageNumber, talents, equipment, hardcore }) =>
            setScreen({
              kind: 'combat',
              stageNumber,
              talents,
              equipment,
              hardcore,
              customDeck: profile.combatDeck,
              ownedUpgradeIds: profile.upgradesOwned,
            })
          }
          onQuit={() => setScreen({ kind: 'sigilbound_hub' })}
          onDeck={() => navigateTo({ kind: 'deck', from: 'stage_info' })}
          onProfileChange={persistProfile}
        />
      )}
    </div>
  );
}
