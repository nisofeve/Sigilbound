// Order system — 2-3 objective cards drawn at run start. Each order has a
// counter that ticks up as the player matches it via gameplay. Fulfilling an
// order pays a difficulty-scaled bonus AND changes how harvest payout works:
// crops that match an active order sell at FULL price (and "fly" to the
// order to advance the counter), while crops that don't match sell at HALF.
//
// Orders are deterministic — rolled from the run's seed via the engine RNG —
// so two players with the same seed get the same orders.

import type { CropType } from './types';
import { createRng, type Rng } from './rng';

export type OrderObjective =
  // Harvest a target count of a specific crop (e.g. 10 carrots).
  | { type: 'harvest_crop'; crop: CropType; goal: number }
  // Harvest any crop, regardless of type (e.g. 25 crops total).
  | { type: 'harvest_any'; goal: number }
  // Use the watering can on growing plots (e.g. water 12x).
  | { type: 'water_plots'; goal: number }
  // Trigger a specific combo type N times.
  | { type: 'combo'; combo: 'onslaught' | 'triadic' | 'relentless'; goal: number }
  // Plant a specific crop N times (e.g. plant 8 corn).
  | { type: 'plant_crop'; crop: CropType; goal: number }
  // Plant any crop N times.
  | { type: 'plant_any'; goal: number }
  // Use any tool N times.
  | { type: 'use_tools'; goal: number };

export interface OrderCard {
  id: string;                  // unique within the run (e.g. "order.0")
  title: string;               // short flavor headline ("Supermarket needs carrots")
  description: string;         // one-line objective text shown on the card
  flavor: string;              // 1-2 sentence in-world story for why the order exists
  remark: string;              // tiny snarky one-liner from the requester
  icon: string;                // emoji shown on the order card
  difficulty: 1 | 2 | 3;       // 1 = easy, 3 = hard. Drives bonus payout.
  reward: number;              // bonus coins paid when the order is fulfilled
  objective: OrderObjective;
}

// Mutable per-run state for an order.
export interface OrderState {
  card: OrderCard;
  progress: number;            // 0..goal
  fulfilled: boolean;          // counter reached goal AND reward paid
}

// Crop emoji helper for crop-specific orders.
const CROP_EMOJI: Record<CropType, string> = {
  carrot: '🥕', lettuce: '🥬', radish: '🌶', corn: '🌽', bean: '🫘', pea: '🟢',
  tomato: '🍅', pepper: '🌶', pumpkin: '🎃', melon: '🍈', wheat: '🌾', eggplant: '🍆',
  berry: '🍓', grape: '🍇', mushroom: '🍄', cabbage: '🥗',
  sunflower: '🌻', truffle: '🍂', titanflower: '🌺', phoenix: '🔥',
};

// Crops we'd consider "common enough to ask for" — only the early-deck staples
// so an order isn't unfulfillable on a stock starter.
const ORDER_CROPS: CropType[] = ['carrot', 'lettuce', 'corn', 'tomato', 'pumpkin', 'wheat'];

// Difficulty → reward coin multiplier. Tuned so easy orders are nice-to-have,
// medium are meaningful, and hard orders are a real swing.
const DIFFICULTY_REWARD: Record<1 | 2 | 3, number> = { 1: 60, 2: 140, 3: 280 };

// Witty per-crop "delivery" flavor copy. Each entry is a small cast of
// in-world clients with a one-liner remark. The roller picks one at random
// so reruns of the same crop order feel different each time.
interface CropFlavor {
  title: string;
  flavor: string;
  remark: string;
}
const CROP_FLAVORS: Partial<Record<CropType, CropFlavor[]>> = {
  carrot: [
    {
      title: "Supermarket: Carrots",
      flavor: "The supermarket's carrot bin is suspiciously empty and a polite-but-frantic manager is calling every farm in the valley.",
      remark: "\"Just enough for the soup aisle, please. We've already lost the rabbit demographic.\"",
    },
    {
      title: "Bunny Sanctuary: Carrots",
      flavor: "The bunny sanctuary's annual fundraiser is tomorrow and the donations bin is, technically, two carrots and a regret.",
      remark: "\"They are very polite eaters. Mostly.\"",
    },
    {
      title: "Castle Kitchen: Carrots",
      flavor: "The duke ordered carrot soufflé. Nobody told the duke carrot soufflé isn't real. Cook is now improvising.",
      remark: "\"Just bring carrots. Lots. Don't ask follow-up questions.\"",
    },
  ],
  lettuce: [
    {
      title: "Downtown Diner: Lettuce",
      flavor: "Downtown Diner promised the world's freshest BLT and is currently running a BT.",
      remark: "\"The L is non-negotiable. Apparently.\"",
    },
    {
      title: "Salad Bar: Lettuce",
      flavor: "The new salad bar is doing TOO well. Lunch rush ended their pantry by 11:42 am sharp.",
      remark: "\"The dressings are fine. It's the bowls that are sad.\"",
    },
  ],
  corn: [
    {
      title: "Harvest Festival: Corn",
      flavor: "The Harvest Festival is in three days. The Corn Maze is, as of right now, a Corn Plus Sign.",
      remark: "\"We need maze. Not signage.\"",
    },
    {
      title: "Popcorn Co-op: Corn",
      flavor: "The popcorn co-op had a banner week — banner enough that the kernels are now a memory.",
      remark: "\"Butter we have. The other ingredient, less so.\"",
    },
    {
      title: "Birds vs Scarecrow: Corn",
      flavor: "The crows have unionised and the scarecrow's contract is up for review. We just need cobs.",
      remark: "\"Solidarity, but also: corn please.\"",
    },
  ],
  tomato: [
    {
      title: "Pizzeria: Tomatoes",
      flavor: "Mama Lina's pizzeria ran out of sauce mid-shift. The pizzas going out the door are, charitably, garlic bread.",
      remark: "\"My nonna will be in tears by Tuesday. Hurry.\"",
    },
    {
      title: "Tomato Festival: Tomatoes",
      flavor: "The annual tomato fight is this weekend. There is, presently, nothing to fight with.",
      remark: "\"Bring red. Bring lots of red.\"",
    },
  ],
  pumpkin: [
    {
      title: "Bakery: Pumpkins",
      flavor: "Pumpkin spice season hit two weeks early and the bakery's flagship muffin is, today, a sad raisin muffin.",
      remark: "\"The line out the door is patient. For now.\"",
    },
    {
      title: "Halloween Lane: Pumpkins",
      flavor: "Halloween Lane needs jack-o'-lanterns. Currently the porches are decorated with cabbages and shame.",
      remark: "\"Children are asking questions. Pointed ones.\"",
    },
  ],
  wheat: [
    {
      title: "The Old Mill: Wheat",
      flavor: "The Old Mill's stones haven't turned in a week. Gertrude the Miller is starting to give the cat directions.",
      remark: "\"I'd kill for a load of wheat. Metaphorically. Mostly.\"",
    },
    {
      title: "Bread Riot Prevention: Wheat",
      flavor: "Word is the village bakers will riot by sundown unless flour shows up. They are, in fact, quite well organised.",
      remark: "\"Send wheat. It's not worth the picket signs.\"",
    },
  ],
};

const HARVEST_ANY_FLAVORS: CropFlavor[] = [
  {
    title: "Wholesale Order",
    flavor: "Big-box buyer just rolled into town with a flatbed truck and a list longer than the truck.",
    remark: "\"I don't care WHAT it is. I care HOW MUCH.\"",
  },
  {
    title: "Famine Relief Drive",
    flavor: "Neighbouring valley had a rough season. The relief committee is loading whatever moves.",
    remark: "\"Doesn't matter what. If it's edible we'll figure it out.\"",
  },
  {
    title: "Royal Banquet: Anything Edible",
    flavor: "The royal banquet's caterer is having a full panic. Apparently \"various seasonal vegetables\" was an actual plan.",
    remark: "\"Send food. Any food. Especially the photogenic kind.\"",
  },
];

const WATER_FLAVORS: CropFlavor[] = [
  {
    title: "It's Sunny — Real Sunny",
    flavor: "The sun is doing too good a job today. The plants are starting to look thoughtful and a little crispy.",
    remark: "\"Carry on, gardener. The radishes are watching.\"",
  },
  {
    title: "Summer Drought Watch",
    flavor: "The well-watcher passed by and made a face. That face was the kind farmers know.",
    remark: "\"More water. Less interpretive face-making, please.\"",
  },
  {
    title: "Plant Hydration Audit",
    flavor: "An overly enthusiastic agriculture intern is here with a clipboard and a very specific definition of \"adequately moist\".",
    remark: "\"You'd be surprised how many fields fail the audit.\"",
  },
];

const COMBO_FLAVORS: Record<'onslaught' | 'triadic' | 'relentless', CropFlavor[]> = {
  onslaught: [
    {
      title: "Same-Crop Showcase",
      flavor: "The agricultural society is judging \"Best Bumper Crop\" this year and they're bored of mixed plates.",
      remark: "\"Show us volume. Of one thing. We need to be moved.\"",
    },
    {
      title: "Cropraiser Magazine Feature",
      flavor: "Cropraiser Magazine is doing a glossy six-page spread on Single-Crop Discipline. The photographer has arrived.",
      remark: "\"Three of the same in one frame. Aesthetically, please.\"",
    },
  ],
  triadic: [
    {
      title: "Variety Pack Special",
      flavor: "The food critic is in town. She is famously bored of farms that grow \"one thing well\".",
      remark: "\"Surprise me. Three flavours minimum.\"",
    },
    {
      title: "The Mixed Hamper Order",
      flavor: "The neighbour's hamper-of-the-month box subscription needs filling and the box is, frankly, gigantic.",
      remark: "\"Variety over volume. The subscribers are picky people.\"",
    },
  ],
  relentless: [
    {
      title: "Loyalty Streak Bonus",
      flavor: "The Loyal Harvest Loyalty Programme™ is offering bonus payouts to farms that don't, quote, \"flip-flop crop-wise\".",
      remark: "\"Pick a lane. Stay in it. Get paid.\"",
    },
    {
      title: "Single-Origin Devotion",
      flavor: "A single-origin gourmet collective will only deal with farms running a clean specialty streak.",
      remark: "\"Mix it up and we walk. Politely.\"",
    },
  ],
};

const PLANT_CROP_FLAVORS: Partial<Record<CropType, CropFlavor[]>> = {
  carrot: [
    { title: "Future Carrot Forecast", flavor: "The futures market is bullish on carrots, which has alarmed precisely one farmer (you).", remark: "\"Get them in the ground. The traders are watching.\"" },
  ],
  lettuce: [
    { title: "Salad Plot Initiative", flavor: "The wellness influencer in town has declared this Salad Summer. She has 47 followers, but they are loud.", remark: "\"Plant the leaves. It's a vibe.\"" },
  ],
  corn: [
    { title: "Cornfield Restoration", flavor: "The old corn maze contractor is begging for rows. The festival posters are already up.", remark: "\"Make it a maze, not a cornfield with vibes.\"" },
  ],
  tomato: [
    { title: "Vine Renaissance", flavor: "Vine-ripening evangelists are knocking on doors. Apparently this is a thing now.", remark: "\"Plant tomato. Reap respect.\"" },
  ],
  pumpkin: [
    { title: "Pumpkin Patch Permits", flavor: "The county is granting honorary pumpkin-patch credentials to farms that take it seriously.", remark: "\"Volume of pumpkin = level of seriousness.\"" },
  ],
  wheat: [
    { title: "Wheat Forecast: Bullish", flavor: "Bread futures look strong this season. The miller is rubbing her hands together suspiciously.", remark: "\"Plant wheat. Trust the process.\"" },
  ],
};

const PLANT_ANY_FLAVORS: CropFlavor[] = [
  {
    title: "Maximum Activity",
    flavor: "Visiting farm critic is grading on \"hustle visible from the road\". Idle dirt loses points.",
    remark: "\"Plant something. Plant anything. Just plant.\"",
  },
  {
    title: "Empty Plot Phobia",
    flavor: "The county aesthetics inspector has feelings about bare soil. Strong, documented feelings.",
    remark: "\"Cover those plots. We are not a parking lot.\"",
  },
];

const TOOL_FLAVORS: CropFlavor[] = [
  {
    title: "Workshop Endorsement",
    flavor: "The Plotbound Tool Co. is doing a sponsorship deal: use the gear, get the kickback.",
    remark: "\"Show us tools in action. The marketing team is here.\"",
  },
  {
    title: "Productivity Audit",
    flavor: "The county is auditing tool usage to determine \"sufficiently industrious\" tax breaks.",
    remark: "\"More tools, less sitting. Allegedly.\"",
  },
];

// Templates for every order kind. Each template knows how to roll a goal at
// each difficulty tier, plus a flavor copy bundle (story + remark).
type Template = (rng: Rng, difficulty: 1 | 2 | 3) => OrderCard;

function pickFlavor<T>(rng: Rng, options: T[]): T {
  return options[rng.int(options.length)];
}

const TEMPLATES: Template[] = [
  // Harvest specific crop
  (rng, difficulty) => {
    const crop = ORDER_CROPS[rng.int(ORDER_CROPS.length)];
    const goal = ({ 1: 4, 2: 8, 3: 14 })[difficulty];
    const reward = DIFFICULTY_REWARD[difficulty];
    const emoji = CROP_EMOJI[crop] ?? '🌾';
    const flavors = CROP_FLAVORS[crop] ?? [{
      title: `Order: ${crop}`,
      flavor: `A buyer has appeared with a very specific need for ${crop}.`,
      remark: `"${crop}, please. Today, ideally."`,
    }];
    const f = pickFlavor(rng, flavors);
    return {
      id: '',
      title: f.title,
      description: `Harvest ${goal} ${crop}${goal === 1 ? '' : 's'}`,
      flavor: f.flavor,
      remark: f.remark,
      icon: emoji,
      difficulty,
      reward,
      objective: { type: 'harvest_crop', crop, goal },
    };
  },
  // Harvest any
  (rng, difficulty) => {
    const goal = ({ 1: 8, 2: 16, 3: 28 })[difficulty];
    const f = pickFlavor(rng, HARVEST_ANY_FLAVORS);
    return {
      id: '',
      title: f.title,
      description: `Harvest ${goal} crops total`,
      flavor: f.flavor,
      remark: f.remark,
      icon: '📦',
      difficulty,
      reward: DIFFICULTY_REWARD[difficulty],
      objective: { type: 'harvest_any', goal },
    };
  },
  // Water count
  (rng, difficulty) => {
    const goal = ({ 1: 4, 2: 8, 3: 14 })[difficulty];
    const f = pickFlavor(rng, WATER_FLAVORS);
    return {
      id: '',
      title: f.title,
      description: `Water crops ${goal}×`,
      flavor: f.flavor,
      remark: f.remark,
      icon: '💧',
      difficulty,
      reward: DIFFICULTY_REWARD[difficulty],
      objective: { type: 'water_plots', goal },
    };
  },
  // Combo
  (rng, difficulty) => {
    const combos: Array<{ id: 'onslaught' | 'triadic' | 'relentless'; name: string; icon: string }> = [
      { id: 'onslaught',  name: 'Onslaught',        icon: '⚔️' },
      { id: 'triadic',    name: 'Triadic Strike',   icon: '🌈' },
      { id: 'relentless', name: 'Relentless',       icon: '🔁' },
    ];
    const c = combos[rng.int(combos.length)];
    const goal = ({ 1: 1, 2: 3, 3: 5 })[difficulty];
    const f = pickFlavor(rng, COMBO_FLAVORS[c.id]);
    return {
      id: '',
      title: f.title,
      description: `Trigger ${goal} ${c.name}${goal === 1 ? '' : 's'}`,
      flavor: f.flavor,
      remark: f.remark,
      icon: c.icon,
      difficulty,
      reward: DIFFICULTY_REWARD[difficulty],
      objective: { type: 'combo', combo: c.id, goal },
    };
  },
  // Plant specific crop
  (rng, difficulty) => {
    const crop = ORDER_CROPS[rng.int(ORDER_CROPS.length)];
    const goal = ({ 1: 5, 2: 10, 3: 18 })[difficulty];
    const emoji = CROP_EMOJI[crop] ?? '🌱';
    const flavors = PLANT_CROP_FLAVORS[crop] ?? [{
      title: 'Field Planting',
      flavor: `Demand is rising for ${crop}. Get them in the ground while the iron is hot.`,
      remark: `"More ${crop}. Now. Trust me on this."`,
    }];
    const f = pickFlavor(rng, flavors);
    return {
      id: '',
      title: f.title,
      description: `Plant ${goal} ${crop}${goal === 1 ? '' : 's'}`,
      flavor: f.flavor,
      remark: f.remark,
      icon: emoji,
      difficulty,
      reward: DIFFICULTY_REWARD[difficulty],
      objective: { type: 'plant_crop', crop, goal },
    };
  },
  // Plant any
  (rng, difficulty) => {
    const goal = ({ 1: 10, 2: 20, 3: 35 })[difficulty];
    const f = pickFlavor(rng, PLANT_ANY_FLAVORS);
    return {
      id: '',
      title: f.title,
      description: `Plant ${goal} crops total`,
      flavor: f.flavor,
      remark: f.remark,
      icon: '🌱',
      difficulty,
      reward: DIFFICULTY_REWARD[difficulty],
      objective: { type: 'plant_any', goal },
    };
  },
  // Use tools
  (rng, difficulty) => {
    const goal = ({ 1: 4, 2: 8, 3: 14 })[difficulty];
    const f = pickFlavor(rng, TOOL_FLAVORS);
    return {
      id: '',
      title: f.title,
      description: `Use ${goal} tools`,
      flavor: f.flavor,
      remark: f.remark,
      icon: '🔧',
      difficulty,
      reward: DIFFICULTY_REWARD[difficulty],
      objective: { type: 'use_tools', goal },
    };
  },
];

// Roll N orders for a run. Each order gets a unique stable id and a randomised
// difficulty so the spread feels handpicked. We try not to repeat objective
// kinds within the same draw — players want VARIETY of work, not three "water
// 8x" cards at once.
export function rollOrdersForRun(rng: Rng, count = 3): OrderCard[] {
  const out: OrderCard[] = [];
  const usedKinds = new Set<string>();
  let safety = 0;
  while (out.length < count && safety++ < 60) {
    const tpl = TEMPLATES[rng.int(TEMPLATES.length)];
    // Difficulty weighted toward 1-2; only 1 in 5 orders is hard.
    const r = rng.next();
    const difficulty: 1 | 2 | 3 = r < 0.45 ? 1 : r < 0.85 ? 2 : 3;
    const card = tpl(rng, difficulty);
    // Normalise duplicate-kind detection — cropsensitive types share a key.
    const kind = card.objective.type === 'harvest_crop'
      ? `harvest_crop:${card.objective.crop}`
      : card.objective.type === 'plant_crop'
        ? `plant_crop:${card.objective.crop}`
        : card.objective.type;
    if (usedKinds.has(kind)) continue;
    usedKinds.add(kind);
    out.push({ ...card, id: `order.${out.length}` });
  }
  return out;
}

// Roll the pre-game OFFER pool — N cards (default 5) the player chooses
// from. Stable per `runSeed`: same seed means same offer, so navigating
// away and back doesn't reroll. Salted with a constant so the offer doesn't
// share an RNG sequence with the in-run engine RNG (which is seeded with
// the same run seed but rolls events / draft picks).
export function rollOrderOffer(runSeed: number, count = 5): OrderCard[] {
  const rng = createRng((runSeed ^ 0xCEED01) >>> 0);
  return rollOrdersForRun(rng, count);
}

// Does this `OrderState` accept this crop right now? Used by the harvest
// payout logic to decide whether the crop sells at full or half price.
export function orderAcceptsCrop(state: OrderState, crop: CropType): boolean {
  if (state.fulfilled) return false;
  const o = state.card.objective;
  if (o.type === 'harvest_crop' && o.crop === crop) return true;
  if (o.type === 'harvest_any') return true;
  return false;
}

// Advance an order by `delta` (default 1). Caps at the goal and flips
// `fulfilled` the moment it hits. Caller is responsible for paying the bonus
// reward when fulfilled flips true.
export function advanceOrder(state: OrderState, delta = 1): { fulfilledNow: boolean } {
  if (state.fulfilled) return { fulfilledNow: false };
  const o = state.card.objective;
  const goal = goalOf(o);
  const before = state.progress;
  state.progress = Math.min(goal, state.progress + delta);
  if (before < goal && state.progress >= goal) {
    state.fulfilled = true;
    return { fulfilledNow: true };
  }
  return { fulfilledNow: false };
}

export function goalOf(o: OrderObjective): number {
  return o.goal;
}
