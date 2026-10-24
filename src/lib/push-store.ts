export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function listPushSubscriptions(db: D1Database): Promise<PushSubscriptionRow[]> {
  const { results } = await db
    .prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions`)
    .all<PushSubscriptionRow>();
  return results ?? [];
}

export async function savePushSubscription(
  db: D1Database,
  userId: number | null,
  subscription: PushSubscriptionRow,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    )
    .bind(userId, subscription.endpoint, subscription.p256dh, subscription.auth)
    .run();
}

export async function deletePushSubscription(db: D1Database, endpoint: string): Promise<void> {
  await db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).bind(endpoint).run();
}
