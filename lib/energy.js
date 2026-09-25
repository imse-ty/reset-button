// The Reset energy system: one closed system of exactly TOTAL units.
// Energy is never created or destroyed, only moved between forms.
// Every function here is pure: it takes a state and returns a new one.

export const TOTAL = 100;
export const STAKE = 10; // staked from good energy when a door opens
export const RECOVER = 6; // bad energy turned back into good on finish (never 100% efficient)
export const DECAY = 3; // good energy that decays into bad per full idle day
export const START_GOOD = 50;
export const DOOR_MS = 120000;
export const WARN_MS = 30000;

/* ---------- dates (local calendar days) ---------- */
export const dayKey = (t) => {
  const x = new Date(t);
  return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
};
const parseDay = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};
export const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
export const today = () => dayKey(Date.now());

/* ---------- state ---------- */
export function fresh() {
  return {
    good: START_GOOD,
    bad: TOTAL - START_GOOD,
    staked: 0,
    starts: 0,
    streak: 0,
    lastDay: null,
    settled: today(),
    run: null,
    updatedAt: 0
  };
}

// First law: whatever comes in (old versions, bad sync), make it sum to exactly TOTAL.
export function normalize(input) {
  const s = { ...fresh(), ...(input || {}) };
  if (typeof s.good !== 'number' || typeof s.bad !== 'number') {
    s.good = START_GOOD;
    s.bad = TOTAL - START_GOOD;
    s.staked = 0;
  }
  s.good = Math.max(0, Math.round(s.good));
  s.bad = Math.max(0, Math.round(s.bad));
  s.staked = Math.max(0, Math.round(s.staked || 0));
  const drift = TOTAL - (s.good + s.bad + s.staked);
  if (drift !== 0) s.bad = Math.max(0, s.bad + drift);
  if (s.good + s.bad + s.staked !== TOTAL) {
    s.good = START_GOOD;
    s.bad = TOTAL - START_GOOD;
    s.staked = 0;
    s.run = null;
  }
  if (!s.run) {
    s.good += s.staked;
    s.staked = 0;
  }
  return s;
}

// The only way energy ever changes: move it from one form to another.
function move(s, from, to, amount) {
  const a = Math.max(0, Math.min(amount, s[from]));
  s[from] -= a;
  s[to] += a;
  return a;
}

function heatDeath(s) {
  if (s.good === 0 && s.staked === 0 && s.streak > 0) {
    s.streak = 0;
    return true;
  }
  return false;
}

export function streakNow(s) {
  if (!s.lastDay) return 0;
  return daysBetween(s.lastDay, today()) <= 1 ? s.streak : 0;
}

export const stakeFor = (s) => Math.min(STAKE, s.good);

/* ---------- actions: each returns { state, ...result } ---------- */

// Second law: idle days let good energy decay into bad.
export function settleDecay(prev) {
  const s = { ...prev };
  const t = today();
  const from = s.lastDay && daysBetween(s.settled, s.lastDay) > 0 ? s.lastDay : s.settled;
  const idle = daysBetween(from, t) - 1;
  let lost = 0;
  let died = false;
  if (idle > 0) {
    lost = move(s, 'good', 'bad', idle * DECAY);
    died = heatDeath(s);
  }
  if (daysBetween(s.settled, t) > 0) s.settled = dayKey(Date.now() - 86400000);
  return { state: s, lost, died, idle };
}

export function openDoor(prev, { id, task, step }) {
  const s = { ...prev };
  const stake = move(s, 'good', 'staked', STAKE);
  s.run = { id, task, step, endAt: Date.now() + DOOR_MS, stake };
  return { state: s, stake };
}

function logStart(s) {
  const t = today();
  if (s.lastDay !== t) {
    const gap = s.lastDay ? daysBetween(s.lastDay, t) : 99;
    s.streak = gap === 1 ? s.streak + 1 : 1;
    s.lastDay = t;
  }
  s.starts += 1;
}

// Finish (at zero or early): the stake returns and some heat becomes order again.
export function finishDoor(prev) {
  const s = { ...prev };
  if (!s.run) return { state: s, won: 0 };
  move(s, 'staked', 'good', s.staked);
  const won = move(s, 'bad', 'good', RECOVER);
  s.run = null;
  logStart(s);
  return { state: s, won };
}

// Abort: the whole stake becomes heat.
export function abortDoor(prev) {
  const s = { ...prev };
  if (!s.run) return { state: s, lost: 0, died: false };
  const lost = move(s, 'staked', 'bad', s.staked);
  s.run = null;
  const died = heatDeath(s);
  return { state: s, lost, died };
}
