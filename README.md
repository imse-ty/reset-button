# Reset Button

[resetbutton.imsety.com](https://resetbutton.imsety.com)

A satisfying "reset" button that helps me focus on my goals. Part of Project Reset.

## How to use it

1. Pick one *single* task and, if you like, the first tiny step.
2. Hold the button. The ring fills and 10 good energy is staked.
3. The button becomes a two-minute door that radial-wipes down.
4. Finish (at zero, or early with **Done**) to get your stake back plus 6 energy recovered. **Abort** turns the stake into bad energy.

## The energy system

There are exactly 100 energy units, split between good, bad and staked. Energy only moves between forms:

| Event | Energy movement |
| --- | --- |
| Open a door | 10 good → staked |
| Finish (on time or early) | staked → good, then 6 bad → good |
| Abort | staked → bad |
| Each full day with no start | 3 good → bad |
| Good hits 0 | Streak resets (heat death). A free door is always available. |

The rules live in `lib/energy.js` as pure functions.

## Setup

### 1. Services (all have free tiers)

- **Upstash Redis:** stores your energy system and push subscriptions. On Vercel, add it from the Marketplace (Storage tab) and the env vars are filled in for you.
- **Upstash QStash:** delivers the "30 seconds left" and "Door complete" pushes at the right second, even with the app closed. Copy the token and both signing keys from the QStash console.

### 2. Environment variables

Copy `.env.example` to `.env.local` for local work, and add the same values in Vercel → Settings → Environment Variables.

- `RESET_KEY`: make up a long random string. You'll enter it once on each device in Settings.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: run `npm run vapid` once and paste the two keys.
- `VAPID_SUBJECT`: `mailto:` plus your email.
- Upstash Redis and QStash values from step 1.
- `APP_URL`: `https://resetbutton.imsety.com`

### 3. Deploy

Push to GitHub and let Vercel deploy it. Then on each device:

1. Open the site, tap **Settings**, and save your sync key.
2. Tap **Turn on** under Notifications, then **Send a test**.
3. **iPhone:** first tap Share → Add to Home Screen, open Reset from the Home Screen, then do steps 1 and 2 there. iOS only allows web push for installed apps (iOS 16.4+).

## How the away notifications work

Pushes are only queued while the app is out of view, so you don't get notified about a timer you're watching.

1. When the app is hidden or closed mid-door, it tells `/api/door/schedule` when the door ends.
2. The server queues two QStash messages, for 30 seconds before the end and for the end itself.
3. When the app comes back into view, or the door ends early, `/api/door/cancel` removes them.
4. At the scheduled time QStash calls `/api/door/fire`, which checks the door is still running and pushes to every device you've turned notifications on for.

Closing the app never ends a door. It completes and is banked the next time you open Reset Button on any device.

## Daily reminders

Turning on notifications also creates one hourly QStash schedule (`reset-remind`) that calls `/api/remind`. Between 7am and 7pm in your timezone (taken from the device that last tapped **Turn on**), it sends at most one of these per hour:

| When | Reminder |
| --- | --- |
| 7am, if idle days cost you energy | "Energy decayed" (or "Heat death" if good energy hit 0) |
| 7pm, if you haven't started today | "No start today yet", with what you'll lose at midnight |
| Any hour, at least 2 hours after your last reminder or finished door | "Time to start something" |

Nothing is sent while a door is running. The hours and gap live in `lib/reminders.js`. To stop reminders, delete the `reset-remind` schedule in the QStash console. It's recreated the next time you tap **Turn on** or **Reconnect**.

## Development

```bash
npm install
npm run dev
```

QStash can't reach `localhost`, so test away notifications on a deployed preview.
