// Called by QStash at the scheduled time. Signed by QStash, so no sync key here.
import { verifySignature } from '@upstash/qstash/nextjs';
import { db, KEYS, pushToAll } from '../../../lib/server';

async function handler(req, res) {
  const { doorId, kind, task } = req.body || {};
  // Only notify if this exact door is still running (it may have been finished on another device).
  const state = await db().get(KEYS.state);
  if (!state || !state.run || state.run.id !== doorId) {
    return res.status(200).json({ skipped: true });
  }
  const name = task ? `\u201c${task}\u201d` : 'Your door';
  const payload =
    kind === 'warn'
      ? { title: '30 seconds left', body: `${name} is almost through the door.`, tag: `door-${doorId}` }
      : { title: 'Door complete', body: `You started ${name}. Open Reset Button to bank it.`, tag: `door-${doorId}` };
  await pushToAll(payload);
  return res.status(200).json({ sent: true });
}

// Built on first request so a missing env var fails the request, not the build.
let verified;
export default async function fire(req, res) {
  if (!verified) verified = verifySignature(handler);
  try {
    return await verified(req, res);
  } catch (e) {
    if (!res.headersSent) res.status(401).json({ error: 'Invalid QStash signature.' });
  }
}

// QStash signs the raw body, so Next must not parse it first.
export const config = { api: { bodyParser: false } };
