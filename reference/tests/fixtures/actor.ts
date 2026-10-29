import { type Actor, loadActorByUserId } from "@/src/server/auth/actor";
import { db } from "@/src/server/db/client";

export async function buildTestActor(userId: string): Promise<Actor> {
  const actor = await loadActorByUserId(db, userId);
  if (!actor) throw new Error("test_actor_not_found");
  return actor;
}
