import { prisma } from "./db";

const DAY = 24 * 60 * 60 * 1000;

/** UTC date string "YYYY-MM-DD" */
function utcDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Recalculate a user's currentStreak, longestStreak, and lastBurnDate
 * from their burn events and persist to the User row.
 */
export async function updateStreak(userId: string): Promise<void> {
  // Get distinct UTC burn dates, sorted descending
  const events = await prisma.burnEvent.findMany({
    where: { userId },
    select: { timestamp: true },
    orderBy: { timestamp: "desc" },
  });

  if (events.length === 0) {
    await prisma.user.update({
      where: { id: userId },
      data: { currentStreak: 0, longestStreak: 0, lastBurnDate: null },
    });
    return;
  }

  // Build set of unique burn dates
  const dateSet = new Set<string>();
  for (const e of events) {
    dateSet.add(utcDateStr(e.timestamp));
  }

  const sortedDates = [...dateSet].sort().reverse(); // newest first
  const lastBurnDate = sortedDates[0];

  // Current streak: count consecutive days from today backwards
  const today = utcDateStr(new Date());
  let current = 0;

  // The streak can start from today or yesterday (allow for timezone edge)
  const startDate = sortedDates[0] === today ? today : sortedDates[0];
  const startMs = new Date(startDate + "T00:00:00Z").getTime();

  // If the latest burn is more than 1 day old, no current streak
  const todayMs = new Date(today + "T00:00:00Z").getTime();
  if (todayMs - startMs > DAY) {
    // Last burn was more than 1 day ago — streak broken
    current = 0;
  } else {
    for (let i = 0; i < 365; i++) {
      const d = new Date(startMs - i * DAY);
      const key = utcDateStr(d);
      if (dateSet.has(key)) {
        current++;
      } else {
        break;
      }
    }
  }

  // Longest streak: scan all dates chronologically
  const chronDates = [...dateSet].sort();
  let longest = 0;
  let run = 1;
  for (let i = 1; i < chronDates.length; i++) {
    const prev = new Date(chronDates[i - 1] + "T00:00:00Z").getTime();
    const curr = new Date(chronDates[i] + "T00:00:00Z").getTime();
    if (curr - prev === DAY) {
      run++;
    } else {
      longest = Math.max(longest, run);
      run = 1;
    }
  }
  longest = Math.max(longest, run);

  await prisma.user.update({
    where: { id: userId },
    data: { currentStreak: current, longestStreak: longest, lastBurnDate },
  });
}
