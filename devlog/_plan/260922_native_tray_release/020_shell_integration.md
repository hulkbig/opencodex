# wp2 — Integrate the native popup

Depends on wp1. Preserve the running proxy, menu ownership and main dashboard.

## File changes and before/after

- NEW `desktop/src-tauri/src/native_tray.rs`: macOS-only C ABI owner, one AppHandle binding and managed refresh task/generation. Before: popup show always creates a webview. After: macOS show/toggle obtains existing main tray's NSStatusItem on main thread and invokes Swift; Swift callbacks are marshalled through Tauri main-thread/async APIs. No additional NSApplication, icon, service, account refresh or runtime process.
- NEW `desktop/src-tauri/src/native_tray_data.rs`: GET-only collection using the existing bound ProxyClient. Before: JS fetches config/settings/usage/timeline/account roster. After: Rust selects the same roster endpoints, whitelists display fields and masks emails, filters selected models/hidden providers, emits the wp1 DTO. Preserve partial-section results and fixed human error text; raw server errors/config/credentials never cross the ABI or logs. OpenAI active selection read remains separate and is not inferred if unavailable.
- MODIFY `desktop/src-tauri/src/proxy.rs`: expose the existing identity-checked GET method only `pub(crate)` for the native collector; all auth/redirect/proxy/identity code unchanged.
- MODIFY `desktop/src-tauri/src/lib.rs`: register macOS bridge/data modules and managed native refresh state. Existing startup/exit/update sequence unchanged.
- MODIFY `desktop/src-tauri/src/popup.rs`: macOS show/toggle/hide forward to native adapter; Windows/Linux keep webview implementation. Separate web popup implementation if needed to avoid macOS dead-code warnings and preserve current Rust tests.
- MODIFY `desktop/src-tauri/build.rs`: on macOS compile the native Swift source set into OUT_DIR static archive for Cargo target architecture, deployment macOS 13; emit rerun-if-changed and framework/runtime link search/rpath. Fail build if compiler fails. Non-macOS must not invoke Swift. Prefer direct swiftc (verified), no external dependency/download. Existing tauri_build call remains.
- MODIFY `desktop/scripts/build-local.ts` only if needed: ensure ad-hoc integrity signing of inner CLI and native bundle in local output, then package verified output. Published signing requirements are never relaxed. Add a regression test if behavior changes.
- MODIFY `structure/desktop-shell.md`, `structure/gui-and-management-api.md`, `docs-site/src/content/docs/guides/desktop-app.md`: document native macOS popup and preserved other-platform route, transport/lifecycle ownership and scroll behavior.
- NEW/UPDATE focused tests under `tests/clients/` and both layout manifests if a new root-suite test file is added; use actual bridge/build fixture behavior and DTO tests rather than only string checks.

## Reachable activation cases

Open/show/toggle repeatedly through real tray; close by outside click and Escape; scroll dozens of providers to Dashboard footer; refresh while loading; close during request; reopen gets fresh data without old generation overwrite. Existing runtime absent/binding changed returns honest unavailable, never spawns through popup. Every GET is identity-bound; stale results discarded on close/runtime change. Verify only one polling task while visible, none while hidden. Dashboard/settings navigate the existing main window. Both desktop wallpaper and another window behind popup show one native outline, no square web underlay.

## Acceptance

Swift/Rust tests, cargo fmt/clippy/test, existing desktop runtime/ownership tests, GUI build for remaining platforms, macOS app build, signature validation AND embedded `ocx resolve --json`, installed real UI screenshots and scroll evidence. No full suite claimed here; full release gates belong to wp3. Keep source code, output hashes and actual source revision linked.
