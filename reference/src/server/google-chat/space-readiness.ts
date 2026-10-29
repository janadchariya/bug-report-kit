import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { users } from "@/src/server/db/schema/users";

/** Shared recipient rule for Users readiness and Chat spaces' missing bindings. */
export function needsChatSpacePredicate(): SQL {
  return sql`${users.status} = 'active' and ${users.loginMethod} = 'workspace'
    and ${users.roles} && array['bd', 'am', 'md', 'seller_assist']::text[]`;
}
