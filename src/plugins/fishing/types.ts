import type { KindedWeightedRule, Range } from '../../util/rules';
import type { CurrencyBalance, CurrencyPatch } from '../currency';
import type { fishingInventoryKinds, fishingItemKinds } from './rules';

export type FishingItemKind = (typeof fishingItemKinds)[number];
export type FishingInventoryKind = (typeof fishingInventoryKinds)[number];

export type FishingInventory = Record<FishingInventoryKind, number>;
export type FishingInventoryPatch = Partial<FishingInventory>;
export type HookOutcomeKind = 'hooked' | 'empty' | 'yarn';

export interface FishingInventoryRow extends FishingInventory {
  user_id: number;
}

export interface FishingThiefWarningRow {
  user_id: number;
  warned: number;
  warned_at: number | null;
  warned_weight: number;
  last_weight: number;
  last_stolen_at: number | null;
  stolen_count: number;
  stolen_weight: number;
}

declare module '@fraqjs/plugin-kysely' {
  interface FraqDatabase {
    fishing_inventory: FishingInventoryRow;
    fishing_thief_warning: FishingThiefWarningRow;
  }
}

export interface FishingItemMeta {
  kind: FishingItemKind;
  name: string;
  emoji: string;
}

export interface CatchResult {
  text: string;
  inventoryPatch?: FishingInventoryPatch;
  currencyPatch?: CurrencyPatch;
}

export interface SellShellResult {
  shellReward: number;
  message?: string;
}

export type FishingThiefEvent =
  | {
      outcome: 'warning';
      inventoryWeight: number;
    }
  | {
      outcome: 'stolen';
      inventoryWeight: number;
      stolenItems: FishingInventory;
      stolenCount: number;
      stolenWeight: number;
    };

export interface ApplyCatchInventoryResult {
  inventory: FishingInventory;
  thiefEvent?: FishingThiefEvent;
}

export interface SellFishRequest {
  item: FishingItemMeta;
  count: number;
}

export type SellFishTextParseResult =
  | {
      ok: true;
      requests: SellFishRequest[];
    }
  | {
      ok: false;
      reason: string;
    };

export type WeightedCatchOutcome =
  | { kind: 'item'; itemKind: FishingItemKind; weight: number }
  | {
      kind: 'rodLoss' | 'shellLoss' | 'doubleYellowFish';
      weight: number;
    };

export type FishingFishResult =
  | {
      outcome: 'empty';
      staminaCost: number;
      charm: number;
      shellDelta: number;
      balance: CurrencyBalance;
      inventory: FishingInventory;
    }
  | {
      outcome: 'yarn';
      staminaCost: number;
      charm: number;
      shellDelta: number;
      balance: CurrencyBalance;
      inventory: FishingInventory;
    }
  | {
      outcome: 'catch';
      staminaCost: number;
      charm: number;
      catchResult: CatchResult;
      shellDelta: number;
      balance: CurrencyBalance;
      inventory: FishingInventory;
      thiefEvent?: FishingThiefEvent;
    }
  | {
      outcome: 'interrupted';
      staminaCost: number;
      charm: number;
      shellDelta: number;
      balance: CurrencyBalance;
      inventory: FishingInventory;
    };

export type FishingWaitResolution = 'settle' | 'forfeit';

export interface FishingWaitRecord {
  wait: Promise<FishingWaitResolution>;
  operation?: Promise<unknown>;
  start(waitMs: number): void;
  finish(resolution: FishingWaitResolution): void;
}

export type FishingWaitStartedHandler = () => Promise<void> | void;

export interface FishingBombResult {
  balance: CurrencyBalance;
  interruptedCount: number;
  muteSeconds: number;
  staminaCost: number;
  charmCost: number;
}

export type SellShellRule =
  | {
      kind: 'range';
      shell: Range;
    }
  | {
      kind: 'fixed';
      shell: number;
    }
  | {
      kind: 'specialMultiplier';
      baseShell: Range;
      eventKind: string;
      eventMessage(multiplier: number): string;
    }
  | {
      kind: 'weighted';
      outcomes: readonly SellShellOutcomeRule[];
    };

export type SellShellOutcomeRule =
  | (KindedWeightedRule<'reward'> & {
      shell: Range;
    })
  | (KindedWeightedRule<'shock'> & {
      shell: number;
      message: string;
    });

export type SellCharmRule =
  | {
      kind: 'none';
    }
  | {
      kind: 'range';
      charm: Range;
    };

export class AlreadyFishingError extends Error {
  constructor() {
    super('Already fishing');
  }
}

export class FishingBombRateLimitError extends Error {
  constructor(readonly remainingMs: number) {
    super('Fishing bomb rate limited');
    this.name = 'FishingBombRateLimitError';
  }
}
