// Browser-only helpers: local cache, server sync, push, sound, haptics.
import { normalize } from './energy';

const LOCAL = 'reset-button:v1'; // same key as the claude.ai version
const KEY = 'reset-button:key';

/* ---------- local cache ---------- */
export function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL));
  } catch (e) {
    return null;
  }
}
export function saveLocal(s) {
  try {
    localStorage.setItem(LOCAL, JSON.stringify(s));
  } catch (e) {}
}
export function getKey() {
  try {
    return localStorage.getItem(KEY) || '';
  } catch (e) {
    return '';
  }
}
export function setKey(k) {
  try {
    if (k) localStorage.setItem(KEY, k);
    else localStorage.removeItem(KEY);
  } catch (e) {}
}

/* ---------- API ---------- */
export async function api(path, { method = 'GET', body } = {}) {
  const key = getKey();
  if (!key) throw Object.assign(new Error('No sync key'), { code: 'no_key' });
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-reset-key': key },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401) throw Object.assign(new Error('Wrong sync key'), { code: 'bad_key' });
  if (!res.ok) throw Object.assign(new Error('Server error'), { code: 'server' });
  return res.json();
}
export async function pullState() {
  const { state } = await api('/api/state');
  return state ? normalize(state) : null;
}
export async function pushState(state) {
  const r = await api('/api/state', { method: 'PUT', body: { state } });
  return { accepted: r.accepted, state: normalize(r.state) };
}

/* ---------- push notifications ---------- */
export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const isIOS = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (e) {
    return null;
  }
}

function urlB64ToUint8Array(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Must be called from a tap (browsers, and especially iPhone, require it).
export async function enablePush() {
  const reg = (await navigator.serviceWorker.getRegistration()) || (await registerSW());
  if (!reg) throw new Error('This browser can’t run the notification worker.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser or system settings.');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
    });
  }
  await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
  return true;
}
export async function pushEnabled() {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(reg && (await reg.pushManager.getSubscription()));
}

/* ---------- sound + haptics ---------- */
let ctx = null;
const buf = {};
const SOUNDS = { click: '/button-click-soundfx.mp3', release: '/button-release-soundfx.mp3' };

// The context starts suspended until a tap, but decoding works now, so the first press isn't silent.
export function loadSounds() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    return;
  }
  Object.entries(SOUNDS).forEach(([k, u]) =>
    fetch(u)
      .then((r) => r.arrayBuffer())
      .then((a) => new Promise((res, rej) => ctx.decodeAudioData(a, res, rej)))
      .then((b) => (buf[k] = b))
      .catch(() => {})
  );
}
export function unlockAudio() {
  loadSounds();
  try {
    if (ctx && ctx.state !== 'running') ctx.resume();
  } catch (e) {}
}
export function play(k) {
  if (!ctx || !buf[k]) return;
  try {
    const s = ctx.createBufferSource();
    s.buffer = buf[k];
    s.connect(ctx.destination);
    s.start();
  } catch (e) {}
}
function tone(freqs, type, gap) {
  if (!ctx) return;
  try {
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t = ctx.currentTime + i * gap;
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.9);
    });
  } catch (e) {}
}
export const chime = () => tone([659.25, 987.77], 'sine', 0.14);
export const thud = () => tone([196, 146.83], 'triangle', 0.16);
export const ping = () => tone([880], 'sine', 0);
export const buzz = (p) => {
  try {
    navigator.vibrate?.(p);
  } catch (e) {}
};

/* ---------- screen wake lock ---------- */
let lock = null;
export async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) lock = await navigator.wakeLock.request('screen');
    else if (!on && lock) {
      await lock.release();
      lock = null;
    }
  } catch (e) {}
}
