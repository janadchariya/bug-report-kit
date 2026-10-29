import 'server-only';
import type { Permission } from '@/src/lib/permissions';
import { AuthorizationError } from '@/src/server/errors';
import type { Actor } from './actor';
export { PERMISSIONS, type Permission } from '@/src/lib/permissions';
export function can(actor: Pick<Actor, 'permissions'>, permission: Permission): boolean { return actor.permissions.has(permission); }
export function assertCan(actor: Pick<Actor, 'permissions'>, permission: Permission): void { if (!can(actor, permission)) throw new AuthorizationError('role_missing_permission'); }
export function canAny(actor: Pick<Actor, 'permissions'>, permission: Permission | readonly Permission[]): boolean { return typeof permission === 'string' ? can(actor, permission) : permission.some(p => can(actor, p)); }
