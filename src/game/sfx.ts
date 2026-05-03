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

// Filtered white noise burst. Used for slashes, woosh-fire, frost crackle —
// percussive textures that pure tones can't fake. The filter sweep makes
// the burst feel "tuned" rather than static-y.
interface NoiseOpts {
  duration: number;
  startFreq: number;     // band-pass center at the start
  endFreq?: number;
  q?: number;
  gain?: number;
  delay?: number;
  filter?: 'bandpass' | 'lowpass' | 'highpass';
}
function noise({ duration, startFreq, endFreq, q = 4, gain = 0.18, delay = 0, filter = 'bandpass' }: NoiseOpts) {
  if (muted) return;
  const c = audioContext();
  if (!c) return;
  const start = c.currentTime + delay;

  const bufferSize = Math.max(1, Math.floor(c.sampleRate * duration));
  const buf = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buf;

  const f = c.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(startFreq, start);
  if (endFreq !== undefined) {
    f.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
  }

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  src.connect(f);
  f.connect(g);
  g.connect(c.destination);
  src.start(start);
  src.stop(start + duration + 0.02);
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

  // === Combat damage-type SFX ===

  // Steel — bandpass-noise slash plus a metallic ping.
  steelHit() {
    noise({ duration: 0.18, startFreq: 1800, endFreq: 600, q: 5, gain: 0.22 });
    tone({ freq: 1800, endFreq: 900, duration: 0.10, type: 'square', gain: 0.07, delay: 0.02 });
  },

  // Pierce — sharp sweeping whistle + tight thwip.
  pierceHit() {
    tone({ freq: 2400, endFreq: 600, duration: 0.16, type: 'triangle', gain: 0.12 });
    noise({ duration: 0.08, startFreq: 4000, endFreq: 1500, q: 6, gain: 0.10, delay: 0.04 });
  },

  // Pyre — noisy whoosh swelling into a low boom for the impact.
  pyreHit() {
    noise({ duration: 0.22, startFreq: 600, endFreq: 200, q: 1.4, gain: 0.20, filter: 'lowpass' });
    tone({ freq: 110, endFreq: 50, duration: 0.18, type: 'sine', gain: 0.18, delay: 0.06 });
  },

  // Frost — high crystalline ping plus a brittle noise crackle.
  frostHit() {
    tone({ freq: 1760, endFreq: 2640, duration: 0.18, type: 'triangle', gain: 0.10 });
    tone({ freq: 1320, endFreq: 1980, duration: 0.18, type: 'sine', gain: 0.08, delay: 0.02 });
    noise({ duration: 0.10, startFreq: 5000, endFreq: 3000, q: 8, gain: 0.07, delay: 0.06 });
  },

  // Arcane — shimmer chord plus a static hiss.
  arcaneHit() {
    tone({ freq: 660, endFreq: 1320, duration: 0.20, type: 'triangle', gain: 0.10 });
    tone({ freq: 880, endFreq: 1760, duration: 0.20, type: 'triangle', gain: 0.08, delay: 0.04 });
    noise({ duration: 0.16, startFreq: 3200, endFreq: 1600, q: 3, gain: 0.06, delay: 0.04, filter: 'highpass' });
  },

  // === Combat result SFX ===

  // Sparkly upper-octave punch on a critical strike.
  critHit() {
    tone({ freq: 1320, endFreq: 2640, duration: 0.10, type: 'square', gain: 0.10 });
    tone({ freq: 1980, endFreq: 3960, duration: 0.10, type: 'triangle', gain: 0.10, delay: 0.04 });
  },

  // Low descending thud + breath — enemy dies.
  enemyKill() {
    tone({ freq: 220, endFreq: 60, duration: 0.30, type: 'sawtooth', gain: 0.18 });
    noise({ duration: 0.30, startFreq: 800, endFreq: 200, q: 1, gain: 0.10, filter: 'lowpass', delay: 0.05 });
  },

  // Dull hit when an enemy attack lands on the player.
  enemyAttack() {
    tone({ freq: 180, endFreq: 90, duration: 0.16, type: 'square', gain: 0.16 });
    noise({ duration: 0.10, startFreq: 1000, endFreq: 400, q: 2, gain: 0.10, delay: 0.02 });
  },

  // Metallic ring when the player gains block (their own or enemy's).
  blockGain() {
    tone({ freq: 540, endFreq: 800, duration: 0.16, type: 'triangle', gain: 0.10 });
    tone({ freq: 800, endFreq: 1080, duration: 0.16, type: 'sine', gain: 0.08, delay: 0.04 });
  },

  // === Combo banner SFX — distinct character per combo type ===

  // Onslaught: quick triple thump building into a heroic chord.
  comboOnslaught() {
    tone({ freq: 110, duration: 0.06, type: 'square', gain: 0.16 });
    tone({ freq: 130, duration: 0.06, type: 'square', gain: 0.16, delay: 0.06 });
    tone({ freq: 165, duration: 0.06, type: 'square', gain: 0.16, delay: 0.12 });
    tone({ freq: 220, duration: 0.30, type: 'triangle', gain: 0.14, delay: 0.20 });
    tone({ freq: 330, duration: 0.30, type: 'triangle', gain: 0.10, delay: 0.20 });
    tone({ freq: 440, duration: 0.30, type: 'triangle', gain: 0.08, delay: 0.20 });
  },

  // Triadic Strike: rising arpeggio — three distinct tones.
  comboTriadic() {
    tone({ freq: 523, duration: 0.18, type: 'triangle', gain: 0.14 });
    tone({ freq: 784, duration: 0.18, type: 'triangle', gain: 0.14, delay: 0.10 });
    tone({ freq: 1175, duration: 0.30, type: 'triangle', gain: 0.16, delay: 0.20 });
  },

  // Relentless: deep ominous drone with a crescendo.
  comboRelentless() {
    tone({ freq: 82, endFreq: 165, duration: 0.50, type: 'sawtooth', gain: 0.16 });
    tone({ freq: 110, endFreq: 220, duration: 0.50, type: 'sawtooth', gain: 0.12, delay: 0.04 });
    noise({ duration: 0.40, startFreq: 200, endFreq: 600, q: 1, gain: 0.10, delay: 0.10, filter: 'lowpass' });
  },

  // Tactic card shatter — bright crack burst as the card splinters at centre.
  // Layered high-frequency noise shards + a sub-bass thud for impact weight.
  tacticShatter() {
    // Primary crack: ultra-fast hi-freq noise burst
    noise({ duration: 0.08, startFreq: 8000, endFreq: 2000, q: 2, gain: 0.28, filter: 'highpass' });
    // Glass shard spray: two mid-freq noise tails
    noise({ duration: 0.22, startFreq: 3200, endFreq: 800,  q: 3, gain: 0.18, delay: 0.04 });
    noise({ duration: 0.18, startFreq: 5000, endFreq: 1200, q: 4, gain: 0.14, delay: 0.06, filter: 'bandpass' });
    // Weight thud underneath
    tone({ freq: 120, endFreq: 40, duration: 0.18, type: 'sine', gain: 0.16, delay: 0.02 });
    // Bright overtone ring-off
    tone({ freq: 2400, endFreq: 1200, duration: 0.20, type: 'triangle', gain: 0.08, delay: 0.05 });
  },

  // Tactic announce chime — plays just after shatter as the effect text appears.
  tacticAnnounce() {
    tone({ freq: 440, endFreq: 660, duration: 0.18, type: 'triangle', gain: 0.14 });
    tone({ freq: 660, endFreq: 880, duration: 0.18, type: 'triangle', gain: 0.10, delay: 0.08 });
  },
};
