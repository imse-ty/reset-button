// Send a test notification to every subscribed device.
import { authorized, reject, pushToAll } from '../../../lib/server';

export default async function handler(req, res) {
  if (!authorized(req)) return reject(res, 401, 'Missing or wrong sync key.');
  if (req.method !== 'POST') return reject(res, 405, 'Use POST.');
  await pushToAll({ title: 'Notifications are on', body: 'Reset Button will reach you here.', tag: 'reset-test' });
  return res.status(200).json({ ok: true });
}
