/** Configure trusted developer employee IDs on the server-owned host branch.
 * These IDs also grant triage access: never populate from browser input or names.
 * Empty by default so installing this public kit cannot grant accidental access.
 */
export const BUG_FIXERS: readonly { employeeId: string; name: string }[] = [];
