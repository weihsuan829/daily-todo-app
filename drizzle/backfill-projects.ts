// drizzle/backfill-projects.ts — run AFTER `drizzle-kit migrate`. Idempotent.
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { users, workspaces, workspaceMembers, tasks } from "./schema";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const db = drizzle(process.env.DATABASE_URL);
  const allUsers = await db.select().from(users);
  for (const u of allUsers) {
    const ws = await db.select().from(workspaces).where(eq(workspaces.ownerId, u.id)).limit(1);
    if (ws.length > 0) continue;
    await db.insert(workspaces).values({ name: "My Workspace", ownerId: u.id });
    const created = await db.select().from(workspaces).where(eq(workspaces.ownerId, u.id)).limit(1);
    await db.insert(workspaceMembers).values({ workspaceId: created[0].id, userId: u.id, role: "owner" });
  }
  await db.update(tasks).set({ status: "done" }).where(eq(tasks.completed, true));
  await db.update(tasks).set({ status: "todo" }).where(eq(tasks.completed, false));
  console.log(`Backfill complete: ${allUsers.length} users.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
