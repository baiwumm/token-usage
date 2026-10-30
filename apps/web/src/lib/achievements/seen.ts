// Server-only: the per-user achievements seen watermark. One row per account
// (token_achievement_seen), advanced monotonically so a slow concurrent write
// can never move it backwards. Achievements themselves stay read-time
// computed; this module only stores the "already seen" day.

import { insert, select, SupabaseError, update } from "@/lib/api/supabase-rest";

const TABLE = "token_achievement_seen";
const MAX_ATTEMPTS = 3;

async function readSeen(userId: string): Promise<string | null> {
  const rows = await select(TABLE, {
    select: "seen_through",
    filters: [["user_id", "eq", userId]],
    limit: 1,
  });
  const value = rows[0]?.seen_through;

  return typeof value === "string" ? value : null;
}

/**
 * Read the watermark. Decorative state: a transient failure (or the migration
 * not being applied yet) degrades to "nothing seen" instead of taking the
 * whole achievements page down.
 */
export async function loadAchievementSeen(
  userId: string,
): Promise<string | null> {
  try {
    return await readSeen(userId);
  } catch (error) {
    console.warn(
      `achievement seen marker unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    return null;
  }
}

/**
 * Move the watermark forward to `day` (never backwards) and return the value
 * now stored. Throws when the row cannot be written — the route reports 503
 * and the client keeps working without the marker.
 */
export async function advanceAchievementSeen(
  userId: string,
  day: string,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const current = await readSeen(userId);

    if (current !== null && current >= day) return current;

    try {
      if (current === null) {
        // Plain insert (not merge-upsert): the primary key makes a concurrent
        // first write a 409 instead of silently overwriting a newer day.
        await insert(TABLE, [{ user_id: userId, seen_through: day }], {
          returning: false,
        });

        return day;
      }

      // The `seen_through = current` filter makes the write conditional: a
      // concurrent advance wins and this attempt updates nothing.
      const updated = await update(
        TABLE,
        { seen_through: day, updated_at: new Date().toISOString() },
        [
          ["user_id", "eq", userId],
          ["seen_through", "eq", current],
        ],
        { returning: true },
      );

      if (updated.length > 0) return day;
    } catch (error) {
      // A concurrent first write created the row between read and insert.
      if (!(error instanceof SupabaseError) || error.status !== 409)
        throw error;
    }
  }

  return (await readSeen(userId)) ?? day;
}
