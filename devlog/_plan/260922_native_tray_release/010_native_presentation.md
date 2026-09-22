# wp1 — Native presentation foundations

Depends on wp0. This cycle delivers native models/views with a narrow ABI, not application activation.

## File changes

- NEW `app/Sources/NativeTray/Models.swift`: `NativeTraySnapshot: Decodable` with `schemaVersion=1`, loading/refreshing flag, bounded section errors, optional updatedAt, display settings, today/thirtyDay `Totals`, model rows, timeline series, provider/account/window rows. All numeric values optional; sanitize nonfinite/negative values, clamp percentages only for bar fill, preserve actual percentages for labels; missing is never zero. Unknown schema is rejected by the update boundary. Pure Foundation formatting of tokens/reset dates.
- NEW `app/Sources/NativeTray/UsageView.swift`: SwiftUI ScrollView in fixed-width bounded native content, Today/30d sections, cached input ratio, output/cost/requests/coverage, model counts/tokens, per-account quotas with reset times, accessible missing/error state, Refresh and Dashboard/Settings actions. Use semantic system fonts/colors, no painted outer background/corner mask. Swift Charts consumes timeline ids/times and honors line/area/stacked style. Split a chart/account view sibling if cohesion/size warrants.
- NEW `app/Sources/NativeTray/Popover.swift`: main-thread controller and `@_cdecl` ABI declarations: show/toggle with borrowed status-item pointer and callback `(Int32)->Void`; hide; update with borrowed UTF-8 JSON copied during the call; visible query. `NSPopover.behavior=.transient`, `NSHostingController`, anchor to status item button, height bounded by the screen visible frame, `.onExitCommand` closes. One controller per app, no timer/network/runtime ownership in Swift.
- MODIFY `app/Package.swift`: add a static NativeTray library target/product and an executable NativeTrayTests target/product following the existing executable-test convention. Existing widget target stays intact; Rust's direct Swift build targets macOS 13 independently of the widget's package minimum.
- NEW `app/Sources/NativeTrayTests/main.swift`: fixture-based schema/number/missing-vs-zero/reset/duplicate-account identity checks, decode fixture identical to Rust wire contract. No real API/Keychain/network use.

## Contract and flow

Rust creates display DTO -> serde_json encodes -> FFI copied Data -> JSONDecoder typed snapshot -> SwiftUI render. `schemaVersion` exists at all four stages. Callback events: 1 opened/refresh, 2 closed, 3 dashboard, 4 settings; producer Swift controller, C integer serialization, Rust exhaustive match with unknown ignored, consumers refresh cancellation/main-window navigation. Unsupported values never become stop/update actions.

## Verification and acceptance

Run the actual Swift executable model tests once created; compile all NativeTray sources for macOS 13 with `swiftc` to prove availability. Fixture cases: missing usage but present quotas; measuredRequests=0; pricedRequests=0; percentages >100; reset timestamps seconds vs milliseconds; unsupported schema; Unicode labels; many accounts. UI interaction waits for wp2's installed native host. Update this plan before deviating from ABI or DTO shape. Do not claim a standalone test proves the actual app path.
