import "server-only";

const FORBIDDEN_KEY_PATTERNS: readonly { name: string; regex: RegExp }[] = [
  {
    name: "credential",
    regex:
      /authorization|cookie|token|secret|password|credential|api[_-]?key|bearer|encrypted|webhook[_-]?url|calendar[_-]?feed[_-]?url/i,
  },
  {
    name: "content",
    regex: /body|payload|message|text|content|subject|description/i,
  },
  {
    name: "personal_data",
    regex: /line[_-]?display[_-]?name|email|phone|mobile|telephone|address|customer|contact/i,
  },
];

const FORBIDDEN_PATTERNS: readonly { name: string; regex: RegExp }[] = [
  { name: "chat_webhook", regex: /https?:\/\/chat[.]googleapis[.]com\/[^\s]+/i },
  { name: "calendar_feed", regex: /\/api\/calendar\/[A-Za-z0-9_-]{43}(?:\.ics)?\b/ },
  { name: "sealed_secret", regex: /\bv1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+/ },
  { name: "email", regex: /[\w.+-]+@[\w-]+\.[\w.]+/ },
  {
    name: "database_url",
    regex: /(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+\w+)?|redis|rediss|mssql|sqlserver|sqlite):\/\//i,
  },
  { name: "bearer_token", regex: /Bearer\s+[\w.\-]+/i },
  {
    name: "token",
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  },
  {
    name: "token",
    regex: /(?:^|[\s,;])(?:[\w-]*token|api[_-]?key)\s*[:=]\s*[^\s,;]+/i,
  },
  {
    name: "token",
    regex: /\b(?:xox[baprs]-|gh[pousr]_)[A-Za-z0-9_-]{10,}\b/,
  },
  {
    name: "secret_key",
    regex: /\b(?:sk_(?:live|test)_|sk-proj-|sk-)[A-Za-z0-9_-]{10,}\b/i,
  },
  {
    name: "aws_access_key",
    regex: /\bAKIA[A-Z0-9]{16}\b/,
  },
  {
    name: "credentialed_url",
    regex: /\bhttps?:\/\/[^\s/@:]+:[^\s/@]+@/i,
  },
  {
    name: "phone",
    regex: /(?:^|[^\d])(?:\+?66|0)(?:[\s-]?\d){8,9}(?:$|[^\d])/,
  },
];

const UUID_CORRELATION_ID = /^(?:corr_)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export const maskEmail = (email: string): string => {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain ?? ""}`;
};

export const safeErrorClass = (error: unknown): string =>
  error instanceof Error ? error.constructor.name : "UnknownError";

export function assertNoSensitiveField(payload: unknown): void {
  const walk = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      for (const pattern of FORBIDDEN_PATTERNS) {
        // A complete correlation id can contain phone-like digit runs. Keep
        // checking every other pattern, and never exempt surrounding content.
        if (pattern.name === "phone" && UUID_CORRELATION_ID.test(value)) continue;
        if (pattern.regex.test(value)) {
          throw new Error(`sensitive value: ${pattern.name} at ${path}`);
        }
      }
      return;
    }

    if (value === null || typeof value !== "object") return;

    if (Array.isArray(value)) {
      if (value.length > 100) throw new Error(`unsafe object at ${path}`);
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }

    if (!isPlainRecord(value) || hasCustomSerialization(value)) {
      throw new Error(`unsafe object at ${path}`);
    }

    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) {
        throw new Error(`unsafe object at ${path}.${key}`);
      }
      const forbiddenKey = FORBIDDEN_KEY_PATTERNS.find(({ regex }) =>
        regex.test(key),
      );
      if (forbiddenKey) {
        throw new Error(`sensitive field: ${key} at ${path}`);
      }
      walk(descriptor.value, `${path}.${key}`);
    }
  };

  walk(payload, "$");
}

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasCustomSerialization(value: Record<string, unknown>): boolean {
  return Object.hasOwn(value, "toJSON");
}
