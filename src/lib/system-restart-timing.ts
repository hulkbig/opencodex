/** Active turns and pre-existing scoped drains get this grace from restart acceptance. */
export const RESTART_DRAIN_GRACE_MS = 2_000;
/** Terminal cleanup watchdog; also part of the CLI/tray restart observation budget. */
export const MEMORY_DRAIN_RESTART_MS = 60_000;
/** Replacement startup has its own budget; short drain grace does not guarantee short downtime. */
export const REPLACEMENT_READY_TIMEOUT_MS = 70_000;
