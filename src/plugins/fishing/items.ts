import type { KindedWeightedRule } from '../../util/rules';
import type {
  FishingItemKind,
  FishingItemMeta,
  HookOutcomeKind,
  SellCharmRule,
  SellShellRule,
  WeightedCatchOutcome,
} from './types';

export const fishingItems: readonly FishingItemMeta[] = [
  {
    kind: 'shoe',
    name: '破鞋',
    emoji: '👞',
  },
  {
    kind: 'underwear',
    name: '内衣',
    emoji: '👙',
  },
  {
    kind: 'seashell',
    name: '贝壳',
    emoji: '🐚',
  },
  {
    kind: 'frog',
    name: '青蛙',
    emoji: '🐸',
  },
  {
    kind: 'yellowFish',
    name: '黄鱼',
    emoji: '🐠',
  },
  {
    kind: 'octopus',
    name: '章鱼',
    emoji: '🐙',
  },
  {
    kind: 'whale',
    name: '鲸鱼',
    emoji: '🐳',
  },
  {
    kind: 'electricEel',
    name: '电鳗',
    emoji: '⚡️',
  },
  {
    kind: 'diamondRing',
    name: '钻戒',
    emoji: '💎',
  },
  {
    kind: 'crown',
    name: '皇冠',
    emoji: '👑',
  },
];

export const extraHighCharmHookOutcomes: readonly KindedWeightedRule<HookOutcomeKind>[] =
  [
    { kind: 'hooked', weight: 8 },
    { kind: 'yarn', weight: 1 },
    { kind: 'empty', weight: 1 },
  ];

export const highCharmHookOutcomes: readonly KindedWeightedRule<HookOutcomeKind>[] =
  [
    { kind: 'hooked', weight: 4 },
    { kind: 'yarn', weight: 1 },
    { kind: 'empty', weight: 1 },
  ];

export const lowCharmHookOutcomes: readonly KindedWeightedRule<HookOutcomeKind>[] =
  [
    { kind: 'hooked', weight: 2 },
    { kind: 'empty', weight: 1 },
    { kind: 'yarn', weight: 1 },
  ];

export const ultraHighCharmCatchOutcomes: readonly WeightedCatchOutcome[] = [
  { kind: 'item', itemKind: 'shoe', weight: 1 },
  { kind: 'item', itemKind: 'underwear', weight: 1 },
  { kind: 'item', itemKind: 'seashell', weight: 1 },
  { kind: 'item', itemKind: 'frog', weight: 3 },
  { kind: 'item', itemKind: 'yellowFish', weight: 3 },
  { kind: 'item', itemKind: 'octopus', weight: 3 },
  { kind: 'item', itemKind: 'whale', weight: 3 },
  { kind: 'item', itemKind: 'electricEel', weight: 1 },
  { kind: 'item', itemKind: 'diamondRing', weight: 2 },
  { kind: 'item', itemKind: 'crown', weight: 2 },
  { kind: 'rodLoss', weight: 1 },
  { kind: 'shellLoss', weight: 1 },
  { kind: 'doubleYellowFish', weight: 3 },
];

export const catchOutcomes: readonly WeightedCatchOutcome[] = [
  { kind: 'item', itemKind: 'shoe', weight: 1 },
  { kind: 'item', itemKind: 'underwear', weight: 1 },
  { kind: 'item', itemKind: 'seashell', weight: 1 },
  { kind: 'item', itemKind: 'frog', weight: 1 },
  { kind: 'item', itemKind: 'yellowFish', weight: 1 },
  { kind: 'item', itemKind: 'octopus', weight: 1 },
  { kind: 'item', itemKind: 'whale', weight: 1 },
  { kind: 'item', itemKind: 'electricEel', weight: 1 },
  { kind: 'item', itemKind: 'diamondRing', weight: 1 },
  { kind: 'item', itemKind: 'crown', weight: 1 },
  { kind: 'rodLoss', weight: 1 },
  { kind: 'shellLoss', weight: 1 },
  { kind: 'doubleYellowFish', weight: 1 },
];

export const sellShellRules: Record<FishingItemKind, SellShellRule> = {
  shoe: {
    kind: 'specialMultiplier',
    baseShell: { min: 2_000, max: 5_000 },
    eventKind: 'footFan',
    eventMessage: (multiplier) => `遇见神秘的足控，破鞋增值到${multiplier}倍`,
  },
  underwear: {
    kind: 'specialMultiplier',
    baseShell: { min: 8_000, max: 9_000 },
    eventKind: 'collector',
    eventMessage: (multiplier) =>
      `遇见神秘的内衣收藏家，内衣增值到${multiplier}倍`,
  },
  seashell: {
    kind: 'range',
    shell: { min: 15_000, max: 20_000 },
  },
  frog: {
    kind: 'range',
    shell: { min: 38_000, max: 45_000 },
  },
  yellowFish: {
    kind: 'range',
    shell: { min: 50_000, max: 60_000 },
  },
  octopus: {
    kind: 'range',
    shell: { min: 58_000, max: 65_000 },
  },
  whale: {
    kind: 'fixed',
    shell: 100_000,
  },
  electricEel: {
    kind: 'weighted',
    outcomes: [
      { kind: 'reward', weight: 1, shell: { min: 80_000, max: 120_000 } },
      { kind: 'shock', weight: 1, shell: -68_800, message: '电鳗把你电到了' },
    ],
  },
  diamondRing: {
    kind: 'fixed',
    shell: 180_000,
  },
  crown: {
    kind: 'fixed',
    shell: 300_000,
  },
};

export const sellCharmRules: Record<FishingItemKind, SellCharmRule> = {
  shoe: { kind: 'none' },
  underwear: { kind: 'none' },
  seashell: { kind: 'none' },
  frog: { kind: 'none' },
  yellowFish: { kind: 'none' },
  octopus: { kind: 'none' },
  whale: { kind: 'none' },
  electricEel: { kind: 'none' },
  diamondRing: {
    kind: 'range',
    charm: { min: 50, max: 150 },
  },
  crown: {
    kind: 'range',
    charm: { min: 151, max: 250 },
  },
};

export const fishingItemWeights: Record<FishingItemKind, number> = {
  shoe: 1,
  underwear: 1,
  seashell: 2,
  frog: 2,
  yellowFish: 2,
  octopus: 3,
  whale: 4,
  electricEel: 4,
  diamondRing: 6,
  crown: 10,
};

export const fishingItemByKind = new Map(
  fishingItems.map((item) => [item.kind, item]),
);

export const fishingItemsByNameLength = [...fishingItems].sort(
  (left, right) => right.name.length - left.name.length,
);
