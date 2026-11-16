import { canTriageBugs } from "./bug-reports";

/** A10 menu visibility, shared by desktop and mobile; service permissions stay independent. */
export function bugNavigation(access: { isAdmin: boolean; isLead: boolean }, employeeId: string) {
  return access.isLead || canTriageBugs(access, employeeId)
    ? { href: "/bugs" as const, label: "Bug reports" }
    : null;
}
