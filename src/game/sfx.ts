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

  // Single tight thud when a card slams into a Sigil slot — short low-mid
  // body with a noise transient on top so it reads as wood-on-leather rather
  // than a synth tone. Quick attack, fast decay so back-to-back binds don't
  // pile up audibly.
  cardThud() {
    tone({ freq: 220, endFreq: 90, duration: 0.09, type: 'sine',     gain: 0.22 });
    tone({ freq: 140, endFreq: 60, duration: 0.13, type: 'triangle', gain: 0.14, delay: 0.01 });
    noise({ duration: 0.05, startFreq: 1600, endFreq: 600, q: 2, gain: 0.12, filter: 'bandpass' });
  },

  // Deep air-cut whoosh — plays as the visual slash arc sweeps. Heavier
  // than a fast slice: low-pass noise sweeps from mid down to a sub-bass
  // rumble, layered with a brief sub-tone for body. Reads like a heavy
  // blade carving through air, not a quick whip.
  slashWhoosh() {
    noise({ duration: 0.32, startFreq: 1100, endFreq: 140, q: 1.4, gain: 0.22, filter: 'lowpass' });
    noise({ duration: 0.22, startFreq: 600,  endFreq: 90,  q: 1.0, gain: 0.16, filter: 'lowpass', delay: 0.04 });
    tone({  freq: 180, endFreq: 60, duration: 0.26, type: 'sine', gain: 0.16, delay: 0.02 });
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

  // Dull metallic clunk when an enemy attack lands on block — different
  // from blockGain (which rings upward as a buff). This descends and adds
  // a noise transient so it reads as "shield absorbed a hit" rather than
  // "shield was raised". Short (~140ms) so it sits inside the impact frame.
  blockSoak() {
    tone({ freq: 480, endFreq: 220, duration: 0.13, type: 'square',   gain: 0.14 });
    tone({ freq: 220, endFreq: 110, duration: 0.10, type: 'sine',     gain: 0.10, delay: 0.02 });
    noise({ duration: 0.06, startFreq: 2400, endFreq: 800, q: 4, gain: 0.10, filter: 'bandpass' });
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

  // === Reward / celebration SFX ===

  // Heavy chest-opening swell — plays once when the reward panel mounts.
  // Low whoosh underneath + ascending magical chord.
  rewardOpen() {
    noise({ duration: 0.30, startFreq: 1200, endFreq: 200, q: 1, gain: 0.16, filter: 'lowpass' });
    tone({ freq: 220, endFreq: 440, duration: 0.32, type: 'sawtooth', gain: 0.14 });
    tone({ freq: 523, endFreq: 1047, duration: 0.40, type: 'triangle', gain: 0.12, delay: 0.10 });
    tone({ freq: 784, endFreq: 1568, duration: 0.40, type: 'triangle', gain: 0.10, delay: 0.16 });
  },

  // Soft single chime for a common reward chip popping in.
  rewardChipCommon() {
    tone({ freq: 880, endFreq: 1320, duration: 0.10, type: 'triangle', gain: 0.10 });
  },

  // Two-tone chime — uncommon/rare chip.
  rewardChipRare() {
    tone({ freq: 988,  endFreq: 1480, duration: 0.10, type: 'triangle', gain: 0.12 });
    tone({ freq: 1480, endFreq: 1976, duration: 0.10, type: 'triangle', gain: 0.10, delay: 0.05 });
  },

  // Sparkly arpeggio for epic / legendary / mythic items.
  rewardChipEpic() {
    tone({ freq: 1047, duration: 0.12, type: 'triangle', gain: 0.12 });
    tone({ freq: 1319, duration: 0.12, type: 'triangle', gain: 0.10, delay: 0.05 });
    tone({ freq: 1568, duration: 0.18, type: 'triangle', gain: 0.10, delay: 0.10 });
    tone({ freq: 2093, duration: 0.20, type: 'sine',     gain: 0.08, delay: 0.15 });
    noise({ duration: 0.18, startFreq: 6000, endFreq: 3000, q: 6, gain: 0.05, delay: 0.05, filter: 'highpass' });
  },

  // Stronghold upgrade unlock — heavier than a reward chip because the
  // unlock is permanent. A short metallic anvil-like clank sets the moment
  // of "the upgrade is forged", followed by a quick rising 4-note arpeggio
  // to celebrate the new permanent power. ~600ms total.
  upgradeUnlock() {
    // Anvil clank: bright bandpass burst + a low body thump.
    noise({ duration: 0.08, startFreq: 3200, endFreq: 1600, q: 6, gain: 0.18, filter: 'bandpass' });
    tone({ freq: 220, endFreq: 110, duration: 0.10, type: 'sine',   gain: 0.18 });
    // Rising heroic arpeggio (G major-ish: D-G-B-D).
    tone({ freq: 587,  duration: 0.10, type: 'triangle', gain: 0.14, delay: 0.10 });
    tone({ freq: 784,  duration: 0.11, type: 'triangle', gain: 0.13, delay: 0.18 });
    tone({ freq: 988,  duration: 0.13, type: 'triangle', gain: 0.12, delay: 0.27 });
    tone({ freq: 1175, duration: 0.18, type: 'triangle', gain: 0.12, delay: 0.36 });
    // Bright sparkle tail.
    noise({ duration: 0.20, startFreq: 5000, endFreq: 2000, q: 5, gain: 0.06, delay: 0.30, filter: 'highpass' });
  },

  // === DoT (damage-over-time) tick SFX ===

  // Burn — sizzling crackle layered with a low ember pop. Plays once per
  // burned target during the end-of-turn DoT animation.
  burnTick() {
    noise({ duration: 0.20, startFreq: 1800, endFreq: 600, q: 1.6, gain: 0.14, filter: 'lowpass' });
    noise({ duration: 0.16, startFreq: 4500, endFreq: 1500, q: 4, gain: 0.07, delay: 0.04, filter: 'highpass' });
    tone({ freq: 220, endFreq: 90, duration: 0.18, type: 'sawtooth', gain: 0.10, delay: 0.02 });
  },

  // Poison — wet bubbling drip. Gurgly low-mid tone with a small splat.
  poisonTick() {
    tone({ freq: 320, endFreq: 140, duration: 0.18, type: 'sine', gain: 0.14 });
    tone({ freq: 480, endFreq: 200, duration: 0.16, type: 'sine', gain: 0.10, delay: 0.05 });
    noise({ duration: 0.14, startFreq: 800, endFreq: 300, q: 2, gain: 0.08, delay: 0.06, filter: 'lowpass' });
  },

  // Bleed — wet thud + brief wet hiss. Visceral but short.
  bleedTick() {
    tone({ freq: 140, endFreq: 70, duration: 0.18, type: 'sine', gain: 0.16 });
    noise({ duration: 0.14, startFreq: 600, endFreq: 200, q: 2, gain: 0.10, delay: 0.04, filter: 'lowpass' });
  },

  // ── UI navigation & interaction ──────────────────────────────────────────

  // Subtle tap — generic button press. Very short, soft.
  tap() {
    tone({ freq: 1100, duration: 0.04, type: 'triangle', gain: 0.07 });
  },

  // Screen-transition nav — slightly richer than tap.
  nav() {
    tone({ freq: 660, endFreq: 880, duration: 0.08, type: 'triangle', gain: 0.09 });
    tone({ freq: 880, duration: 0.06, type: 'sine',     gain: 0.06, delay: 0.04 });
  },

  // Quick tab switch ping.
  tabSwitch() {
    tone({ freq: 880, endFreq: 1100, duration: 0.07, type: 'triangle', gain: 0.08 });
  },

  // Modal / popup appears — light upward whoosh + chime.
  modalOpen() {
    tone({ freq: 500, endFreq: 820, duration: 0.13, type: 'triangle', gain: 0.09 });
    noise({ duration: 0.08, startFreq: 2200, endFreq: 900, q: 4, gain: 0.04, delay: 0.04, filter: 'highpass' });
  },

  // Modal / popup dismissed — short downward fade.
  modalClose() {
    tone({ freq: 620, endFreq: 300, duration: 0.10, type: 'triangle', gain: 0.07 });
  },

  // Collect / claim a reward — celebratory ascending 3-note arpeggio.
  rewardClaim() {
    tone({ freq: 659,  duration: 0.10, type: 'triangle', gain: 0.13 });
    tone({ freq: 784,  duration: 0.11, type: 'triangle', gain: 0.12, delay: 0.07 });
    tone({ freq: 1047, duration: 0.18, type: 'triangle', gain: 0.12, delay: 0.14 });
    noise({ duration: 0.12, startFreq: 4000, endFreq: 2000, q: 5, gain: 0.04, delay: 0.14, filter: 'highpass' });
  },

  // Purchase / confirm action — satisfying click + ching.
  confirm() {
    tone({ freq: 440, endFreq: 660, duration: 0.10, type: 'triangle', gain: 0.11 });
    tone({ freq: 660, duration: 0.08, type: 'sine',     gain: 0.08, delay: 0.06 });
  },

  // Bright short bell ping — one per stat row during card upgrade animation.
  statTing() {
    tone({ freq: 1760, endFreq: 2640, duration: 0.08, type: 'triangle', gain: 0.13 });
    tone({ freq: 2637, endFreq: 3136, duration: 0.06, type: 'sine',     gain: 0.07, delay: 0.03 });
  },

  // Triumphant fanfare for first-clear chest. Heroic ascending major chord.
  fanfare() {
    tone({ freq: 392, duration: 0.18, type: 'square',   gain: 0.14 });
    tone({ freq: 523, duration: 0.18, type: 'square',   gain: 0.14, delay: 0.10 });
    tone({ freq: 659, duration: 0.40, type: 'triangle', gain: 0.16, delay: 0.20 });
    tone({ freq: 784, duration: 0.40, type: 'triangle', gain: 0.14, delay: 0.20 });
    tone({ freq: 1047, duration: 0.50, type: 'triangle', gain: 0.12, delay: 0.30 });
    noise({ duration: 0.30, startFreq: 4000, endFreq: 1200, q: 5, gain: 0.06, delay: 0.18, filter: 'highpass' });
  },
};
