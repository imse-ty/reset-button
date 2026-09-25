// GET: the one shared energy system. PUT: replace it if the incoming copy is newer.
import { db, KEYS, authorized, reject } from '../../lib/server';
import { normalize } from '../../lib/energy';

export default async function handler(req, res) {
  if (!authorized(req)) return reject(res, 401, 'Missing or wrong sync key.');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const state = await db().get(KEYS.state);
    return res.status(200).json({ state: state || null });
  }

  if (req.method === 'PUT') {
    const incoming = normalize(req.body && req.body.state);
    const current = await db().get(KEYS.state);
    // Newest whole system wins, so energy is never duplicated across devices.
    if (current && (current.updatedAt || 0) >= (incoming.updatedAt || 0)) {
      return res.status(200).json({ state: current, accepted: false });
    }
    await db().set(KEYS.state, incoming);
    return res.status(200).json({ state: incoming, accepted: true });
  }

  res.setHeader('Allow', 'GET, PUT');
  return reject(res, 405, 'Use GET or PUT.');
}
