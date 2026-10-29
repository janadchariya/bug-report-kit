import { toGrants, type Permission } from "@/src/lib/permissions";
import { USER_ROLES, type Role } from "@/src/lib/roles";
import { loadCurrentRolePermissions } from "@/src/server/auth/role-permissions";
import { db } from "@/src/server/db/client";
import { rolePermissionVersions } from "@/src/server/db/schema/role-permissions";

export async function setRolePermissions(
  overrides: Partial<Record<Role, Partial<Record<Permission, boolean>>>>,
  opts?: { at?: Date; reason?: string },
): Promise<{ version: number }> {
  const { version, matrix } = await loadCurrentRolePermissions(db);
  const grants = toGrants(matrix);
  for (const role of USER_ROLES) Object.assign(grants[role], overrides[role]);
  const [row] = await db
    .insert(rolePermissionVersions)
    .values({
      version: version + 1,
      grants,
      reason: opts?.reason ?? "test fixture",
      createdByUserId: null,
      createdAt: opts?.at ?? new Date(),
    })
    .returning({ version: rolePermissionVersions.version });
  return row;
}
