# wp3 — Regression review from 2.59.0

Depends on wp2. Audit actual v2.59.0/main/preview-to-final changes sequentially, with main implementing and reviewing as the user requested.

## File/change map

- READ full `git diff --name-status v2.59.0..<candidate>` and commit log, plus origin/main and origin/preview deltas. Classify each changed owned subsystem into runtime/adapters/provider catalog, ownership/install/update, GUI/desktop/widget, release/CI/docs. Record exact baseline/candidate SHAs and every covered scope in a numbered verification document in this unit.
- MODIFY only a proven regression's owning source, focused regression test and structure doc; add an explicit plan amendment describing trigger, before/after, test and file-size/layout constraints before each repair. No blanket cleanup and no speculative changes. Unreleased security analysis stays in `.tmp/` until shipped.
- MODIFY this unit's `031_verification.md` with sanitized command receipts, failed-case resolution, review limitations and final frozen SHA. Exact-head checks are re-run only when a later delta invalidates their scope.

## Gates

Root `bun run typecheck`, `bun run test`, `bun run privacy:scan`, `bun run structure:check`; GUI `bun test tests`, `bun run lint`, `bun run build`; native executable tests; cargo fmt/clippy/test; widget/local app build and installed smoke. Read scripts/config first and record what each command observes; no vacuous command is a pass.

Hosted PR and merged-dev gates must include all expected jobs and platform legs at the recorded SHA, event, run and attempt. The final suite is the repository's actual defined suite, including indirect/source-oracle tests. Baseline comparison distinguishes preexisting environment failures from regressions with reproduced evidence; do not waive a named failed gate in its own report.

UI matrix: desktop vs window behind, light/dark appearance, long scroll bottom and back, smaller work area, open/close/reopen, error/empty/loading, unavailable quotas and partial usage, settings hide sections/models/providers, refresh once, exit/update/service ownership. Non-macOS UI remains covered by its build and hosted platform tests; report limits where no interactive host is available.

Completion means no known unresolved regression in the audited/tested scope; it is not a mathematical claim that no possible bug exists.
