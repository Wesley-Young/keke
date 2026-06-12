import type { QueryRunner } from '../../util/kysely';
import type {
  CurrencyBalance,
  CurrencyPatch,
  CurrencyService,
} from '../currency';

export async function addCurrencySafelyIn(
  db: QueryRunner,
  currency: CurrencyService,
  userId: number,
  patch: CurrencyPatch,
): Promise<CurrencyBalance> {
  const current = await currency.getIn(db, userId);
  const nextPatch = { ...patch };

  if (nextPatch.shell !== undefined && current.shell + nextPatch.shell < 0) {
    nextPatch.shell = -current.shell;
  }

  return currency.adjustIn(db, userId, nextPatch);
}

export function shellDelta(
  before: CurrencyBalance,
  after: CurrencyBalance,
): number {
  return after.shell - before.shell;
}
