const LOCALE = "th-TH-u-ca-gregory";

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}

export function formatBangkokDate(at: Date): string {
  const parts = dateFormatter.formatToParts(at);
  return `${part(parts, "day")} ${part(parts, "month")} ${part(parts, "year")}`;
}

export function formatBangkokDateTime(at: Date): string {
  const parts = timeFormatter.formatToParts(at);
  return `${formatBangkokDate(at)} ${part(parts, "hour")}:${part(parts, "minute")}`;
}

