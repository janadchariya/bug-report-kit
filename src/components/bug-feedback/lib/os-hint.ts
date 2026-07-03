export function captureShortcut(): string {
  if (typeof navigator === "undefined") return "เครื่องมือแคปหน้าจอ";
  const ua = navigator.userAgent;
  if (/Mac|iPhone|iPad/.test(ua)) return "⌘⇧4";
  if (/Win/.test(ua)) return "⊞⇧S";
  return "เครื่องมือแคปหน้าจอ";
}
