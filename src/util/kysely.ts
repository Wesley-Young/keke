import type { FraqDatabase } from '@fraqjs/plugin-kysely';
import type { Kysely, Transaction } from 'kysely';

export type QueryRunner = Transaction<FraqDatabase> | Kysely<FraqDatabase>;
