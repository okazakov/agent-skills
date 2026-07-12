## Issue tracker

This repo uses local markdown for issue tracking. Durable PRDs live in `docs/prds/`, durable implementation issues live in `docs/issues/`, and temporary workspace holds no durable tickets. See `docs/agents/issue-tracker.md`.

Implementation issues also progress through a status board under `docs/issue-tracker/`. The canonical ticket files stay flat and immutable in `docs/issues/` and are the committed source of truth (always reference tickets by their `docs/issues/NN-slug.md` path, never a board path). The board holds only phase folders (`00-triage`, `10-ready`, `20-in-progress`, `30-blocked`, `40-in-review`, `50-done`, `wontfix`) and is a local, gitignored, rebuildable hard-link view: each ticket is hard-linked into the folder matching its `Status:` line. Change a ticket's phase by editing its `Status:` line and rebuilding the board. See `docs/agents/issue-tracker.md` for the full workflow.

## Triage labels

The local issue tracker uses triage statuses (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) plus lifecycle statuses (`in-progress`, `blocked`, `in-review`, `done`). See `docs/agents/triage-labels.md`.
