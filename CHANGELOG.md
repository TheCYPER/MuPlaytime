# Changelog

All notable changes to MuPlaytime are documented here.

## [0.2.0] - 2026-08-20

### Added

- Added a complete mobile experience for creating and joining rooms, browsing shared availability, editing personal schedules, and coordinating game proposals.
- Added mobile-first full-screen sheets for room actions, invitations, selected-time details, schedule corrections, timezone changes, and proposal workflows.
- Added explicit editing and clearing for weekly schedules and date overrides, including cross-midnight and concurrent-update review flows.
- Added proposal history, direct proposal links, per-option responses, flexible reminder thresholds, and clearer offline and retry states.
- Added bilingual responsive, accessibility, large-text, landscape, safe-area, browser-contract, local live, and configured production smoke coverage.

### Changed

- Reworked the Time Loom around absolute UTC selections while preserving each viewer's timezone display and DST choices.
- Reorganized the compact room shell around a mobile header, bottom navigation, and a single coordinated modal surface without changing backend or room authorization contracts.
- Expanded the GitHub Pages verification workflow to run the mobile and desktop browser-contract suite before deployment.

### Fixed

- Fixed mobile overflow, hidden controls, undersized touch targets, focus restoration, virtual-keyboard reachability, and long-name reflow across supported compact viewports.
- Fixed stale schedule edits, offline mutation replay, duplicate multi-day projections, proposal action races, and keyboard activation of the overlap timeline.
