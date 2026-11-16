import "server-only";

// PostgREST caps each response at max_rows (1000 in supabase/config.toml), silently.
export const PAGE_ROWS = 1000;

type Page<T> = PromiseLike<{ data: T[] }>;

/**
 * For tables known to hold over 1000 rows (accounts about 1,150 and active List mappings about 1,600 in Nov 2026):
 * their reads start with two pages at once.
 */
export const LONG_TABLE = { firstPages: 2 };

// After a full first page, this many pages are read at once. A read past the end is one cheap, empty page.
const PAGES_AHEAD = 4;

/**
 * Every row of a query, read with range(from, to). The query must have a stable order. Most reads fit the first page;
 * a longer one reads the rest PAGES_AHEAD pages at a time, and stops at the first page that is not full. A table known
 * to be longer than one page (accounts, past 1000) passes `firstPages` to read that many pages at once from the start,
 * so the second page does not wait for the first.
 */
export async function readAllPages<T>(page: (from: number, to: number) => Page<T>, { firstPages = 1 }: { firstPages?: number } = {}): Promise<T[]> {
  const rows: T[] = [];
  const pageAt = (index: number) => page(index * PAGE_ROWS, (index + 1) * PAGE_ROWS - 1);
  for (let next = 0, count = Math.max(1, firstPages); ; next += count, count = PAGES_AHEAD) {
    const pages = await Promise.all(Array.from({ length: count }, (_, offset) => pageAt(next + offset)));
    for (const { data } of pages) {
      rows.push(...data);
      if (data.length < PAGE_ROWS) return rows;
    }
  }
}

// ClickUp task ids are short (up to 13 characters), so 300 of them keep an in.(…) URL near 4 KB, and a read by them
// stays far under the 1000-row cap while each task sits in a List or two.
export const TASK_ID_CHUNK = 300;

/** Splits ids into groups small enough for an in.(…) filter in a URL. */
export function chunks<T>(ids: readonly T[], size = 100): T[][] {
  return Array.from({ length: Math.ceil(ids.length / size) }, (_, index) => ids.slice(index * size, (index + 1) * size));
}

const PARALLEL = 8;

/** Runs `read` over every item, PARALLEL at a time, and returns the results flattened in item order. */
export async function inParallel<T, R>(items: readonly T[], read: (item: T) => Promise<R[]>): Promise<R[]> {
  const results: R[][] = Array.from({ length: items.length }, () => []);
  let next = 0;
  const worker = async () => {
    for (let index = next++; index < items.length; index = next++) results[index] = await read(items[index]);
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
  return results.flat();
}
