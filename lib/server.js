// Server-only helpers. Imported by API routes, never by the page.
import { Redis } from '@upstash/redis';
import { Client } from '@upstash/qstash';
import webpush from 'web-push';

export const KEYS = {
  state: 'reset:state',
  subs: 'reset:subs', // hash: endpoint -> subscription JSON
  door: (id) => `reset:door:${id}` // queued QStash message ids for one door
};

let redis;
export function db() {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
    });
  }
  return redis;
}

let qstash;
export function queue() {
  if (!qstash) qstash = new Client({ token: process.env.QSTASH_TOKEN });
  return qstash;
}

let vapidReady = false;
export function push() {
  if (!vapidReady) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:hello@example.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    vapidReady = true;
  }
  return webpush;
}

// Single-person app: one secret key, entered once per device.
export function authorized(req) {
  const key = req.headers['x-reset-key'];
  return Boolean(process.env.RESET_KEY) && key === process.env.RESET_KEY;
}

export function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${req.headers.host}`;
}

export function reject(res, code, message) {
  res.status(code).json({ error: message });
}

// Send one notification to every device that turned notifications on.
export async function pushToAll(payload) {
  const subs = (await db().hgetall(KEYS.subs)) || {};
  const wp = push();
  const body = JSON.stringify(payload);
  await Promise.all(
    Object.entries(subs).map(async ([endpoint, raw]) => {
      const sub = typeof raw === 'string' ? JSON.parse(raw) : raw;
      try {
        await wp.sendNotification(sub, body, { TTL: 60, urgency: 'high' });
      } catch (err) {
        // 404/410: the device unsubscribed or the browser dropped it
        if (err.statusCode === 404 || err.statusCode === 410) await db().hdel(KEYS.subs, endpoint);
      }
    })
  );
}

// Cancel any pushes still queued for a door.
export async function cancelDoor(doorId) {
  const key = KEYS.door(doorId);
  const ids = (await db().get(key)) || [];
  if (ids.length) {
    try {
      await queue().messages.cancel(ids);
    } catch (e) {
      // Already delivered or gone. The fire route double-checks the door anyway.
    }
  }
  await db().del(key);
}
