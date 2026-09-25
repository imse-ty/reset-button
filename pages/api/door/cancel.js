// The app is back in view, or the door ended: cancel its queued pushes.
import { authorized, reject, cancelDoor } from '../../../lib/server';

export default async function handler(req, res) {
  if (!authorized(req)) return reject(res, 401, 'Missing or wrong sync key.');
  if (req.method !== 'POST') return reject(res, 405, 'Use POST.');
  const { doorId } = req.body || {};
  if (!doorId) return reject(res, 400, 'Send doorId.');
  await cancelDoor(doorId);
  return res.status(200).json({ ok: true });
}
