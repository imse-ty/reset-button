// Called hourly by the QStash schedule. Signed by QStash, so no sync key here.
import { verifySignature } from '@upstash/qstash/nextjs';
import { db, KEYS, pushToAll } from '../../lib/server';
import { normalize } from '../../lib/energy';
import { localClock, planReminder } from '../../lib/reminders';

async function handler(req, res) {
  const [raw, tz, nudgedAt] = await Promise.all([db().get(KEYS.state), db().get(KEYS.tz), db().get(KEYS.nudged)]);
  if (!raw || !tz) return res.status(200).json({ skipped: 'no state or timezone yet' });

  const now = Date.now();
  const reminder = planReminder(normalize(raw), { ...localClock(tz, now), now, nudgedAt: Number(nudgedAt) || 0 });
  if (!reminder) return res.status(200).json({ skipped: true });

  await pushToAll({ ...reminder, tag: 'reset-remind' });
  await db().set(KEYS.nudged, now);
  return res.status(200).json({ sent: reminder.title });
}

// Built on first request so a missing env var fails the request, not the build.
let verified;
export default async function remind(req, res) {
  if (!verified) verified = verifySignature(handler);
  try {
    return await verified(req, res);
  } catch (e) {
    if (!res.headersSent) res.status(401).json({ error: 'Invalid QStash signature.' });
  }
}

// QStash signs the raw body, so Next must not parse it first.
export const config = { api: { bodyParser: false } };
