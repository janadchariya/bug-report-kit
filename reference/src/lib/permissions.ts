import { USER_ROLES, type Role } from './roles';
export const PERMISSIONS = ['bugs.report', 'bugs.triage', 'lead.work_own', 'lead.submit', 'lead.claim_from_pool'] as const;
export type Permission = typeof PERMISSIONS[number];
export type RolePermissionMatrix = Readonly<Record<Role, ReadonlySet<Permission>>>;
export type StoredGrants = Record<Role, Record<Permission, boolean>>;
export const DEFAULT_ROLE_PERMISSIONS = Object.fromEntries(USER_ROLES.map(role => [role,
  new Set<Permission>(role === 'md' || role === 'system_admin' ? ['bugs.report', 'bugs.triage'] : ['bugs.report'])
])) as unknown as RolePermissionMatrix;
export function resolveMatrix(stored: unknown): RolePermissionMatrix {
  const data = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored as Record<string, unknown> : {};
  return Object.fromEntries(USER_ROLES.map(role => {
    const row = data[role] && typeof data[role] === 'object' ? data[role] as Record<string, unknown> : {};
    return [role, new Set(PERMISSIONS.filter(permission => typeof row[permission] === 'boolean' ? row[permission] : DEFAULT_ROLE_PERMISSIONS[role].has(permission)))];
  })) as unknown as RolePermissionMatrix;
}
export function permissionsFor(roles: Iterable<Role>, matrix: RolePermissionMatrix): ReadonlySet<Permission> {
  return new Set([...roles].flatMap(role => [...(matrix[role] ?? [])]));
}
export function toGrants(matrix: RolePermissionMatrix): StoredGrants {
  return Object.fromEntries(USER_ROLES.map(role => [role, Object.fromEntries(PERMISSIONS.map(permission => [permission, matrix[role].has(permission)]))])) as StoredGrants;
}
