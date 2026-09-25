import Head from 'next/head';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as E from '../lib/energy';
import * as C from '../lib/client';

const HOLD_MS = 1600;
const TAP_MS = 220;
const POLL_MS = 20000;
const TITLE = 'Reset Button';

const fmt = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
const RESULT_VIEWS = ['done', 'rolling', 'ended'];

export default function Home() {
  const [S, setS] = useState(null);
  const sRef = useRef(null);
  const [view, _setView] = useState('idle');
  const viewRef = useRef('idle');
  const setView = (v) => {
    viewRef.current = v;
    _setView(v);
  };

  const [task, setTask] = useState('');
  const [step, setStep] = useState('');
  const [shown, setShown] = useState({ task: '', step: '' });
  const [result, setResult] = useState(null);
  const [armed, setArmed] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [sync, setSync] = useState('Saved on this device');
  const [popKey, setPopKey] = useState(0);
  const [mounted, setMounted] = useState(false);

  const [keyDraft, setKeyDraft] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [notif, setNotif] = useState({ on: false, msg: '' });

  const discRef = useRef(null);
  const ringRef = useRef(null);
  const timeRef = useRef(null);
  const taskRef = useRef(null);
  const howRef = useRef(null);
  const settingsRef = useRef(null);
  const holdRef = useRef({ raf: 0, start: 0 });
  const armTimer = useRef(0);
  const chain = useRef(Promise.resolve());

  /* ---------- state + sync ---------- */
  const showRun = (run) =>
    setShown({ task: run.task, step: run.step ? `First: ${run.step}` : 'Just begin. Anything counts.' });

  // Newest whole system wins, so energy is never duplicated across devices.
  const adopt = useCallback((remote) => {
    if (!remote || (remote.updatedAt || 0) <= (sRef.current?.updatedAt || 0)) return false;
    sRef.current = remote;
    setS(remote);
    C.saveLocal(remote);
    const v = viewRef.current;
    if (remote.run && v !== 'running') {
      showRun(remote.run);
      setView('running');
    } else if (!remote.run && v === 'running') {
      setView('idle');
    }
    return true;
  }, []);

  const commit = useCallback(
    (next, { pop = false } = {}) => {
      const s = { ...next, updatedAt: Date.now() };
      sRef.current = s;
      setS(s);
      C.saveLocal(s);
      if (pop) setPopKey((k) => k + 1);
      if (C.getKey()) {
        chain.current = chain.current
          .then(() => C.pushState(s))
          .then((r) => {
            if (!r.accepted) adopt(r.state);
            setSync('Synced');
          })
          .catch((e) =>
            setSync(e.code === 'bad_key' ? 'Sync key rejected. Check settings.' : 'Saved on this device. Sync will retry.')
          );
      }
      return s;
    },
    [adopt]
  );

  const pull = useCallback(async () => {
    if (!C.getKey()) return;
    try {
      const remote = await C.pullState();
      if (!remote) {
        commit(sRef.current); // first device ever: seed the server
        setSync('Synced');
        return;
      }
      if (!adopt(remote) && (sRef.current.updatedAt || 0) > (remote.updatedAt || 0)) commit(sRef.current);
      setSync('Synced');
    } catch (e) {
      setSync(e.code === 'bad_key' ? 'Sync key rejected. Check settings.' : 'Saved on this device');
    }
  }, [adopt, commit]);

  // Second law, applied whenever the app wakes up.
  const settle = useCallback(() => {
    const d = E.settleDecay(sRef.current);
    if (!d.lost) {
      sRef.current = d.state;
      return;
    }
    commit(d.state, { pop: true });
    if (viewRef.current !== 'running') {
      setShown({ task: 'Welcome back.', step: '' });
      setResult({
        title: d.died ? 'Heat death.' : 'Energy decayed.',
        sub: `${d.died ? 'Good energy ran out, so your streak reset. ' : ''}${d.lost} good energy became bad over ${
          d.idle
        } idle ${d.idle === 1 ? 'day' : 'days'}.`
      });
      setView('ended');
    }
  }, [commit]);

  /* ---------- boot ---------- */
  useEffect(() => {
    setMounted(true);
    C.registerSW();
    C.loadSounds();
    // Touch browsers only allow audio after a finger lift or keypress, so unlock on any of them.
    const unlock = () => C.unlockAudio();
    window.addEventListener('pointerup', unlock, true);
    window.addEventListener('keydown', unlock, true);
    const local = C.loadLocal();
    // A brand-new device starts at updatedAt 0, so it never overwrites the synced system.
    const s = local ? E.normalize(local) : { ...E.fresh(), updatedAt: 0 };
    sRef.current = s;
    setS(s);
    if (!local) C.saveLocal(s);
    if (s.run) {
      showRun(s.run);
      setView('running');
    }
    const key = C.getKey();
    setKeyDraft(key);
    setHasKey(Boolean(key));
    if (key) setSync('Syncing…');
    // Pull the latest system first, then apply any decay to it.
    pull().then(settle);
    C.pushEnabled().then((on) => setNotif((n) => ({ ...n, on })));

    const onVis = () => {
      if (document.visibilityState === 'visible') pull().then(settle);
    };
    document.addEventListener('visibilitychange', onVis);
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') pull();
    }, POLL_MS);
    return () => {
      window.removeEventListener('pointerup', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- away pushes: queued only while the app is out of view ---------- */
  useEffect(() => {
    const send = (path, body) => {
      const key = C.getKey();
      if (!key) return;
      // keepalive lets the request finish even while the app is closing
      fetch(path, {
        method: 'POST',
        keepalive: true,
        headers: { 'content-type': 'application/json', 'x-reset-key': key },
        body: JSON.stringify(body)
      }).catch(() => {});
    };
    const onHide = () => {
      const run = sRef.current?.run;
      if (run) send('/api/door/schedule', { doorId: run.id, endAt: run.endAt, task: run.task });
    };
    const onShow = () => {
      const run = sRef.current?.run;
      if (run) send('/api/door/cancel', { doorId: run.id });
    };
    const onVis = () => (document.visibilityState === 'hidden' ? onHide() : onShow());
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);

  const cancelPushes = (doorId) => {
    if (!C.getKey()) return;
    C.api('/api/door/cancel', { method: 'POST', body: { doorId } }).catch(() => {});
  };

  /* ---------- the door ---------- */
  const finish = useCallback(
    (early) => {
      const cur = sRef.current;
      if (!cur?.run) return;
      const doorId = cur.run.id;
      const { state, won } = E.finishDoor(cur);
      commit(state, { pop: true });
      cancelPushes(doorId);
      C.chime();
      C.buzz([60, 80, 60]);
      const gain = won ? `+${won} good energy` : 'Your energy is already fully good';
      setResult({ title: early ? 'Done early.' : 'Two minutes in.', sub: `${gain}. That counts as a start.` });
      setView(early ? 'rolling' : 'done');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit]
  );

  // Pie, clock, 30-second ping and completion. Timers keep running in a background tab.
  const runId = S?.run?.id;
  const runEnd = S?.run?.endAt;
  useEffect(() => {
    if (view !== 'running' || !runId) return undefined;
    let raf = 0;
    const disc = discRef.current;
    const time = timeRef.current;
    const draw = () => {
      const left = Math.max(0, runEnd - Date.now());
      const cleared = (1 - left / E.DOOR_MS) * 360; // radial wipe, clockwise from 12
      if (disc) disc.style.background = `conic-gradient(transparent 0deg ${cleared}deg, var(--fg) ${cleared}deg 360deg)`;
      if (time) time.textContent = fmt(left);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const title = () => {
      document.title = `${fmt(Math.max(0, runEnd - Date.now()))} ${sRef.current?.run?.task || ''}`;
    };
    title();
    const titleI = setInterval(title, 1000);
    const left = runEnd - Date.now();
    const warnT =
      left > E.WARN_MS
        ? setTimeout(() => {
            C.ping();
            C.buzz([40]);
          }, left - E.WARN_MS)
        : 0;
    const endT = setTimeout(() => finish(false), Math.max(0, left));
    C.keepAwake(true);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(titleI);
      clearTimeout(warnT);
      clearTimeout(endT);
      C.keepAwake(false);
      document.title = TITLE;
      if (disc) disc.style.background = '';
      if (time) time.textContent = '';
    };
  }, [view, runId, runEnd, finish]);

  const openDoor = () => {
    cancelAnimationFrame(holdRef.current.raf);
    ringRef.current?.setAttribute('stroke-dasharray', '0 100');
    C.buzz(100);
    setPressed(false); // springs back to full size while the finger is still down
    const { state } = E.openDoor(sRef.current, { id: newId(), task: task.trim(), step: step.trim() });
    commit(state);
    showRun(state.run);
    setView('running');
  };

  // A quick tap is a fidget reset. Holding past TAP_MS with a task starts the ring.
  const press = (e) => {
    if (viewRef.current !== 'idle' || holdRef.current.down) return;
    e?.preventDefault?.();
    C.unlockAudio();
    if (document.activeElement && document.activeElement !== discRef.current) document.activeElement.blur();
    holdRef.current.down = true;
    holdRef.current.start = performance.now();
    C.play('click');
    C.buzz(20);
    setPressed(true);
    listenForRelease(e?.type === 'keydown');
    const hasTask = Boolean(task.trim());
    const tick = (now) => {
      const t = now - holdRef.current.start;
      if (t >= TAP_MS) {
        if (!hasTask) {
          C.buzz([10, 60, 10]);
          return;
        }
        if (viewRef.current === 'idle') setView('holding');
        const p = Math.min(1, (t - TAP_MS) / (HOLD_MS - TAP_MS));
        ringRef.current?.setAttribute('stroke-dasharray', `${p * 100} 100`);
        if (p >= 1) {
          openDoor();
          return;
        }
      }
      holdRef.current.raf = requestAnimationFrame(tick);
    };
    holdRef.current.raf = requestAnimationFrame(tick);
  };

  const release = () => {
    holdRef.current.down = false;
    cancelAnimationFrame(holdRef.current.raf);
    setPressed(false);
    C.unlockAudio();
    C.play('release');
    C.buzz(100);
    if (viewRef.current === 'holding') {
      ringRef.current?.setAttribute('stroke-dasharray', '0 100');
      setView('idle');
    }
  };

  // Window-level, so the release still registers after the door opens under the finger.
  const listenForRelease = (fromKey) => {
    const types = fromKey ? ['keyup', 'blur'] : ['pointerup', 'pointercancel', 'blur'];
    const onUp = (ev) => {
      if (ev.type === 'keyup' && ev.key !== ' ' && ev.key !== 'Enter') return;
      types.forEach((t) => window.removeEventListener(t, onUp, true));
      release();
    };
    types.forEach((t) => window.addEventListener(t, onUp, true));
  };

  // Abort takes two taps, so it's always a real choice.
  const abort = () => {
    const cur = sRef.current;
    if (!cur?.run) return;
    if (!armed) {
      setArmed(true);
      armTimer.current = setTimeout(() => setArmed(false), 3000);
      return;
    }
    clearTimeout(armTimer.current);
    setArmed(false);
    const doorId = cur.run.id;
    const { state, lost, died } = E.abortDoor(cur);
    commit(state, { pop: true });
    cancelPushes(doorId);
    C.thud();
    C.buzz([200]);
    setResult(
      died
        ? { title: 'Heat death.', sub: 'Good energy ran out, so your streak reset. Open a door to climb back.' }
        : { title: 'Aborted.', sub: lost ? `${lost} good energy became bad energy.` : 'Nothing was staked, so nothing was lost.' }
    );
    setView('ended');
  };

  const clearAll = () => {
    setTask('');
    setStep('');
    setResult(null);
    setView('idle');
  };

  /* ---------- settings ---------- */
  const saveKey = async () => {
    const k = keyDraft.trim();
    C.setKey(k);
    setHasKey(Boolean(k));
    if (!k) {
      setSync('Saved on this device');
      return;
    }
    setSync('Syncing…');
    await pull();
  };
  const turnOnNotifications = async () => {
    setNotif({ on: false, msg: 'Asking for permission…' });
    try {
      await C.enablePush();
      setNotif({ on: true, msg: 'Notifications are on for this device.' });
    } catch (e) {
      setNotif({ on: false, msg: e.message || 'Couldn’t turn on notifications.' });
    }
  };
  const sendTest = () =>
    C.api('/api/push/test', { method: 'POST' })
      .then(() => setNotif((n) => ({ ...n, msg: 'Test sent. It should arrive in a few seconds.' })))
      .catch(() => setNotif((n) => ({ ...n, msg: 'Test failed. Check the server settings in the README.' })));

  /* ---------- render ---------- */
  const s = S || E.fresh();
  const idleish = view === 'idle' || view === 'holding';
  const isResult = RESULT_VIEWS.includes(view);
  const ready = Boolean(task.trim());
  const stake = E.stakeFor(s);
  const hint = !ready
    ? 'Name one task, then hold the circle.'
    : stake > 0
    ? `Hold to stake ${stake} energy and open the door.`
    : 'No good energy left. Hold for a free door and win some back.';
  const iosNeedsInstall = mounted && C.isIOS() && !C.isStandalone();
  const canPush = mounted && C.pushSupported();
  const pop = popKey ? 'pop' : '';

  return (
    <>
      <Head>
        <title>{TITLE}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      <main className={`app ${view}${ready ? ' ready' : ''}${isResult ? ' result' : ''}${pressed ? ' pressed' : ''}`}>
        <section className="top">
          {idleish ? (
            <div>
              <label className="field">
                <span>What are you starting?</span>
                <input
                  id="task"
                  ref={taskRef}
                  type="text"
                  maxLength={80}
                  placeholder="One task"
                  autoComplete="off"
                  enterKeyHint="next"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      document.getElementById('step')?.focus();
                    }
                  }}
                />
              </label>
              <label className="field" style={{ marginTop: 14 }}>
                <span>First tiny step (optional)</span>
                <input
                  id="step"
                  type="text"
                  maxLength={80}
                  placeholder="Open the doc"
                  autoComplete="off"
                  enterKeyHint="done"
                  value={step}
                  onChange={(e) => setStep(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                />
              </label>
            </div>
          ) : (
            <div>
              <p className="shown-task">{shown.task}</p>
              {shown.step && <p className="shown-step">{shown.step}</p>}
            </div>
          )}
        </section>

        <section className="stage">
          <div className="wrap">
            <svg className="ring" viewBox="0 0 100 100" aria-hidden="true">
              <circle ref={ringRef} cx="50" cy="50" r="48.5" pathLength="100" strokeDasharray="0 100" />
            </svg>
            <button
              id="disc"
              ref={discRef}
              className="disc"
              aria-label="Hold to start a two-minute door"
              aria-disabled={!idleish}
              onPointerDown={(e) => {
                if (e.button > 0) return;
                e.currentTarget.setPointerCapture?.(e.pointerId);
                press(e);
              }}
              onContextMenu={(e) => e.preventDefault()}
              onKeyDown={(e) => {
                if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                  e.preventDefault();
                  press(e);
                }
              }}
            />
            {isResult && result && (
              <div className="inner">
                <p>
                  {result.title}
                  <small>{result.sub}</small>
                </p>
              </div>
            )}
            <div className="time" ref={timeRef} aria-live="polite" />
          </div>
        </section>

        <section className="bottom">
          {idleish && <p className="hint">{hint}</p>}
          {view === 'running' && (
            <div className="actions">
              <button id="abort" className={`btn quiet${armed ? ' armed' : ''}`} onClick={abort}>
                {armed ? (s.run?.stake ? `Tap to lose ${s.run.stake}` : 'Tap to abort') : 'Abort'}
              </button>
              <button id="doneEarly" className="btn primary" onClick={() => finish(true)}>
                Done
              </button>
            </div>
          )}
          {view === 'done' && (
            <div className="actions">
              <button id="stopHere" className="btn quiet" onClick={clearAll}>
                Stop here
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  setResult({ title: 'You’re rolling.', sub: 'Close this and keep going.' });
                  setView('rolling');
                }}
              >
                Keep going
              </button>
            </div>
          )}
          {(view === 'rolling' || view === 'ended') && (
            <div className="actions">
              <button id="newTask" className="btn primary" onClick={clearAll}>
                New task
              </button>
            </div>
          )}

          <div className="energy">
            <div className="elabels">
              <span>
                <b key={`g${popKey}`} className={pop}>
                  {s.good}
                </b>{' '}
                good
              </span>
              <button className="link" onClick={() => howRef.current?.showModal()}>
                How energy works
              </button>
              <span>
                <b key={`b${popKey}`} className={pop}>
                  {s.bad}
                </b>{' '}
                bad
              </span>
            </div>
            <div
              className="bar"
              role="img"
              aria-label={`${s.good} good energy, ${s.staked} staked, ${s.bad} bad energy, out of 100`}
            >
              <div className="seg good" style={{ width: `${s.good}%` }} />
              <div className="seg staked" style={{ width: `${s.staked}%` }} />
              <div className="seg bad" style={{ width: `${s.bad}%` }} />
            </div>
          </div>
          <div className="stats">
            <span>
              <b key={`s${popKey}`} className={pop}>
                {s.starts}
              </b>{' '}
              starts
            </span>
            <span>
              <b>{E.streakNow(s)}</b>-day streak
            </span>
          </div>
          <div className="syncrow">
            <p className="sync" aria-live="polite">
              {sync}
            </p>
            <button className="link" onClick={() => settingsRef.current?.showModal()}>
              Settings
            </button>
          </div>
        </section>
      </main>

      <dialog ref={howRef}>
        <h2>How energy works</h2>
        <p>You have exactly 100 energy. It never grows or shrinks. It only changes form, between good and bad.</p>
        <ol>
          <li>Opening a door stakes {E.STAKE} good energy. The black circle is that energy.</li>
          <li>
            Finish the door, or finish the task early, and your stake comes back. You also turn {E.RECOVER} bad energy back
            into good.
          </li>
          <li>Abort, and your whole stake becomes bad energy.</li>
          <li>Every full day with no start, {E.DECAY} good energy decays into bad.</li>
          <li>If good energy hits 0, your streak resets. You can always open a door to climb back.</li>
        </ol>
        <p>No conversion is perfect, so one abort takes about two finished doors to undo.</p>
        <form method="dialog">
          <button className="btn primary" style={{ display: 'block', width: '100%' }}>
            Got it
          </button>
        </form>
      </dialog>

      <dialog ref={settingsRef}>
        <h2>Settings</h2>
        <h3>Sync key</h3>
        <p className="note">Enter the same key on every device to share your energy, starts and streak.</p>
        <div className="fieldset">
          <input
            type="password"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder="Your sync key"
            autoComplete="off"
          />
          <button className="btn quiet" onClick={saveKey}>
            Save key
          </button>
        </div>
        <hr />
        <h3>Notifications</h3>
        <p className="note">
          Get “30 seconds left” and “Door complete” even when Reset Button is closed.
          {iosNeedsInstall &&
            ' On iPhone, first add Reset Button to your Home Screen (Share, then Add to Home Screen) and open it from there.'}
        </p>
        {notif.msg && <p className="note">{notif.msg}</p>}
        <div className="row" style={{ marginBottom: 16 }}>
          <button className="btn quiet" onClick={turnOnNotifications} disabled={!hasKey || !canPush}>
            {notif.on ? 'Reconnect' : 'Turn on'}
          </button>
          <button className="btn quiet" onClick={sendTest} disabled={!hasKey || !notif.on}>
            Send a test
          </button>
        </div>
        {!hasKey && <p className="note">Save your sync key first. Notifications use the same key.</p>}
        <form method="dialog">
          <button className="btn primary" style={{ display: 'block', width: '100%' }}>
            Done
          </button>
        </form>
      </dialog>
    </>
  );
}
