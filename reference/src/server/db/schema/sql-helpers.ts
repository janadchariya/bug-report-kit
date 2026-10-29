import { type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

const literalList = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(", ");

export const inList = (column: AnyPgColumn, values: readonly string[]): SQL =>
  sql`${column} in (${sql.raw(literalList(values))})`;

export const nullOrInList = (column: AnyPgColumn, values: readonly string[]): SQL =>
  sql`${column} is null or ${column} in (${sql.raw(literalList(values))})`;

export const subsetOf = (column: AnyPgColumn, values: readonly string[]): SQL =>
  sql`${column} <@ array[${sql.raw(literalList(values))}]::text[]`;
