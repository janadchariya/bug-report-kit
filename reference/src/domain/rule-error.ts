/** Shared by pure assertions and server writers so action refusals keep their stable codes. */
export class DomainRuleError extends Error {
  constructor(public readonly code: string) {
    super(`domain_rule:${code}`);
  }
}
