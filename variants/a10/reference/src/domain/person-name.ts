const withoutRole = (name: string) => name.replace(/\s*\|\s*[^|]+$/, "").trim();
const human = (token: string) => {
  const word = token.split(".")[0] || token;
  return /[a-z]/.test(word) && !/[A-Z]/.test(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word;
};

function nameParts(base: string): { first: string; nick: string | null } {
  const paren = base.match(/^(\S+)\s*\(([^)]+)\)/);
  if (paren) return { first: human(paren[1]), nick: paren[2].trim() || null };
  return { first: human(base.split(/\s+/)[0] ?? ""), nick: null };
}

export function nicknameAndFirstName(fullName: string | null, nickname: string | null): string {
  const raw = fullName ?? "";
  const base = withoutRole(raw);
  if (!base) return "—";
  const { first, nick } = nameParts(base);
  const shown = nickname?.trim() || nick;
  if (shown) return `${shown} ${first}`.trim();
  return /\s*\|\s*[^|]+$/.test(raw.trim()) ? base : first;
}

/** Employee source fields come from ANGA TWO. A10 never stores a display-name override. */
export function employeeDisplayName(person: { name?: string | null; full_name?: string | null; nickname?: string | null; email?: string | null }): string {
  const source = person.full_name?.trim();
  if (source) return nicknameAndFirstName(source, person.nickname ?? null);
  const legacy = person.name?.trim();
  if (legacy && person.nickname?.trim()) return nicknameAndFirstName(legacy, person.nickname);
  return legacy || person.email?.trim() || "—";
}


export const initials = (name: string) =>
  name
    .split(/[\s()]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
