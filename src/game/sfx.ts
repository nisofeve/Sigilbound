// Web Audio API synth helpers — placeholder SFX with no asset files.
// Phase 5 will replace these with proper sound design per GDD §VFX & SFX.

let ctx: AudioContext | null = null;
let muted = false;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
    } catch {
      return null;
    }
  }
  // Browsers suspend the context until a user gesture; resume on demand.
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx;
}

interface ToneOpts {
  freq: number;
  endFreq?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

function tone({ freq, endFreq, duration, type = 'sine', gain = 0.15, delay = 0 }: ToneOpts) {
  if (muted) return;
  const c = audioContext();
  if (!c) return;
  const start = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
  }
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export const sfx = {
  setMuted(v: boolean) {
    muted = v;
  },

  // Bright two-tone "ping" for buff/perk activation.
  activate() {
    tone({ freq: 660, endFreq: 990, duration: 0.16, type: 'triangle', gain: 0.18 });
    tone({ freq: 990, endFreq: 1320, duration: 0.14, type: 'triangle', gain: 0.12, delay: 0.06 });
  },

  // Descending dissonant blip when a buff is consumed/cancelled or a hazard lands.
  cancel() {
    tone({ freq: 440, endFreq: 110, duration: 0.22, type: 'sawtooth', gain: 0.14 });
  },

  // Quick metallic tick when a counter ticks down (e.g., temp plot lifetime).
  tick() {
    tone({ freq: 1320, duration: 0.05, type: 'square', gain: 0.06 });
  },

  // Soft chord swell for a combo trigger.
  combo() {
    tone({ freq: 523, duration: 0.35, type: 'sine', gain: 0.12 });
    tone({ freq: 659, duration: 0.35, type: 'sine', gain: 0.10 });
    tone({ freq: 784, duration: 0.35, type: 'sine', gain: 0.08 });
  },

  // Coin-collect chime for harvest.
  harvest() {
    tone({ freq: 988, duration: 0.10, type: 'triangle', gain: 0.14 });
    tone({ freq: 1319, duration: 0.10, type: 'triangle', gain: 0.10, delay: 0.04 });
  },

  // Low earthy thump when a seed lands in dirt.
  plant() {
    tone({ freq: 180, endFreq: 80,  duration: 0.20, type: 'sawtooth', gain: 0.18 });
    tone({ freq: 240, endFreq: 110, duration: 0.16, type: 'sine',     gain: 0.10, delay: 0.05 });
  },

  // Water spray — fast descending burble for watering / drip-line.
  water() {
    tone({ freq: 1200, endFreq: 600, duration: 0.10, type: 'sine', gain: 0.10 });
    tone({ freq: 1500, endFreq: 800, duration: 0.10, type: 'sine', gain: 0.08, delay: 0.05 });
    tone({ freq: 900,  endFreq: 500, duration: 0.10, type: 'sine', gain: 0.08, delay: 0.10 });
  },

  // Magical shimmer — rising chord for growth potion / sparkle effects.
  magic() {
    tone({ freq: 523,  endFreq: 1047, duration: 0.30, type: 'triangle', gain: 0.12 });
    tone({ freq: 659,  endFreq: 1319, duration: 0.30, type: 'triangle', gain: 0.10, delay: 0.06 });
    tone({ freq: 784,  endFreq: 1568, duration: 0.30, type: 'triangle', gain: 0.08, delay: 0.12 });
  },

  // Quick whoosh for tool deployment / shield / generic action.
  whoosh() {
    tone({ freq: 800, endFreq: 200, duration: 0.18, type: 'sawtooth', gain: 0.10 });
  },

  // === Card motion SFX ===

  // Soft paper-slide whoosh as a card draws from the deck onto the hand bar.
  cardDraw() {
    tone({ freq: 660, endFreq: 1100, duration: 0.10, type: 'triangle', gain: 0.08 });
  },

  // Light upward "lift" when the player picks a card up to drag.
  cardLift() {
    tone({ freq: 440, endFreq: 880, duration: 0.12, type: 'triangle', gain: 0.10 });
  },

  // Quick low buzz when a drag is dropped on an invalid target and snaps back.
  cardSnapBack() {
    tone({ freq: 220, endFreq: 110, duration: 0.14, type: 'sawtooth', gain: 0.10 });
  },

  // Soft paper-fade for a card being consumed/discarded after a play.
  cardDiscard() {
    tone({ freq: 500, endFreq: 200, duration: 0.14, type: 'sine', gain: 0.08 });
  },

  // Heavy double thump when the player ends a round — "the day passes".
  endRound() {
    tone({ freq: 110, endFreq: 70, duration: 0.10, type: 'sine',     gain: 0.16 });
    tone({ freq: 90,  endFreq: 50, duration: 0.12, type: 'sine',     gain: 0.14, delay: 0.07 });
  },
};
