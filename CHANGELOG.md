# Changelog

> Versions jump from 0.2.0 to 0.3.0 despite the size of that release: it was briefly numbered 2.0.0, then 1.0.0, before settling back into the 0.x line since this project has no stability guarantees yet.

## [Unreleased]

### Added

- Reminder notifications between 7am and 7pm in your timezone: a nudge to start something every couple of hours, a morning notice when idle days decayed your energy (or caused heat death), and a 7pm warning if you haven't started yet today.

## [0.4.0] - 2026-09-25

### Added

- Click and release sound effects are back on the button.

### Changed

- The button now behaves like the original fidget toy: a quick tap always plays the click/release sounds without starting anything, and only a hold past ~220ms starts the two-minute door.
- Restored the original bouncy spring animation on press and release.

### Fixed

- Sounds could fail to load or play on the first press, especially on iOS and Android, because audio was only unlocked mid-press. It's now unlocked on any tap, key press or release, matching what touch browsers require.

## [0.3.0] - 2026-09-25

### Added

- The two-minute door: hold to commit, then a radial-wipe countdown.
- Done (finish early) and Abort (two taps).
- A closed 100-unit energy system with staking, recovery, decay and heat death.
- Starts and day streak.
- Sync across devices with a personal sync key.
- Push notifications at 30 seconds left and when a door completes, even with the app closed.
- Installable app (manifest, icons, service worker).
- Screen stays awake during a door.

### Changed

- Upgraded to Next.js 16 and React 19.
- Replaced Tailwind, framer-motion and use-sound with plain CSS and Web Audio.

### Fixed

- The button no longer breaks on iPhone, where `navigator.vibrate` doesn't exist.

## [0.2.1] - 2021-08-22

### Added

- Added instructions how to use the reset button to `README.md`.

## [0.2.0] - 2021-08-06

### Added

- The button now plays a satisfying sound when pressed. ([#1])
- Haptic feedback on supported devices and browsers. ([#3])

[#1]: https://github.com/imse-ty/reset-button/issues/1
[#3]: https://github.com/imse-ty/reset-button/issues/3

## [0.1.0] - 2021-08-02

Initial development! 🥳🎉
