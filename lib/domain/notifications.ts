import { and, count, desc, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { NOTIFICATION_PAGE_SIZE, type NotificationType } from "@/lib/config/notifications";

/**
 * A recipient's in-app inbox, companion to the existing email sends — same
 * trigger sites call both. Kept headless in the same spirit as `threadkit`
 * (decision/shape logic separable from the DB), but stays an in-repo module:
 * there is no second adopter yet to justify a published package.
 */

export type NotificationRow = typeof notifications.$inferSelect;

/**
 * Record a notification for one recipient. Never throws into the caller —
 * a failed in-app notification must not block the booking/message/document
 * write it's attached to, exactly like a failed `sendEmail` call already
 * doesn't at every existing trigger site.
 */
export async function createNotification(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
}): Promise<void> {
  try {
    await db.insert(notifications).values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
    });
  } catch (err) {
    console.error("[notifications] createNotification failed:", err);
  }
}

/** Thin fan-out over createNotification — a loop, not a bulk insert, since
 *  the fan-out sites (thread participants, care team) are few. */
export async function createNotificationForMany(
  userIds: string[],
  input: { type: NotificationType; title: string; body?: string; href?: string },
): Promise<void> {
  await Promise.all(userIds.map((userId) => createNotification({ userId, ...input })));
}

export type ListNotificationsResult = {
  items: NotificationRow[];
  nextCursor: string | null;
};

/** Newest first, cursor-paginated on createdAt. */
export async function listNotifications(
  userId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<ListNotificationsResult> {
  const limit = opts.limit ?? NOTIFICATION_PAGE_SIZE;
  const cursorDate = opts.cursor ? new Date(opts.cursor) : null;

  const rows = await db
    .select()
    .from(notifications)
    .where(
      cursorDate
        ? and(eq(notifications.userId, userId), lt(notifications.createdAt, cursorDate))
        : eq(notifications.userId, userId),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

  return { items, nextCursor };
}

export async function getUnreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.value ?? 0;
}

/** Scoped to userId — never trust a bare notification id from the client. */
export async function markRead(userId: string, notificationId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
}

export async function markAllRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
