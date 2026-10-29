export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.at(0)?.toUpperCase())
    .join("");

  return (
    <span className={`ui-avatar ui-avatar--${size}`} aria-label={name} role="img">
      {initials || "A"}
    </span>
  );
}
