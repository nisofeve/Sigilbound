// Sigilbound interactive tutorial overlay — step-by-step guide shown over first battle.
// Info steps: full blocking modal (NEXT button). Action steps: compact top banner (non-blocking).

import { useEffect, useRef, useState } from 'react';

export interface TutorialCounters {
  cardBound: number;
  tacticPlayed: number;
  endTurn: number;
}

interface InfoStep {
  type: 'info';
  id: string;
  icon: string;
  title: string;
  body: string[];
}

interface ActionStep {
  type: 'action';
  id: string;
  icon: string;
  title: string;
  hint: string;
  trigger: 'card_bound' | 'tactic_played' | 'end_turn';
  minEndTurn?: number;
}

type TutStep = InfoStep | ActionStep;

const STEPS: TutStep[] = [
  {
    type: 'info', id: 'welcome', icon: '⚔️',
    title: 'Welcome, Sigilist!',
    body: [
      "You're about to fight your first battle. I'll guide you through the basics of Sigilbound.",
      'Tap NEXT to continue.',
    ],
  },
  {
    type: 'info', id: 'battlefield', icon: '🗺️',
    title: 'The Battlefield',
    body: [
      'The ENEMY is at the top. Watch their speech bubble — it shows what they plan to do next turn.',
      'The ⬡ SIGIL SLOTS in the middle hold your queued attacks.',
      'Your HAND is at the bottom — drag or tap cards to use them.',
    ],
  },
  {
    type: 'info', id: 'action_cards', icon: '🗡️',
    title: 'Action Cards',
    body: [
      'Blue Action cards deal damage when they fire at end of turn.',
      'The number at the top is the CHARGE — how many turns until they fire. Most fire next turn!',
      'DRAG an Action card into a ⬡ Sigil Slot to queue it up.',
    ],
  },
  {
    type: 'action', id: 'drag_card', icon: '🎯',
    title: 'Drag a Card to a Slot',
    hint: 'Drag a blue Action card from your hand up into one of the ⬡ Sigil Slots!',
    trigger: 'card_bound',
  },
  {
    type: 'info', id: 'slot_filled', icon: '✅',
    title: 'Attack Queued!',
    body: [
      'Your attack is locked in! It fires when you end your turn.',
      "Changed your mind? Drag the card back to your hand before ending the turn.",
      'You can fill multiple slots for more firepower!',
    ],
  },
  {
    type: 'info', id: 'tactic_cards', icon: '🛡️',
    title: 'Tactic Cards',
    body: [
      'Green Tactic cards activate INSTANTLY when you tap them — no slot needed.',
      'They cost Stamina (⚡ shown in your stats bar at the top). Stamina refills each turn.',
      'Tactics can grant Block, restore HP, draw extra cards, buff damage, and much more!',
    ],
  },
  {
    type: 'action', id: 'play_tactic', icon: '🛡️',
    title: 'Play a Tactic',
    hint: 'Tap a green Tactic card in your hand to play it instantly! Try Block or Bandage.',
    trigger: 'tactic_played',
  },
  {
    type: 'info', id: 'stamina', icon: '⚡',
    title: 'Stamina',
    body: [
      'Each Tactic costs Stamina. The bar refills at the start of every turn.',
      'Some Stronghold upgrades increase your max stamina.',
      'Plan ahead — spend it on the tactics that matter most this turn!',
    ],
  },
  {
    type: 'action', id: 'end_turn_1', icon: '🔥',
    title: 'End Your Turn!',
    hint: 'Hit the END TURN button to fire all your bound cards and resolve the turn!',
    trigger: 'end_turn',
    minEndTurn: 1,
  },
  {
    type: 'info', id: 'after_turn', icon: '💥',
    title: 'Turn Resolved!',
    body: [
      'Your queued attacks fired and the enemy struck back. That is the core battle loop:',
      '① Draw cards from your deck each turn.',
      '② Bind Action cards to Sigil Slots.',
      '③ Play Tactic cards for instant effects.',
      '④ Hit END TURN — everything resolves!',
    ],
  },
  {
    type: 'info', id: 'combos', icon: '✨',
    title: 'Element Chain Combos!',
    body: [
      'Bind 2 or more cards of the SAME element in one turn to trigger an ELEMENT CHAIN.',
      'Each matching card in the chain deals bonus damage — the longer the chain, the bigger the boost!',
      'Watch for the element icons on your cards (🔥 Pyre, ❄️ Frost, ⚡ Thunder, etc.) and plan chains for maximum impact.',
    ],
  },
  {
    type: 'action', id: 'end_turn_2', icon: '🏆',
    title: 'Keep Fighting!',
    hint: 'Fill your slots and END TURN again. Try binding two cards of the same element for an Element Chain combo!',
    trigger: 'end_turn',
    minEndTurn: 2,
  },
  {
    type: 'info', id: 'complete', icon: '🌟',
    title: "You're a Sigilist!",
    body: [
      'You know the basics! Between battles, visit the STRONGHOLD to unlock permanent upgrades.',
      'Upgrade your cards in the DECK screen to boost their power.',
      'Build element chains, defeat enemies, and forge your legend!',
    ],
  },
];

interface Props {
  counters: TutorialCounters;
  onComplete: () => void;
  onSkip: () => void;
}

export default function TutorialOverlay({ counters, onComplete, onSkip }: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [showEndChoice, setShowEndChoice] = useState(false);
  const prevCounters = useRef<TutorialCounters>({ cardBound: 0, tacticPlayed: 0, endTurn: 0 });

  const step = !done ? STEPS[stepIdx] : null;
  const total = STEPS.length;

  useEffect(() => {
    if (done || !step || step.type !== 'action') return;
    const prev = prevCounters.current;
    let triggered = false;
    if (step.trigger === 'card_bound' && counters.cardBound > prev.cardBound) triggered = true;
    if (step.trigger === 'tactic_played' && counters.tacticPlayed > prev.tacticPlayed) triggered = true;
    if (step.trigger === 'end_turn') {
      const needed = step.minEndTurn ?? 1;
      if (counters.endTurn >= needed && counters.endTurn > prev.endTurn) triggered = true;
    }
    prevCounters.current = { ...counters };
    if (triggered) advance();
  }, [counters]);

  function advance() {
    setStepIdx(prev => {
      const next = prev + 1;
      if (next >= STEPS.length) {
        setShowEndChoice(true);
        return prev;
      }
      return next;
    });
  }

  function handleNext() { advance(); }
  function handleSkip() { setDone(true); onSkip(); }
  function handleEndTutorial() { setDone(true); onComplete(); }
  function handleKeepPracticing() { setDone(true); onSkip(); }

  if (done) return null;

  const parchmentStyle: React.CSSProperties = {
    background: 'linear-gradient(160deg, #f5e6c8 0%, #ede0c0 50%, #e8d4aa 100%)',
    border: '2px solid #c8a030',
    borderRadius: 8,
    boxShadow: '0 0 0 1px rgba(200,160,48,0.25), 0 12px 40px rgba(0,0,0,0.9)',
    color: '#2c1810',
  };

  const progress = ((stepIdx + 1) / total) * 100;
  const progressBar = (
    <div style={{ height: 3, background: 'rgba(74,50,28,0.18)', borderRadius: 2 }}>
      <div style={{
        height: '100%',
        width: `${progress}%`,
        background: 'linear-gradient(90deg, #c8a030, #8b6914)',
        borderRadius: 2,
        transition: 'width 300ms ease',
      }} />
    </div>
  );

  // End-of-tutorial choice dialog
  if (showEndChoice) {
    return (
      <div
        className="fixed inset-0 flex items-end justify-center pb-4 px-3"
        style={{ background: 'rgba(8,4,2,0.82)', zIndex: 950 }}
      >
        <div className="w-full max-w-md sb-fade-up" style={parchmentStyle}>
          <div style={{ padding: '20px 20px 18px' }}>
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 40, marginBottom: 6 }}>🌟</div>
              <div className="sb-display" style={{ fontSize: 17, color: '#5b0e0e', letterSpacing: '0.08em' }}>
                Tutorial Complete!
              </div>
              <div style={{ fontFamily: 'Nunito', fontSize: 13, color: '#5b3a1a', marginTop: 8, lineHeight: 1.55 }}>
                You've learned the basics. Want to keep practicing here or head back to the hub?
              </div>
            </div>
            <div style={{ height: 1, background: 'rgba(74,50,28,0.25)', margin: '0 0 14px' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleKeepPracticing}
                className="sb-btn"
                style={{
                  flex: 1, fontSize: 12, padding: '11px 0', letterSpacing: '0.1em',
                  background: 'linear-gradient(180deg, #b45309 0%, #451a03 100%)',
                  border: '1.5px solid #fbbf24',
                }}
              >
                ⚔ KEEP PRACTICING
              </button>
              <button
                onClick={handleEndTutorial}
                className="sb-btn"
                style={{
                  flex: 1, fontSize: 12, padding: '11px 0', letterSpacing: '0.1em',
                }}
              >
                🏠 END TUTORIAL
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!step) return null;

  const isInfo = step.type === 'info';
  const isLast = stepIdx === STEPS.length - 1;

  if (isInfo) {
    return (
      <div
        className="fixed inset-0 flex items-end justify-center pb-4 px-3"
        style={{ background: 'rgba(8,4,2,0.72)', zIndex: 950 }}
      >
        <div className="w-full max-w-md sb-fade-up" style={parchmentStyle}>
          <div style={{ padding: '18px 20px 16px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 32, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{step.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sb-display" style={{ fontSize: 16, color: '#5b0e0e', letterSpacing: '0.08em', lineHeight: 1.2 }}>
                  {step.title}
                </div>
                <div style={{ fontSize: 10, color: '#8b6914', fontFamily: 'monospace', letterSpacing: '0.25em', marginTop: 3 }}>
                  TUTORIAL · STEP {stepIdx + 1} / {total}
                </div>
              </div>
              <button
                onClick={handleSkip}
                style={{ fontSize: 11, color: '#8b6914', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'monospace', flexShrink: 0, padding: '2px 4px', letterSpacing: '0.1em', opacity: 0.75 }}
              >
                SKIP ✕
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'rgba(74,50,28,0.25)', margin: '0 0 12px' }} />

            {/* Body */}
            <div style={{ fontFamily: 'Nunito', fontSize: 13, lineHeight: 1.65, color: '#2c1810', marginBottom: 14 }}>
              {(step as InfoStep).body.map((para, i) => (
                <p key={i} style={{ marginBottom: i < (step as InfoStep).body.length - 1 ? 7 : 0 }}>{para}</p>
              ))}
            </div>

            {/* Progress */}
            <div style={{ marginBottom: 12 }}>{progressBar}</div>

            {/* Button */}
            <button
              onClick={handleNext}
              className="sb-btn"
              style={{ width: '100%', fontSize: 13, padding: '11px 0', letterSpacing: '0.12em' }}
            >
              {isLast ? '⚔ COMPLETE TUTORIAL ⚔' : 'NEXT →'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Action step — compact non-blocking banner at top
  return (
    <div className="fixed inset-x-0" style={{ top: 0, zIndex: 950, pointerEvents: 'none' }}>
      <div className="mx-auto max-w-md px-3" style={{ pointerEvents: 'auto' }}>
        <div style={{
          ...parchmentStyle,
          borderRadius: '0 0 10px 10px',
          borderTopWidth: 0,
          padding: '8px 14px 10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>{step.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sb-display" style={{ fontSize: 11, color: '#5b0e0e', letterSpacing: '0.1em' }}>{step.title}</div>
              <div style={{ fontFamily: 'Nunito', fontSize: 12, lineHeight: 1.4, color: '#2c1810' }}>
                👉 {(step as ActionStep).hint}
              </div>
            </div>
            <button
              onClick={handleSkip}
              style={{ fontSize: 10, color: '#8b6914', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'monospace', flexShrink: 0, opacity: 0.7 }}
            >
              ✕
            </button>
          </div>
          <div style={{ marginTop: 6 }}>{progressBar}</div>
          <div style={{ fontSize: 9, color: '#8b6914', textAlign: 'center', fontFamily: 'monospace', letterSpacing: '0.2em', marginTop: 4 }}>
            ✦ PERFORM THE ACTION ABOVE ✦
          </div>
        </div>
      </div>
    </div>
  );
}
