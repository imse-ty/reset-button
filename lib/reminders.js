// Decides which reminder, if any, the hourly check should send. Pure, so it's easy to test.
import { DECAY, daysBetween, settleDecay } from './energy';

export const FIRST_HOUR = 7; // 7am
export const LAST_HOUR = 19; // 7pm
// Just under 2 hours, so cron jitter doesn't skip a whole slot.
export const NUDGE_GAP_MS = 2 * 3600000 - 5 * 60000;

const NUDGES = [
  'Name one task and hold the button.',
  'Two minutes is all it takes.',
  'Pick the smallest next step and open a door.'
];

// Local hour and day key (same format as energy.dayKey) in an IANA timezone.
export function localClock(tz, now = Date.now()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      hourCycle: 'h23'
    })
      .formatToParts(new Date(now))
      .map((x) => [x.type, x.value])
  );
  return { hour: Number(p.hour), day: `${Number(p.year)}-${Number(p.month)}-${Number(p.day)}` };
}

export function planReminder(state, { hour, day, now, nudgedAt }) {
  if (!state || state.run || hour < FIRST_HOUR || hour > LAST_HOUR) return null;

  // Decay is only applied when the app opens, so work from what it will be.
  const d = settleDecay(state, day);
  const good = d.state.good;

  if (hour === FIRST_HOUR) {
    if (d.lost) {
      return d.died
        ? { title: 'Heat death.', body: 'Good energy ran out, so your streak reset. Open a door to climb back.' }
        : {
            title: 'Energy decayed.',
            body: `${d.lost} good energy became bad over ${d.idle} idle ${d.idle === 1 ? 'day' : 'days'}. Open a door to win it back.`
          };
    }
  }

  if (hour === LAST_HOUR && state.lastDay !== day) {
    const risk = Math.min(DECAY, good);
    const streak = state.lastDay && daysBetween(state.lastDay, day) <= 1 ? d.state.streak : 0;
    const losses = [risk && `${risk} good energy decays`, streak && `your ${streak}-day streak ends`].filter(Boolean);
    return {
      title: 'No start today yet.',
      body: losses.length
        ? `Open a door before midnight, or ${losses.join(' and ')}.`
        : 'Open a free door and win some energy back.'
    };
  }

  if (now - Math.max(state.lastStartAt || 0, nudgedAt || 0) < NUDGE_GAP_MS) return null;
  return { title: 'Time to start something', body: `${good} good energy. ${NUDGES[hour % NUDGES.length]}` };
}
