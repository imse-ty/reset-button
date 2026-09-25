// Save (POST) or forget (DELETE) this device's push subscription.
import { db, KEYS, authorized, reject, ensureReminders } from '../../../lib/server';

function isValidTz(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
}

export default async function handler(req, res) {
  if (!authorized(req)) return reject(res, 401, 'Missing or wrong sync key.');
  const sub = req.body && req.body.subscription;
  if (!sub || !sub.endpoint) return reject(res, 400, 'Send a push subscription.');

  if (req.method === 'POST') {
    await db().hset(KEYS.subs, { [sub.endpoint]: JSON.stringify(sub) });
    const tz = req.body.tz;
    if (typeof tz === 'string' && isValidTz(tz)) await db().set(KEYS.tz, tz);
    await ensureReminders(req);
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'DELETE') {
    await db().hdel(KEYS.subs, sub.endpoint);
    return res.status(200).json({ ok: true });
  }
  res.setHeader('Allow', 'POST, DELETE');
  return reject(res, 405, 'Use POST or DELETE.');
}
