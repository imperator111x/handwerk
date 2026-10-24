import { deletePushSubscription, listPushSubscriptions } from "./push-store";
import { pushEndpointAllowed, sendWebPush } from "./web-push";

export interface StaffNotice {
  title: string;
  body: string;
  url: string;
}

export async function notifyStaff(env: Env, notice: StaffNotice): Promise<void> {
  if (!env.DB || !env.VAPID_PRIVATE_JWK) return;
  let privateJwk: JsonWebKey;
  try {
    privateJwk = JSON.parse(env.VAPID_PRIVATE_JWK) as JsonWebKey;
  } catch (err) {
    console.error("push_key_invalid", err);
    return;
  }
  const subscriptions = await listPushSubscriptions(env.DB);
  const payload = JSON.stringify({
    title: notice.title.slice(0, 80),
    body: notice.body.slice(0, 180),
    url: notice.url.startsWith("/") ? notice.url : "/admin",
  });
  await Promise.all(
    subscriptions.map(async (subscription) => {
      if (!pushEndpointAllowed(subscription.endpoint)) return;
      try {
        const status = await sendWebPush({
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          payload,
          privateJwk,
          subject: "mailto:info@zeus-service.de",
        });
        if (status === 404 || status === 410) {
          await deletePushSubscription(env.DB!, subscription.endpoint);
        } else if (status < 200 || status >= 300) {
          console.error("push_failed", status);
        }
      } catch (err) {
        console.error("push_exception", err);
      }
    }),
  );
}
