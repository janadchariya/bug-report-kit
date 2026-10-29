/** Only disposable local databases whose name includes test/e2e may be truncated. */
export function assertLocalDatabaseUrl(value: string, environment?: string): void {
  const url = new URL(value);
  if ((environment !== undefined && environment !== 'local' && environment !== 'test') ||
      !['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname) ||
      !/(?:test|e2e)/i.test(url.pathname)) throw new Error('disposable_local_test_database_required');
}
