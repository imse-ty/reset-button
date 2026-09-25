# Changelog

## [2.0.0] - 2026-09-25

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

## [0.2.0] - 2021-08-06

### Added

- The button now plays a satisfying sound when pressed. ([#1])
- Haptic feedback on supported devices and browsers. ([#3])

[#1]: https://github.com/imse-ty/reset-button/issues/1
[#3]: https://github.com/imse-ty/reset-button/issues/3

## [0.1.0] - 2021-08-02

Initial development! 🥳🎉
