import "server-only";

export class AuthenticationError extends Error {
  constructor(public readonly reasonCode: string) {
    super("authentication_failed");
  }
}

export class AuthorizationError extends Error {
  constructor(public readonly reasonCode: string) {
    super("authorization_denied");
  }
}

export class StaleStateError extends Error {
  constructor(public readonly currentVersion: number) {
    super("stale_state");
  }
}

export class ValidationError extends Error {
  constructor(public readonly issues: readonly { path: string; code: string }[]) {
    super("validation_failed");
  }
}

export { DomainRuleError } from "@/src/domain/rule-error";
