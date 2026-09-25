// The app went into the background with a door running:
// queue "30 seconds left" and "Door complete" pushes for whatever time is left.
import { queue, db, appUrl, authorized, reject, cancelDoor, KEYS } from '../../../lib/server';
import { WARN_MS } from '../../../lib/energy';

export default async function handler(req, res) {
  if (!authorized(req)) return reject(res, 401, 'Missing or wrong sync key.');
  if (req.method !== 'POST') return reject(res, 405, 'Use POST.');
  const { doorId, endAt, task } = req.body || {};
  if (!doorId || !endAt) return reject(res, 400, 'Send doorId and endAt.');

  await cancelDoor(doorId); // never double-schedule the same door

  const now = Date.now();
  if (endAt <= now) return res.status(200).json({ scheduled: 0 });

  const url = `${appUrl(req)}/api/door/fire`;
  const jobs = [];
  if (endAt - WARN_MS > now) jobs.push({ kind: 'warn', at: endAt - WARN_MS });
  jobs.push({ kind: 'done', at: endAt });

  const results = await Promise.all(
    jobs.map((j) =>
      queue().publishJSON({
        url,
        body: { doorId, kind: j.kind, task: String(task || '').slice(0, 80) },
        notBefore: Math.ceil(j.at / 1000),
        retries: 2
      })
    )
  );
  await db().set(KEYS.door(doorId), results.map((r) => r.messageId), { ex: 3600 });
  return res.status(200).json({ scheduled: results.length });
}
