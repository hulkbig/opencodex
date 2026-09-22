# Regression candidate verification

The native tray integration has user acceptance and the evidence recorded in
[021](021_integration_verification.md). This candidate also addresses findings from the
since-v2.59.0 source review and preserves the existing dashboard and runtime ownership.
Detailed security working notes remain outside the tracked tree.

## Verification boundary

The user explicitly prohibited all further local tests and requested a no-verify push on
2026-09-22. The active local GUI suite was terminated (exit143); no result from that interrupted
run is counted as passing. Subsequent verification belongs to hosted CI and read-only review.
The candidate is not release-ready until its exact commit has the required hosted results.

Before that instruction, the original21 failures were resolved and a complete root run passed
28,731 tests. Later focused evidence includes Rust101, Swift121, the Bun updater's12 scenarios,
model migration45, cache/routing41 and release-resume20 tests. Those results are historical,
scoped evidence; they are not presented as a complete final-candidate suite. GUI harness findings
were repaired and React Doctor subsequently reported no issues. The latest dependency audit
reported no high-severity failure. Hosted CI must judge the final committed tree.

Native and web screenshots in evidence/ contain synthetic data. The web scroll checks observed
440px content in500x433 and500x633 Chrome viewports (requested outer window sizes were440x520
and440x720), positive inner scrolling, reachable footer and no outer document overflow. They do
not claim Windows desktop compositor coverage. No new local visual checks run after the prohibition.

## Remaining delivery

The exact-head PR checks, remaining read-only review, merged-dev checks, stable/main and preview
publication, registry tags/assets and final installation evidence remain outstanding. No release
or universal no-regression claim is made by this checkpoint. Follow the user-directed hosted-only
verification path and retain every failed, missing, cancelled or timed-out job as unresolved.
