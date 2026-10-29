import 'server-only';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { createSqlClient } from './connection';
import * as schema from './schema';
const connectionUrl = process.env.DATABASE_URL;
if (!connectionUrl) throw new Error('DATABASE_URL_required');
const client = createSqlClient(connectionUrl);
export const db: PostgresJsDatabase<typeof schema> = drizzle(client, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;
export async function closeDb(): Promise<void> { await client.end({ timeout: 5 }); }
