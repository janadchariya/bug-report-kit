import 'server-only';
import { desc, sql } from 'drizzle-orm';
import { DEFAULT_ROLE_PERMISSIONS, resolveMatrix, type RolePermissionMatrix } from '@/src/lib/permissions';
import type { DbOrTx } from '@/src/server/db/client';
import { rolePermissionVersions } from '@/src/server/db/schema/role-permissions';
export const latestGrantsSql = sql<unknown>`(select ${rolePermissionVersions.grants} from ${rolePermissionVersions} order by ${rolePermissionVersions.version} desc limit 1)`;
export async function loadCurrentRolePermissions(db: DbOrTx): Promise<{ version: number; matrix: RolePermissionMatrix }> {
  const [row] = await db.select().from(rolePermissionVersions).orderBy(desc(rolePermissionVersions.version)).limit(1);
  return row ? { version: row.version, matrix: resolveMatrix(row.grants) } : { version: 0, matrix: DEFAULT_ROLE_PERMISSIONS };
}
export async function loadRolePermissionMatrix(db: DbOrTx): Promise<RolePermissionMatrix> { return (await loadCurrentRolePermissions(db)).matrix; }
