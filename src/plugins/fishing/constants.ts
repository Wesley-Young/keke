export const FISHING_INVENTORY_TABLE = 'fishing_inventory' as const;
export const FISHING_THIEF_WARNING_TABLE = 'fishing_thief_warning' as const;

export const ROD_PRICE = 50_000;
export const BAIT_PRICE = 10_000;
export const MIN_STAMINA_TO_FISH = 20;
export const STAMINA_COST_MIN = 5;
export const STAMINA_COST_MAX = 20;
export const ULTRA_HIGH_CHARM_THRESHOLD = 50_000;
export const EXTRA_HIGH_CHARM_THRESHOLD = 20_000;
export const CHARM_HOOK_THRESHOLD = 5_000;
export const HIGH_CHARM_WAIT_MIN_MS = 10_000;
export const HIGH_CHARM_WAIT_MAX_MS = 20_000;
export const LOW_CHARM_WAIT_MIN_MS = 15_000;
export const LOW_CHARM_WAIT_MAX_MS = 30_000;
export const FISHING_BOMB_COOLDOWN_MS = 10 * 60 * 1000;
export const FISHING_BOMB_STAMINA_COST = 50;
export const FISHING_BOMB_CHARM_COST = 50;
export const FISHING_BOMB_MUTE_SECONDS = { min: 3 * 60, max: 5 * 60 } as const;
export const SPECIAL_SELL_EVENT_CHANCE_WEIGHT = 3;
export const SPECIAL_SELL_EVENT_NORMAL_WEIGHT = 7;
export const SPECIAL_SELL_EVENT_MIN_MULTIPLIER = 10;
export const SPECIAL_SELL_EVENT_MAX_MULTIPLIER = 15;
export const YARN_REWARD = 19_900;
export const THIEF_WARNING_WEIGHT = 80;
export const THIEF_CLEAR_WARNING_WEIGHT = 60;
export const THIEF_STEAL_PROBABILITY = 0.3;
export const THIEF_STEAL_MIN_PERCENT = 8;
export const THIEF_STEAL_MAX_PERCENT = 15;
export const THIEF_STEAL_MIN_WEIGHT = 10;
export const THIEF_STEAL_MAX_WEIGHT = 80;
export const THIEF_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const thiefStealableItemKinds = ['diamondRing', 'crown'] as const;

export const fishingItemKinds = [
  'shoe',
  'underwear',
  'seashell',
  'frog',
  'yellowFish',
  'octopus',
  'whale',
  'electricEel',
  'diamondRing',
  'crown',
] as const;

export const fishingInventoryKinds = ['rod', ...fishingItemKinds] as const;
