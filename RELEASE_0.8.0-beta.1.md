# SMS Bridge Client 0.8.0-beta.1 — interface preview

Build: 2026-10-17. URL: https://livesda3-rgb.github.io/sms-bridge/beta/

This release is an explicitly approved interface-only preview. The root client remains 0.7.1 and Android remains unchanged. All displayed messages, numbers and codes are fictional.

## Included

- Compact sender threads, independently grouped by source and SIM.
- Full-screen conversation with chronological bubbles, copy controls and RTL text.
- Persisted read status, multiple selection and mark-as-read.
- Search, unread and SIM filters.
- Light, dark and system themes.
- Five full-screen menu sections and a simulated notification preview.
- Add a demo incoming message to test sorting and unread state.
- Separate PWA manifest, scoped worker and offline shell.

## Isolation

- Stable source files are unchanged. Baseline: ad0b505ce66d496949899c849c2196bc289eff35.
- GitHub recovery branch: backup/client-0.7.1-before-beta.
- Beta uses only localStorage key `smsbridge-beta-ui-v1`.
- No reads or writes to stable IndexedDB, keys, PIN, recipient identity or subscriptions.
- Beta worker scope is `/sms-bridge/beta/`; cache prefix is `smsbridge-beta-ui-`, outside stable cache cleanup.
- No notification permission request or push subscription is made.
- The existing core assembly module is copied unchanged from 0.7.1.

## Deliberately deferred

Real SMS, QR pairing, actual notification permission controls and security configuration are not enabled in the preview. Settings identify these limitations rather than simulating successful operations. A genuine local-notification test remains in the stable client. Android currently routes each SIM to one recipient; simultaneous real delivery to both versions needs a separate decision.

Test the preview on iPhone before approving any replacement of the main client. Browser automation cannot confirm actual iOS installation behavior or real push latency.

Rollback of this additive preview consists of reverting its commit or removing only `docs/beta/`. Never clear stable storage, unregister the root worker, or delete the main PWA as part of beta testing.
