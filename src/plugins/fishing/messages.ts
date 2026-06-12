import type { CurrencyBalance } from '../currency';
import { formatCurrencyChange } from '../currency';
import { fishingItems } from './rules';
import type { FishingInventory, FishingThiefEvent } from './types';

export function repeatString(str: string, count: number): string {
  let result = '';
  for (let i = 0; i < count; i++) {
    result += str;
  }
  return result;
}

export function formatInventory(inventory: FishingInventory): string {
  return fishingItems
    .map((item) => repeatString(item.emoji, inventory[item.kind]))
    .join('');
}

export function formatFishPond(): string {
  return fishingItems.map((item) => `${item.emoji}${item.name}`).join(' ');
}

export function formatSellEvents(messages: readonly string[]): string {
  if (messages.length < 1) {
    return '';
  }

  return `在售卖过程中遇到了如下事件：\n- ${messages.join('\n- ')}`;
}

export function formatSellCurrencyChanges(
  balance: CurrencyBalance,
  shellReward: number,
  charmReward: number,
): string {
  const lines = [formatCurrencyChange('微壳', balance.shell, shellReward)];

  if (charmReward !== 0) {
    lines.push(formatCurrencyChange('魅力', balance.charm, charmReward));
  }

  return lines.join('\n');
}

export function formatThiefEvent(event?: FishingThiefEvent): string {
  if (!event) {
    return '';
  }

  if (event.outcome === 'warning') {
    return `你的鱼库已经堆得很显眼了，似乎有人盯上了。\n继续囤鱼可能引来盗贼，卖鱼可以解除风险。`;
  }

  const stolenText = formatInventory(event.stolenItems);
  return `盗贼趁你继续囤货时下手了，偷走了：${stolenText}。\n及时卖鱼可以降低被偷风险。`;
}
